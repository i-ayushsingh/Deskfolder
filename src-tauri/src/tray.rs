// ============================================================
// DeskFolder — System Tray Setup
// ============================================================

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let item_open = MenuItem::with_id(app, "open", "Manage folders (Dashboard)", true, None::<&str>)?;
    let item_quit = MenuItem::with_id(app, "quit", "Quit DeskFolder", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&item_open, &item_quit])?;

    let icon = if let Some(i) = app.default_window_icon() {
        i.clone()
    } else {
        let png_bytes = include_bytes!("../icons/32x32.png");
        tauri::image::Image::from_bytes(png_bytes)
            .map_err(|e| tauri::Error::AssetNotFound(format!("Failed to load tray icon: {}", e)))?
    };

    let _tray = TrayIconBuilder::with_id("main-tray")
        .tooltip("DeskFolder — click to open dashboard")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.unminimize();
                    let _ = win.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            match event {
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
                | TrayIconEvent::DoubleClick {
                    button: MouseButton::Left,
                    ..
                } => {
                    let app = tray.app_handle();
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.show();
                        let _ = win.unminimize();
                        let _ = win.set_focus();
                    }
                }
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}
