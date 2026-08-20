// ============================================================
// DeskFolder — Windows Desktop Shortcut (.lnk) Engine
// ============================================================
//
// Manages desktop shortcuts with user-friendly naming:
//   Filename: `<folder_name>.lnk`
//   Arguments: `--open-folder "<folder_id>"`
//   Description: "DeskFolder: <folder_name>"
//   Icon: Generated 2x2 grid or custom .ico

use crate::models::Folder;
use lnks::{Icon, ShortcutBuilder};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Sanitize display strings for Windows compatibility and descriptions.
pub fn sanitize_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' | '\0'..='\x1f' => ' ',
            _ => c,
        })
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        "Folder".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Resolve the user's Desktop directory.
pub fn desktop_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(d) = app.path().desktop_dir() {
        if d.exists() {
            return Ok(d);
        }
    }
    #[cfg(windows)]
    {
        if let Ok(user_profile) = std::env::var("USERPROFILE") {
            let p = PathBuf::from(user_profile).join("Desktop");
            if p.exists() {
                return Ok(p);
            }
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        return Ok(PathBuf::from(home).join("Desktop"));
    }
    Err("Unable to locate Desktop directory".to_string())
}

/// Get the desktop shortcut path for a folder based on its name.
pub fn shortcut_path_for_folder(app: &AppHandle, folder: &Folder) -> Result<PathBuf, String> {
    let desk = desktop_dir(app)?;
    let clean_name = sanitize_name(&folder.name);
    Ok(desk.join(format!("{}.lnk", clean_name)))
}

/// Legacy filename helper for backward cleanup.
pub fn legacy_shortcut_path(app: &AppHandle, folder_id: &str) -> Result<PathBuf, String> {
    let desk = desktop_dir(app)?;
    let safe_id: String = folder_id
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    Ok(desk.join(format!("DeskFolder_{}.lnk", safe_id)))
}

/// Create or update a desktop shortcut for a folder with custom/grid icon.
pub fn create_or_update(app: &AppHandle, folder: &Folder) -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("current_exe: {}", e))?;
    let lnk_path = shortcut_path_for_folder(app, folder)?;
    let clean_name = sanitize_name(&folder.name);

    // Clean up old shortcut if name changed
    if let Some(old_path) = &folder.shortcut_path {
        let old_p = Path::new(old_path);
        if old_p.exists() && old_p != lnk_path {
            let _ = std::fs::remove_file(old_p);
        }
    }

    // Clean up legacy DeskFolder_<id>.lnk if it exists
    if let Ok(legacy_p) = legacy_shortcut_path(app, &folder.id) {
        if legacy_p.exists() && legacy_p != lnk_path {
            let _ = std::fs::remove_file(&legacy_p);
        }
    }

    // Generate or fetch the 2x2 grid / custom icon .ico file
    let icon_obj = match crate::icons::generate_folder_icon_ico(app, folder) {
        Ok(ico_path) => Icon::with_index(ico_path, 0),
        Err(_) => Icon::with_index(exe.clone(), 0),
    };

    let link = ShortcutBuilder::new(&exe)
        .arguments(format!("--open-folder \"{}\"", folder.id))
        .description(format!("DeskFolder: {}", clean_name))
        .icon(icon_obj)
        .build();

    link.save(&lnk_path)
        .map_err(|e| format!("failed to save shortcut at {:?}: {}", lnk_path, e))?;

    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows::Win32::UI::Shell::{SHChangeNotify, SHCNE_UPDATEITEM, SHCNF_PATHW};
        let wide: Vec<u16> = lnk_path.as_os_str().encode_wide().chain(Some(0)).collect();
        unsafe {
            SHChangeNotify(
                SHCNE_UPDATEITEM,
                SHCNF_PATHW,
                Some(wide.as_ptr() as *const _),
                None,
            );
        }
    }

    Ok(lnk_path)
}

/// Remove the desktop shortcut associated with a folder.
pub fn remove(app: &AppHandle, folder: &Folder) -> Result<(), String> {
    // Try stored path first
    if let Some(stored_path) = &folder.shortcut_path {
        let p = Path::new(stored_path);
        if p.exists() {
            let _ = std::fs::remove_file(p);
            #[cfg(windows)]
            {
                use std::os::windows::ffi::OsStrExt;
                use windows::Win32::UI::Shell::{SHChangeNotify, SHCNE_DELETE, SHCNF_PATHW};
                let wide: Vec<u16> = p.as_os_str().encode_wide().chain(Some(0)).collect();
                unsafe {
                    SHChangeNotify(
                        SHCNE_DELETE,
                        SHCNF_PATHW,
                        Some(wide.as_ptr() as *const _),
                        None,
                    );
                }
            }
        }
    }

    // Also check current name-based path
    if let Ok(lnk_path) = shortcut_path_for_folder(app, folder) {
        if lnk_path.exists() {
            let _ = std::fs::remove_file(&lnk_path);
            #[cfg(windows)]
            {
                use std::os::windows::ffi::OsStrExt;
                use windows::Win32::UI::Shell::{SHChangeNotify, SHCNE_DELETE, SHCNF_PATHW};
                let wide: Vec<u16> = lnk_path.as_os_str().encode_wide().chain(Some(0)).collect();
                unsafe {
                    SHChangeNotify(
                        SHCNE_DELETE,
                        SHCNF_PATHW,
                        Some(wide.as_ptr() as *const _),
                        None,
                    );
                }
            }
        }
    }

    // Also check legacy ID-based path
    if let Ok(legacy_p) = legacy_shortcut_path(app, &folder.id) {
        if legacy_p.exists() {
            let _ = std::fs::remove_file(&legacy_p);
        }
    }

    Ok(())
}

/// Helper remove by ID (looks up in config or removes legacy).
pub fn remove_by_id(app: &AppHandle, folder_id: &str) -> Result<(), String> {
    if let Ok(legacy_p) = legacy_shortcut_path(app, folder_id) {
        if legacy_p.exists() {
            let _ = std::fs::remove_file(&legacy_p);
        }
    }
    Ok(())
}

/// Repair or recreate a missing shortcut.
pub fn repair(app: &AppHandle, folder: &Folder) -> Result<PathBuf, String> {
    create_or_update(app, folder)
}

/// Check if the shortcut for a folder currently exists on the Desktop.
pub fn exists(app: &AppHandle, folder: &Folder) -> bool {
    if let Some(stored) = &folder.shortcut_path {
        if Path::new(stored).exists() {
            return true;
        }
    }
    if let Ok(path) = shortcut_path_for_folder(app, folder) {
        path.exists()
    } else {
        false
    }
}
