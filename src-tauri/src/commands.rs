// ============================================================
// DeskFolder — Tauri Commands Bridge
// ============================================================
//
// Exposes all authoritative Rust state mutations, window positioning,
// application launching, and shortcut operations to the frontend.

use crate::config;
use crate::icons;
use crate::launcher;
use crate::models::{AppEntry, Folder, FoldersConfig};
use crate::state::{AppEntryPatch, AppState};
use tauri::{AppHandle, Emitter, Manager, State};

/// Load authoritative state from Rust.
#[tauri::command]
pub fn load_state(state: State<'_, AppState>) -> Result<FoldersConfig, String> {
    Ok(state.get_config())
}

/// Create a new folder with an automatic desktop shortcut.
#[tauri::command]
pub fn create_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
) -> Result<Folder, String> {
    state.create_folder(&app, name)
}

/// Rename an existing folder and update desktop shortcut metadata.
#[tauri::command]
pub fn rename_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> Result<Folder, String> {
    state.rename_folder(&app, id, name)
}

/// Delete a folder and remove its desktop shortcut.
#[tauri::command]
pub fn delete_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    state.delete_folder(&app, id)
}

/// Add an application entry into a folder.
#[tauri::command]
pub fn add_app(
    app: AppHandle,
    state: State<'_, AppState>,
    folder_id: String,
    name: String,
    path: String,
    arguments: Option<String>,
    working_dir: Option<String>,
    icon: String,
) -> Result<AppEntry, String> {
    state.add_app(&app, folder_id, name, path, arguments, working_dir, icon)
}

/// Update an application entry.
#[tauri::command]
pub fn update_app(
    app: AppHandle,
    state: State<'_, AppState>,
    folder_id: String,
    app_id: String,
    patch: AppEntryPatch,
) -> Result<AppEntry, String> {
    state.update_app(&app, folder_id, app_id, patch)
}

/// Remove an application entry from a folder.
#[tauri::command]
pub fn remove_app(
    app: AppHandle,
    state: State<'_, AppState>,
    folder_id: String,
    app_id: String,
) -> Result<(), String> {
    state.remove_app(&app, folder_id, app_id)
}

/// Reorder application entries in a folder.
#[tauri::command]
pub fn reorder_apps(
    app: AppHandle,
    state: State<'_, AppState>,
    folder_id: String,
    ordered_ids: Vec<String>,
) -> Result<(), String> {
    state.reorder_apps(&app, folder_id, ordered_ids)
}

/// Deterministic open folder sequence.
#[tauri::command]
pub fn open_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    folder_id: String,
) -> Result<(), String> {
    state.open_folder(&app, &folder_id, None)
}

/// Close and hide the overlay window.
#[tauri::command]
pub fn close_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("overlay") {
        let _ = win.hide();
    }
    Ok(())
}

/// Show the settings / dashboard window.
#[tauri::command]
pub fn show_dashboard(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.show().map_err(|e| format!("show dashboard: {}", e))?;
        win.set_focus().map_err(|e| format!("focus dashboard: {}", e))?;
    }
    Ok(())
}

/// Hide the settings / dashboard window.
#[tauri::command]
pub fn hide_dashboard(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.hide().map_err(|e| format!("hide dashboard: {}", e))?;
    }
    Ok(())
}

/// Minimize the settings / dashboard window.
#[tauri::command]
pub fn minimize_dashboard(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.minimize().map_err(|e| format!("minimize dashboard: {}", e))?;
    }
    Ok(())
}

/// Toggle maximize / unmaximize for the dashboard window.
#[tauri::command]
pub fn toggle_maximize_dashboard(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        let is_max = win.is_maximized().unwrap_or(false);
        if is_max {
            win.unmaximize().map_err(|e| format!("unmaximize dashboard: {}", e))?;
        } else {
            win.maximize().map_err(|e| format!("maximize dashboard: {}", e))?;
        }
    }
    Ok(())
}

/// Show dashboard and open editor modal for a specific folder.
#[tauri::command]
pub fn edit_folder_in_dashboard(app: AppHandle, folder_id: String) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
        let _ = win.emit("open-edit-folder", folder_id);
    }
    Ok(())
}

/// Show dashboard and open add app dialog for a specific folder.
#[tauri::command]
pub fn add_app_in_dashboard(app: AppHandle, folder_id: String) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
        let _ = win.emit("open-add-app-folder", folder_id);
    }
    Ok(())
}

/// Save or update an entire folder (including apps, customization, name, icons).
#[tauri::command]
pub fn save_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    folder: Folder,
) -> Result<Folder, String> {
    state.save_folder(&app, folder)
}

/// Validate application target path existence.
#[tauri::command]
pub fn validate_app(path: String) -> Result<bool, String> {
    Ok(launcher::validate_target(&path))
}

/// Repair missing or broken desktop shortcut.
#[tauri::command]
pub fn repair_shortcut(
    app: AppHandle,
    state: State<'_, AppState>,
    folder_id: String,
) -> Result<String, String> {
    state.repair_shortcut(&app, folder_id)
}

/// Reorder folders for dashboard display.
#[tauri::command]
pub fn reorder_folders(
    app: AppHandle,
    state: State<'_, AppState>,
    ordered_ids: Vec<String>,
) -> Result<(), String> {
    state.reorder_folders(&app, ordered_ids)
}

/// Reveal an executable or shortcut in Windows File Explorer.
#[tauri::command]
pub fn reveal_in_explorer(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let clean_path = path.replace('/', "\\");
        Command::new("explorer")
            .arg(format!("/select,{}", clean_path))
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Failed to reveal in explorer: {}", e))?;
    }
    Ok(())
}

/// Open a URL in the user's default web browser.
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        Command::new("cmd")
            .args(&["/c", "start", "", &url])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }
    #[cfg(not(windows))]
    {
        let _ = open::that(&url);
    }
    Ok(())
}

/// Launch application detached from DeskFolder.
#[tauri::command]
pub fn launch_app(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    arguments: Option<String>,
    working_dir: Option<String>,
    folder_id: Option<String>,
    app_id: Option<String>,
) -> Result<(), String> {
    if let (Some(fid), Some(aid)) = (folder_id, app_id) {
        state.record_app_launch(&app, &fid, &aid);
    }
    launcher::launch_app(&path, arguments.as_deref(), working_dir.as_deref())
}

/// Extract icon from .exe or .lnk asynchronously and cache as PNG.
#[tauri::command]
pub async fn extract_icon(app: AppHandle, target_path: String) -> Result<String, String> {
    std::thread::spawn(move || icons::extract_icon(&app, &target_path))
        .join()
        .map_err(|_| "Icon extraction thread panicked".to_string())?
}

/// Export configuration to a file.
#[tauri::command]
pub fn export_config(
    app: AppHandle,
    state: State<'_, AppState>,
    destination_path: String,
) -> Result<(), String> {
    let cfg = state.get_config();
    config::export_config(&app, &destination_path, &cfg)
}

/// Import configuration from a file and reconcile desktop shortcuts.
#[tauri::command]
pub fn import_config(
    app: AppHandle,
    state: State<'_, AppState>,
    source_path: String,
) -> Result<FoldersConfig, String> {
    let mut imported = config::import_config(&app, &source_path)?;
    // Reconcile desktop shortcuts for all imported folders (Fix B8)
    for folder in imported.folders.values_mut() {
        if let Ok(sc_path) = crate::shortcut::create_or_update(&app, folder) {
            folder.shortcut_path = Some(sc_path.to_string_lossy().to_string());
            folder.shortcut_status = Some("ok".to_string());
        }
    }
    state.persist_and_broadcast(&app, imported.clone())?;
    Ok(imported)
}

/// Handshake from overlay WebView signaling ready state.
#[tauri::command]
pub fn overlay_ready(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state.handle_overlay_ready(&app);
    Ok(())
}

/// Exit the entire DeskFolder process.
#[tauri::command]
pub fn quit_app(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

/// Retrieve the Windows 11 system accent color hex code.
#[tauri::command]
pub fn get_system_accent() -> Result<String, String> {
    Ok(crate::system::get_system_accent_color())
}

/// Retrieve installed applications from Windows Start Menu and Desktop (cached, with optional rescan).
#[tauri::command]
pub async fn get_installed_apps(
    app: AppHandle,
    force_refresh: Option<bool>,
) -> Result<Vec<crate::system::InstalledAppEntry>, String> {
    let refresh = force_refresh.unwrap_or(false);
    let handle = app.clone();
    std::thread::spawn(move || {
        let state = handle.state::<AppState>();
        state.get_or_scan_installed_apps(&handle, refresh)
    })
    .join()
    .map_err(|_| "Installed apps scan thread panicked".to_string())
}
