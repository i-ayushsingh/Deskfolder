// ============================================================
// DeskFolder — Desktop Shell Right-Click Interceptor & Single Click
// ============================================================

use std::sync::atomic::{AtomicPtr, Ordering};
use tauri::{AppHandle, Manager};
use crate::state::AppState;

static APP_HANDLE: AtomicPtr<AppHandle> = AtomicPtr::new(std::ptr::null_mut());

pub fn init_hook(app: &AppHandle) {
    let boxed = Box::new(app.clone());
    let ptr = Box::into_raw(boxed);
    APP_HANDLE.store(ptr, Ordering::SeqCst);

    std::thread::spawn(|| {
        #[cfg(windows)]
        unsafe {
            run_hook_loop();
        }
    });
}

#[cfg(windows)]
static mut HOOK: windows::Win32::UI::WindowsAndMessaging::HHOOK =
    windows::Win32::UI::WindowsAndMessaging::HHOOK(std::ptr::null_mut());

#[cfg(windows)]
unsafe fn find_folder_at_point(pt: windows::Win32::Foundation::POINT) -> Option<(String, String)> {
    use windows::Win32::UI::Accessibility::{AccessibleObjectFromPoint, IAccessible};
    use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, WindowFromPoint};

    let hwnd = WindowFromPoint(pt);
    if hwnd.0.is_null() {
        return None;
    }

    let mut class_name = [0u16; 256];
    let len = GetClassNameW(hwnd, &mut class_name);
    if len == 0 {
        return None;
    }
    let class_str = String::from_utf16_lossy(&class_name[..len as usize]);
    let is_desktop = class_str.eq_ignore_ascii_case("SysListView32")
        || class_str.eq_ignore_ascii_case("DirectUIHWND")
        || class_str.eq_ignore_ascii_case("SHELLDLL_DefView")
        || class_str.eq_ignore_ascii_case("WorkerW")
        || class_str.eq_ignore_ascii_case("Progman");

    if !is_desktop {
        return None;
    }

    let mut acc: Option<IAccessible> = None;
    let mut var_child = std::mem::zeroed();
    if AccessibleObjectFromPoint(pt, &mut acc, &mut var_child).is_ok() {
        if let Some(acc_obj) = acc {
            if let Ok(bstr) = acc_obj.get_accName(&var_child) {
                let name = bstr.to_string().trim().to_string();
                let app_ptr = APP_HANDLE.load(Ordering::SeqCst);
                if !app_ptr.is_null() {
                    let app = &*app_ptr;
                    let state = app.state::<AppState>();
                    let cfg = state.get_config();
                    for (id, folder) in &cfg.folders {
                        let clean = crate::shortcut::sanitize_name(&folder.name);
                        if folder.name.eq_ignore_ascii_case(&name)
                            || clean.eq_ignore_ascii_case(&name)
                            || name.eq_ignore_ascii_case(&format!("{}.lnk", folder.name))
                            || name.eq_ignore_ascii_case(&format!("{}.lnk", clean))
                        {
                            return Some((id.clone(), folder.name.clone()));
                        }
                    }
                }
            }
        }
    }
    None
}

#[cfg(windows)]
unsafe extern "system" fn mouse_hook_proc(
    n_code: i32,
    w_param: windows::Win32::Foundation::WPARAM,
    l_param: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::Foundation::{LRESULT, POINT};
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, MSLLHOOKSTRUCT, WM_LBUTTONUP, WM_RBUTTONDOWN, WM_RBUTTONUP,
    };

    if n_code >= 0 {
        let msg = w_param.0 as u32;
        let ms = *(l_param.0 as *const MSLLHOOKSTRUCT);
        let pt = POINT {
            x: ms.pt.x,
            y: ms.pt.y,
        };

        if msg == WM_RBUTTONDOWN || msg == WM_RBUTTONUP {
            if let Some((folder_id, _folder_name)) = find_folder_at_point(pt) {
                if msg == WM_RBUTTONUP {
                    let app_ptr = APP_HANDLE.load(Ordering::SeqCst);
                    if !app_ptr.is_null() {
                        let app = &*app_ptr;
                        let state = app.state::<AppState>();
                        let _ = state.open_desktop_context_menu(app, &folder_id, (pt.x, pt.y));
                    }
                }
                // Suppress Windows Explorer default 30-item context menu!
                return LRESULT(1);
            }
        } else if msg == WM_LBUTTONUP {
            // Single-click support for opening desktop folders
            if let Some((folder_id, _folder_name)) = find_folder_at_point(pt) {
                let app_ptr = APP_HANDLE.load(Ordering::SeqCst);
                if !app_ptr.is_null() {
                    let app = &*app_ptr;
                    let state = app.state::<AppState>();
                    state.request_open_folder(app, folder_id, Some((pt.x, pt.y)));
                }
            }
        }
    }

    CallNextHookEx(HOOK, n_code, w_param, l_param)
}

#[cfg(windows)]
unsafe fn run_hook_loop() {
    use windows::Win32::UI::WindowsAndMessaging::{
        DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage, MSG, WH_MOUSE_LL,
    };

    HOOK = SetWindowsHookExW(
        WH_MOUSE_LL,
        Some(mouse_hook_proc),
        windows::Win32::Foundation::HINSTANCE(std::ptr::null_mut()),
        0,
    )
    .unwrap_or(windows::Win32::UI::WindowsAndMessaging::HHOOK(std::ptr::null_mut()));

    if !HOOK.0.is_null() {
        eprintln!("[DeskFolder] Desktop mouse interceptor installed successfully.");
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, windows::Win32::Foundation::HWND(std::ptr::null_mut()), 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    } else {
        eprintln!("[DeskFolder] Warning: Failed to install WH_MOUSE_LL hook.");
    }
}
