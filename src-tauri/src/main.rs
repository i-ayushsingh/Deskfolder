// ============================================================
// DeskFolder — Binary entry point
// ============================================================
//
// Explicit AppUserModelID registration before any window creation
// ensures taskbar uses DeskFolder's official logo.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(windows)]
    {
        use windows::core::HSTRING;
        use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;
        unsafe {
            let id = HSTRING::from("com.deskfolder.app");
            let _ = SetCurrentProcessExplicitAppUserModelID(&id);
        }
    }

    deskfolder_lib::run();
}
