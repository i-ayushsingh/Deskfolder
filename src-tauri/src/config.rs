// ============================================================
// DeskFolder — Configuration & Persistence Engine
// ============================================================
//
// Manages reading, writing, migration, backup, and recovery of `folders.json`.
// Implements safe atomic replacement on Windows, schema versioning, and
// automatic fallback to `folders.json.bak` when corruption is detected.

use crate::models::{AppEntry, Folder, FoldersConfig};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

/// Return the directory for application data (%APPDATA%\com.deskfolder.app or %APPDATA%\DeskFolder).
pub fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir failed: {}", e))?;
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir failed: {}", e))?;
    Ok(dir)
}

/// Primary configuration file path.
pub fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_data_dir(app)?;
    Ok(dir.join("folders.json"))
}

/// Backup configuration file path.
pub fn backup_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_data_dir(app)?;
    Ok(dir.join("folders.json.bak"))
}

/// Load configuration with automatic recovery from backup and schema migration.
pub fn load(app: &AppHandle) -> Result<FoldersConfig, String> {
    let path = config_path(app)?;
    let backup_path = backup_config_path(app)?;

    if !path.exists() {
        if backup_path.exists() {
            if let Ok(cfg) = load_and_migrate_file(&backup_path) {
                let _ = save(app, &cfg);
                return Ok(cfg);
            }
        }
        return Ok(FoldersConfig::default());
    }

    match load_and_migrate_file(&path) {
        Ok(cfg) => Ok(cfg),
        Err(err) => {
            eprintln!("[DeskFolder] Primary config corrupt: {}. Attempting backup recovery...", err);
            if backup_path.exists() {
                if let Ok(backup_cfg) = load_and_migrate_file(&backup_path) {
                    eprintln!("[DeskFolder] Successfully restored state from backup config.");
                    let _ = save(app, &backup_cfg);
                    return Ok(backup_cfg);
                }
            }
            eprintln!("[DeskFolder] Backup also failed. Returning clean default state without crashing.");
            Ok(FoldersConfig::default())
        }
    }
}

/// Parse and migrate a configuration file from a specific path.
pub fn load_and_migrate_file(path: &Path) -> Result<FoldersConfig, String> {
    let raw = fs::read_to_string(path).map_err(|e| format!("read failed for {:?}: {}", path, e))?;
    
    // First try raw deserialization
    if let Ok(mut cfg) = serde_json::from_str::<FoldersConfig>(&raw) {
        if cfg.version < 2 {
            cfg = migrate_v1_to_v2(cfg);
        }
        return Ok(cfg);
    }

    // Fallback: try parsing generic JSON if schema changed
    let val: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| format!("JSON parse failed for {:?}: {}", path, e))?;

    let version = val.get("version").and_then(|v| v.as_u64()).unwrap_or(1) as u32;
    let folders_val = val.get("folders").cloned().unwrap_or(serde_json::Value::Object(serde_json::Map::new()));

    let mut folders = std::collections::HashMap::new();
    if let serde_json::Value::Object(map) = folders_val {
        for (k, v) in map {
            if let Ok(folder) = serde_json::from_value::<Folder>(v.clone()) {
                folders.insert(k, folder);
            } else if let Some(obj) = v.as_object() {
                // Manually salvage folder fields
                let id = obj.get("id").and_then(|s| s.as_str()).unwrap_or(&k).to_string();
                let name = obj.get("name").and_then(|s| s.as_str()).unwrap_or("Recovered Folder").to_string();
                let created_at = obj
                    .get("createdAt")
                    .and_then(|s| s.as_str())
                    .unwrap_or("2026-01-01T00:00:00Z")
                    .to_string();
                let apps_raw = obj.get("apps").and_then(|a| a.as_array());

                let mut apps = Vec::new();
                if let Some(app_arr) = apps_raw {
                    for a in app_arr {
                        if let Ok(app_entry) = serde_json::from_value::<AppEntry>(a.clone()) {
                            apps.push(app_entry);
                        }
                    }
                }

                folders.insert(
                    id.clone(),
                    Folder {
                        id,
                        name,
                        apps,
                        created_at,
                        shortcut_path: None,
                        shortcut_status: None,
                        icon_type: None,
                        custom_icon_path: None,
                        grid_preview: None,
                        columns: None,
                        layout: None,
                        show_header: None,
                        show_labels: None,
                        show_on_tray: None,
                        sort_by: None,
                    },
                );
            }
        }
    }

    let mut cfg = FoldersConfig {
        version,
        folders,
        folder_order: None,
    };
    if cfg.version < 2 {
        cfg = migrate_v1_to_v2(cfg);
    }
    Ok(cfg)
}

fn migrate_v1_to_v2(mut cfg: FoldersConfig) -> FoldersConfig {
    cfg.version = 2;
    for folder in cfg.folders.values_mut() {
        for app in folder.apps.iter_mut() {
            if app.icon.is_empty() {
                app.icon = "icon:app".to_string();
            }
        }
    }
    cfg
}

/// Atomically write configuration to disk, maintaining a `.bak` backup file.
pub fn save(app: &AppHandle, cfg: &FoldersConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let backup_path = backup_config_path(app)?;
    save_atomic(&path, &backup_path, cfg)
}

/// Core atomic save implementation.
pub fn save_atomic(path: &Path, backup_path: &Path, cfg: &FoldersConfig) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "No parent directory for config path".to_string())?;
    fs::create_dir_all(parent).map_err(|e| format!("mkdir failed: {}", e))?;

    let unique_id = Uuid::new_v4().to_string();
    let tmp_path = parent.join(format!("folders.{}.tmp", unique_id));

    let body = serde_json::to_string_pretty(cfg).map_err(|e| format!("serialize: {}", e))?;

    // Write to unique temp file and flush
    {
        let mut file = fs::File::create(&tmp_path).map_err(|e| format!("create tmp file: {}", e))?;
        file.write_all(body.as_bytes()).map_err(|e| format!("write tmp file: {}", e))?;
        file.sync_all().map_err(|e| format!("sync tmp file: {}", e))?;
    }

    // Update backup file before replacing primary
    if path.exists() {
        let _ = fs::copy(path, backup_path);
    }

    // Safely replace destination on Windows
    if let Err(e) = replace_file_safe(&tmp_path, path) {
        let _ = fs::remove_file(&tmp_path);
        return Err(format!("atomic replace failed: {}", e));
    }

    Ok(())
}

/// Replace destination file with source file safely across Windows and Unix.
fn replace_file_safe(src: &Path, dest: &Path) -> std::io::Result<()> {
    if dest.exists() {
        #[cfg(windows)]
        {
            // On Windows, rename can fail if dest exists. Attempt rename, fallback to remove + rename.
            if let Err(_) = fs::rename(src, dest) {
                // If direct rename fails, try remove followed by rename
                let _ = fs::remove_file(dest);
                fs::rename(src, dest)?;
            }
            Ok(())
        }
        #[cfg(not(windows))]
        {
            fs::rename(src, dest)
        }
    } else {
        fs::rename(src, dest)
    }
}

/// Export configuration to user-specified destination.
pub fn export_config(_app: &AppHandle, destination_path: &str, cfg: &FoldersConfig) -> Result<(), String> {
    let body = serde_json::to_string_pretty(cfg).map_err(|e| format!("serialize: {}", e))?;
    fs::write(destination_path, body).map_err(|e| format!("write export file: {}", e))?;
    Ok(())
}

/// Import configuration from user-specified source.
pub fn import_config(app: &AppHandle, source_path: &str) -> Result<FoldersConfig, String> {
    let path = Path::new(source_path);
    if !path.exists() {
        return Err("Import file does not exist".to_string());
    }
    let cfg = load_and_migrate_file(path)?;
    save(app, &cfg)?;
    Ok(cfg)
}
