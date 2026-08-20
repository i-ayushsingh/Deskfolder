// ============================================================
// DeskFolder — Core Application Runtime
// ============================================================

pub mod commands;
pub mod config;
pub mod hook;
pub mod icons;
pub mod launcher;
pub mod models;
pub mod monitor;
pub mod shortcut;
pub mod state;
pub mod system;
pub mod tray;

#[cfg(test)]
mod tests;

use state::AppState;
use tauri::Manager;

pub fn parse_open_folder_arg(argv: &[String]) -> Option<String> {
    let mut iter = argv.iter();
    while let Some(a) = iter.next() {
        if a == "--open-folder" {
            if let Some(v) = iter.next() {
                return Some(v.trim_matches('"').to_string());
            }
        } else if let Some(v) = a.strip_prefix("--open-folder=") {
            return Some(v.trim_matches('"').to_string());
        }
    }
    None
}

pub fn has_dashboard_arg(argv: &[String]) -> bool {
    argv.iter().any(|a| a == "--dashboard" || a == "-d")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    eprintln!("[DeskFolder] Starting run()...");
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let cursor = crate::monitor::get_cursor_pos().ok();
            let state = app.state::<AppState>();
            if let Some(folder_id) = parse_open_folder_arg(&argv) {
                state.request_open_folder(app, folder_id, cursor);
            } else {
                // Default action for secondary instance without args: show dashboard
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.unminimize();
                    let _ = win.set_always_on_top(true);
                    let _ = win.set_focus();
                    let _ = win.set_always_on_top(false);
                }
            }
        }))
        .manage(AppState::new(crate::models::FoldersConfig::default()))
        .invoke_handler(tauri::generate_handler![
            commands::load_state,
            commands::create_folder,
            commands::rename_folder,
            commands::delete_folder,
            commands::save_folder,
            commands::add_app,
            commands::update_app,
            commands::remove_app,
            commands::reorder_apps,
            commands::open_folder,
            commands::close_overlay,
            commands::show_dashboard,
            commands::hide_dashboard,
            commands::minimize_dashboard,
            commands::toggle_maximize_dashboard,
            commands::validate_app,
            commands::repair_shortcut,
            commands::launch_app,
            commands::extract_icon,
            commands::export_config,
            commands::import_config,
            commands::edit_folder_in_dashboard,
            commands::get_system_accent,
            commands::get_installed_apps,
            commands::reorder_folders,
            commands::reveal_in_explorer,
            commands::open_url,
            commands::overlay_ready,
            commands::quit_app,
        ])
        .setup(|app| {
            eprintln!("[DeskFolder] .setup() starting...");

            #[cfg(windows)]
            {
                use windows::core::HSTRING;
                use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;
                unsafe {
                    let id = HSTRING::from("com.deskfolder.desktop");
                    let _ = SetCurrentProcessExplicitAppUserModelID(&id);
                }
            }

            // Hydrate state from disk with recovery
            let mut loaded_config = config::load(app.handle()).unwrap_or_default();
            
            // Clean up any nested DeskFolder shortcuts from existing groups
            for folder in loaded_config.folders.values_mut() {
                folder.apps.retain(|app_entry| {
                    let p = app_entry.path.to_lowercase();
                    !p.contains("deskfolder.exe") && !folder.name.eq_ignore_ascii_case(&app_entry.name)
                });
            }

            let state = app.state::<AppState>();
            if let Ok(mut lock) = state.config.write() {
                *lock = loaded_config.clone();
            }
            let _ = config::save(app.handle(), &loaded_config);

            // Refresh icon cache directory for full 256x256 high-resolution rendering
            if let Ok(cache_dir) = icons::icon_cache_dir(app.handle()) {
                let _ = std::fs::remove_dir_all(&cache_dir);
                let _ = std::fs::create_dir_all(&cache_dir);
            }

            // Setup system tray
            eprintln!("[DeskFolder] Calling tray::setup...");
            if let Err(e) = tray::setup(app.handle()) {
                eprintln!("[DeskFolder] Tray setup error: {}", e);
            } else {
                eprintln!("[DeskFolder] Tray setup SUCCESSFUL");
            }

            // Initialize desktop right-click interceptor and single-click hook
            hook::init_hook(app.handle());

            // Parse initial command line arguments
            let argv: Vec<String> = std::env::args().collect();
            let target_folder = parse_open_folder_arg(&argv);
            let startup_cursor = crate::monitor::get_cursor_pos().ok();
            eprintln!("[DeskFolder] argv: {:?}, target_folder: {:?}", argv, target_folder);

            if let Some(folder_id) = target_folder {
                state.request_open_folder(app.handle(), folder_id, startup_cursor);
            } else {
                if let Some(main_win) = app.get_webview_window("main") {
                    eprintln!("[DeskFolder] Showing and focusing main window...");
                    let _ = main_win.show();
                    let _ = main_win.unminimize();
                    let _ = main_win.set_always_on_top(true);
                    let _ = main_win.set_focus();
                    let _ = main_win.set_always_on_top(false);
                } else {
                    eprintln!("[DeskFolder] ERROR: 'main' webview window not found!");
                }
            }

            // Background validation of apps and shortcuts + warm up installed apps cache
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let state = handle.state::<AppState>();
                let _ = state.validate_all_apps(&handle);
                // Pre-scan and cache installed apps with real icons in background
                let _ = state.get_or_scan_installed_apps(&handle, false);
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running DeskFolder");
}
