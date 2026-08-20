// ============================================================
// DeskFolder — Authoritative Rust Application State Manager
// ============================================================
//
// Rust is the single source of truth for:
//   - Folders, app entries, validation status, and shortcuts.
//   - Overlay positioning and window lifecycle.
//   - Synchronized broadcast events across all WebViews.

use crate::config;
use crate::launcher;
use crate::models::{AppEntry, Folder, FoldersConfig, OpenFolderPayload, OpenMenuPayload};
use crate::monitor;
use crate::shortcut;
use serde::Deserialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};
use uuid::Uuid;

#[derive(Debug, Clone, Deserialize)]
pub struct AppEntryPatch {
    pub name: Option<String>,
    pub path: Option<String>,
    pub arguments: Option<String>,
    pub working_dir: Option<String>,
    pub icon: Option<String>,
}

pub struct AppState {
    pub config: Arc<RwLock<FoldersConfig>>,
    pub pending_open_folder: Arc<Mutex<Option<(String, Option<(i32, i32)>)>>>,
    pub overlay_ready: Arc<AtomicBool>,
    pub installed_apps_cache: Arc<Mutex<Option<Vec<crate::system::InstalledAppEntry>>>>,
}

impl AppState {
    pub fn new(initial_config: FoldersConfig) -> Self {
        Self {
            config: Arc::new(RwLock::new(initial_config)),
            pending_open_folder: Arc::new(Mutex::new(None)),
            overlay_ready: Arc::new(AtomicBool::new(false)),
            installed_apps_cache: Arc::new(Mutex::new(None)),
        }
    }

    /// Retrieve cached installed apps or scan on demand.
    pub fn get_or_scan_installed_apps(
        &self,
        app: &AppHandle,
        force_refresh: bool,
    ) -> Vec<crate::system::InstalledAppEntry> {
        if !force_refresh {
            let guard = self.installed_apps_cache.lock().unwrap();
            if let Some(cached) = guard.as_ref() {
                return cached.clone();
            }
        }

        let scanned = crate::system::scan_installed_apps(app);
        let mut guard = self.installed_apps_cache.lock().unwrap();
        *guard = Some(scanned.clone());
        scanned
    }

    /// Read current config snapshot.
    pub fn get_config(&self) -> FoldersConfig {
        self.config.read().unwrap().clone()
    }

    /// Atomically mutate in-memory state, persist to disk, and broadcast to all windows.
    pub fn mutate_config<F, R>(&self, app: &AppHandle, f: F) -> Result<R, String>
    where
        F: FnOnce(&mut FoldersConfig) -> Result<R, String>,
    {
        let mut lock = self.config.write().unwrap();
        let result = f(&mut lock)?;
        config::save(app, &lock)?;
        let snapshot = lock.clone();
        drop(lock);
        let _ = app.emit("state-updated", &snapshot);
        Ok(result)
    }

    /// Update in-memory state, persist to disk, and broadcast to all windows.
    pub fn persist_and_broadcast(&self, app: &AppHandle, new_cfg: FoldersConfig) -> Result<(), String> {
        self.mutate_config(app, |cfg| {
            *cfg = new_cfg;
            Ok(())
        })
    }

    /// Validate all applications against the filesystem and update missing flags.
    /// Only persists and broadcasts if changes are detected.
    pub fn validate_all_apps(&self, app: &AppHandle) -> Result<(), String> {
        let mut changed = false;
        let mut snapshot_to_emit = None;
        {
            let mut lock = self.config.write().unwrap();
            for folder in lock.folders.values_mut() {
                // Check shortcut status
                let sc_exists = shortcut::exists(app, folder);
                let status = if sc_exists { "ok" } else { "missing" };
                if folder.shortcut_status.as_deref() != Some(status) {
                    folder.shortcut_status = Some(status.to_string());
                    changed = true;
                }

                for app_entry in folder.apps.iter_mut() {
                    let exists = launcher::validate_target(&app_entry.path);
                    let missing = !exists;
                    if app_entry.missing != missing {
                        app_entry.missing = missing;
                        changed = true;
                    }
                }
            }

            if changed {
                config::save(app, &lock)?;
                snapshot_to_emit = Some(lock.clone());
            }
        }

        if let Some(snapshot) = snapshot_to_emit {
            let _ = app.emit("state-updated", &snapshot);
        }

        Ok(())
    }

    /// Create a new folder, persist first, then create its desktop shortcut.
    pub fn create_folder(&self, app: &AppHandle, name: String) -> Result<Folder, String> {
        let id = Uuid::new_v4().to_string();
        let folder_name = if name.trim().is_empty() {
            "New Folder".to_string()
        } else {
            name.trim().to_string()
        };

        let mut folder = Folder {
            id: id.clone(),
            name: folder_name.clone(),
            apps: Vec::new(),
            created_at: chrono_timestamp(),
            shortcut_path: None,
            shortcut_status: Some("missing".to_string()),
            icon_type: Some("grid".to_string()),
            custom_icon_path: None,
            grid_preview: Some("2x2".to_string()),
            columns: Some(4),
            layout: Some("default".to_string()),
            show_header: Some(true),
            show_labels: Some(true),
            show_on_tray: Some(false),
            sort_by: None,
        };

        // Persist to disk first (Fix B3)
        self.mutate_config(app, |cfg| {
            cfg.folders.insert(id.clone(), folder.clone());
            // Also append to folder_order if present
            if let Some(order) = &mut cfg.folder_order {
                if !order.contains(&id) {
                    order.push(id.clone());
                }
            }
            Ok(())
        })?;

        // Then create shortcut on desktop
        if let Ok(sc_path) = shortcut::create_or_update(app, &folder) {
            let sc_str = sc_path.to_string_lossy().to_string();
            folder.shortcut_path = Some(sc_str);
            folder.shortcut_status = Some("ok".to_string());
            let _ = self.mutate_config(app, |cfg| {
                if let Some(f) = cfg.folders.get_mut(&id) {
                    f.shortcut_path = folder.shortcut_path.clone();
                    f.shortcut_status = folder.shortcut_status.clone();
                }
                Ok(())
            });
        }

        Ok(folder)
    }

    /// Save or update an entire folder (including apps, customization, name, icons).
    pub fn save_folder(&self, app: &AppHandle, folder: Folder) -> Result<Folder, String> {
        let id = folder.id.clone();
        self.mutate_config(app, |cfg| {
            cfg.folders.insert(id.clone(), folder.clone());
            Ok(folder.clone())
        })?;
        if let Ok(sc_path) = shortcut::create_or_update(app, &folder) {
            let path_str = sc_path.to_string_lossy().to_string();
            let _ = self.mutate_config(app, |cfg| {
                if let Some(f) = cfg.folders.get_mut(&id) {
                    f.shortcut_path = Some(path_str);
                    f.shortcut_status = Some("ok".to_string());
                }
                Ok(())
            });
        }
        let updated = self.get_config().folders.get(&id).cloned().unwrap_or(folder);
        Ok(updated)
    }

    /// Rename an existing folder and update its desktop shortcut metadata.
    pub fn rename_folder(&self, app: &AppHandle, id: String, name: String) -> Result<Folder, String> {
        self.mutate_config(app, |cfg| {
            let folder = cfg
                .folders
                .get_mut(&id)
                .ok_or_else(|| format!("Folder '{}' not found", id))?;

            let new_name = if name.trim().is_empty() {
                folder.name.clone()
            } else {
                name.trim().to_string()
            };

            folder.name = new_name;
            if let Ok(sc_path) = shortcut::create_or_update(app, folder) {
                folder.shortcut_path = Some(sc_path.to_string_lossy().to_string());
                folder.shortcut_status = Some("ok".to_string());
            }

            Ok(folder.clone())
        })
    }

    /// Delete a folder, remove its desktop shortcut, and persist.
    pub fn delete_folder(&self, app: &AppHandle, id: String) -> Result<(), String> {
        if let Some(folder) = self.get_config().folders.get(&id) {
            let _ = shortcut::remove(app, folder);
        } else {
            let _ = shortcut::remove_by_id(app, &id);
        }
        self.mutate_config(app, |cfg| {
            cfg.folders.remove(&id);
            Ok(())
        })
    }

    /// Add an application entry into a folder.
    pub fn add_app(
        &self,
        app: &AppHandle,
        folder_id: String,
        name: String,
        path: String,
        arguments: Option<String>,
        working_dir: Option<String>,
        icon: String,
    ) -> Result<AppEntry, String> {
        let path_clean = path.trim();
        let path_lower = path_clean.to_lowercase();

        // Disallow adding DeskFolder folder shortcuts or DeskFolder executable inside folders
        let is_deskfolder_shortcut = {
            let cfg = self.get_config();
            cfg.folders.values().any(|f| {
                if let Some(sc) = &f.shortcut_path {
                    if sc.eq_ignore_ascii_case(path_clean) {
                        return true;
                    }
                }
                let clean_name = shortcut::sanitize_name(&f.name).to_lowercase();
                let fname_lower = f.name.to_lowercase();
                path_lower.ends_with(&format!("\\{}.lnk", fname_lower))
                    || path_lower.ends_with(&format!("\\{}.lnk", clean_name))
                    || path_lower.ends_with(&format!("/{}.lnk", fname_lower))
                    || path_lower.ends_with(&format!("/{}.lnk", clean_name))
            })
        };
        let is_deskfolder_exe = path_lower.ends_with("deskfolder.exe")
            || arguments.as_ref().map(|a| a.contains("--open-folder")).unwrap_or(false);

        if is_deskfolder_shortcut || is_deskfolder_exe {
            return Err("DeskFolder groups cannot be added inside another group".to_string());
        }

        self.mutate_config(app, |cfg| {
            let folder = cfg
                .folders
                .get_mut(&folder_id)
                .ok_or_else(|| format!("Folder '{}' not found", folder_id))?;

            let exists = launcher::validate_target(path_clean);
            let entry = AppEntry {
                id: Uuid::new_v4().to_string(),
                name: if name.trim().is_empty() { "App".to_string() } else { name.trim().to_string() },
                path: path_clean.to_string(),
                arguments: arguments.filter(|s| !s.trim().is_empty()),
                working_dir: working_dir.filter(|s| !s.trim().is_empty()),
                icon: if icon.trim().is_empty() { "icon:app".to_string() } else { icon },
                missing: !exists,
                last_launched: None,
            };

            folder.apps.push(entry.clone());
            Ok(entry)
        })
    }

    /// Update an existing application entry.
    pub fn update_app(
        &self,
        app: &AppHandle,
        folder_id: String,
        app_id: String,
        patch: AppEntryPatch,
    ) -> Result<AppEntry, String> {
        self.mutate_config(app, |cfg| {
            let folder = cfg
                .folders
                .get_mut(&folder_id)
                .ok_or_else(|| format!("Folder '{}' not found", folder_id))?;

            let entry = folder
                .apps
                .iter_mut()
                .find(|a| a.id == app_id)
                .ok_or_else(|| format!("App '{}' not found in folder '{}'", app_id, folder_id))?;

            if let Some(n) = patch.name {
                if !n.trim().is_empty() {
                    entry.name = n.trim().to_string();
                }
            }
            if let Some(p) = patch.path {
                if !p.trim().is_empty() {
                    entry.path = p.trim().to_string();
                    entry.missing = !launcher::validate_target(&entry.path);
                }
            }
            if let Some(args) = patch.arguments {
                entry.arguments = if args.trim().is_empty() { None } else { Some(args.trim().to_string()) };
            }
            if let Some(dir) = patch.working_dir {
                entry.working_dir = if dir.trim().is_empty() { None } else { Some(dir.trim().to_string()) };
            }
            if let Some(ic) = patch.icon {
                if !ic.trim().is_empty() {
                    entry.icon = ic;
                }
            }

            Ok(entry.clone())
        })
    }

    /// Remove an application entry from a folder.
    pub fn remove_app(&self, app: &AppHandle, folder_id: String, app_id: String) -> Result<(), String> {
        self.mutate_config(app, |cfg| {
            let folder = cfg
                .folders
                .get_mut(&folder_id)
                .ok_or_else(|| format!("Folder '{}' not found", folder_id))?;

            folder.apps.retain(|a| a.id != app_id);
            Ok(())
        })
    }

    /// Reorder applications in a folder.
    pub fn reorder_apps(
        &self,
        app: &AppHandle,
        folder_id: String,
        ordered_ids: Vec<String>,
    ) -> Result<(), String> {
        self.mutate_config(app, |cfg| {
            let folder = cfg
                .folders
                .get_mut(&folder_id)
                .ok_or_else(|| format!("Folder '{}' not found", folder_id))?;

            let mut reordered = Vec::new();
            for id in &ordered_ids {
                if let Some(app_entry) = folder.apps.iter().find(|a| &a.id == id).cloned() {
                    reordered.push(app_entry);
                }
            }
            // Append any apps not in ordered_ids to prevent data loss
            for a in &folder.apps {
                if !reordered.iter().any(|r| &r.id == &a.id) {
                    reordered.push(a.clone());
                }
            }

            folder.apps = reordered;
            Ok(())
        })
    }

    /// Reorder folders in dashboard.
    pub fn reorder_folders(
        &self,
        app: &AppHandle,
        ordered_ids: Vec<String>,
    ) -> Result<(), String> {
        self.mutate_config(app, |cfg| {
            cfg.folder_order = Some(ordered_ids);
            Ok(())
        })
    }

    /// Record app launch timestamp (MRU sorting)
    pub fn record_app_launch(
        &self,
        app: &AppHandle,
        folder_id: &str,
        app_id: &str,
    ) {
        use std::time::{SystemTime, UNIX_EPOCH};
        let now_secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let _ = self.mutate_config(app, |cfg| {
            if let Some(folder) = cfg.folders.get_mut(folder_id) {
                if let Some(app_entry) = folder.apps.iter_mut().find(|a| a.id == app_id) {
                    app_entry.last_launched = Some(now_secs);
                }
            }
            Ok(())
        });
    }

    /// Recreate or repair the desktop shortcut for a folder.
    pub fn repair_shortcut(&self, app: &AppHandle, folder_id: String) -> Result<String, String> {
        self.mutate_config(app, |cfg| {
            let folder = cfg
                .folders
                .get_mut(&folder_id)
                .ok_or_else(|| format!("Folder '{}' not found", folder_id))?;

            let sc_path = shortcut::repair(app, folder)?;
            let path_str = sc_path.to_string_lossy().to_string();
            folder.shortcut_path = Some(path_str.clone());
            folder.shortcut_status = Some("ok".to_string());
            Ok(path_str)
        })
    }

    /// Deterministic atomic open folder sequence.
    pub fn open_folder(
        &self,
        app: &AppHandle,
        folder_id: &str,
        override_cursor: Option<(i32, i32)>,
    ) -> Result<(), String> {
        let cfg = self.get_config();
        let folder = match cfg.folders.get(folder_id) {
            Some(f) => f.clone(),
            None => {
                // Dead shortcut was clicked for a deleted folder: clean up orphaned .lnk
                eprintln!("[DeskFolder] Folder '{}' not found on open. Cleaning up orphaned shortcut.", folder_id);
                let _ = shortcut::remove_by_id(app, folder_id);
                return Err(format!("Folder '{}' not found", folder_id));
            }
        };

        let (cx, cy) = match override_cursor {
            Some(pt) => pt,
            None => monitor::get_cursor_pos().unwrap_or((500, 500)),
        };
        let monitor_info = monitor::get_monitor_at_point(cx, cy)?;
        let layout = monitor::compute_layout(folder.apps.len());
        let bounds = monitor::calculate_clamped_bounds(cx, cy, layout, monitor_info);

        if let Some(overlay) = app.get_webview_window("overlay") {
            // Position and resize window in physical pixels
            overlay
                .set_position(PhysicalPosition::new(bounds.x, bounds.y))
                .map_err(|e| format!("set_position failed: {}", e))?;
            overlay
                .set_size(PhysicalSize::new(bounds.width, bounds.height))
                .map_err(|e| format!("set_size failed: {}", e))?;

            // Notify frontend overlay component to display this folder with layout
            let payload = OpenFolderPayload {
                folder,
                layout,
            };
            let _ = overlay.emit("open-overlay-folder", payload);

            // Show and focus
            overlay.show().map_err(|e| format!("show overlay failed: {}", e))?;
            overlay.set_focus().map_err(|e| format!("focus overlay failed: {}", e))?;
        } else {
            return Err("Overlay window not found".to_string());
        }

        Ok(())
    }

    /// Mark the overlay WebView as ready, and flush any pending open folder requests.
    pub fn handle_overlay_ready(&self, app: &AppHandle) {
        self.overlay_ready.store(true, Ordering::SeqCst);
        let pending = {
            let mut lock = self.pending_open_folder.lock().unwrap();
            lock.take()
        };

        if let Some((folder_id, cursor)) = pending {
            let app_clone = app.clone();
            let state = app.state::<AppState>();
            let _ = state.open_folder(&app_clone, &folder_id, cursor);
        }
    }

    /// Queue or immediately execute an open folder request with instant cursor snapshot.
    pub fn request_open_folder(
        &self,
        app: &AppHandle,
        folder_id: String,
        cursor: Option<(i32, i32)>,
    ) {
        let initial_cursor = cursor.or_else(|| monitor::get_cursor_pos().ok());
        if self.overlay_ready.load(Ordering::SeqCst) {
            let _ = self.open_folder(app, &folder_id, initial_cursor);
        } else {
            let mut lock = self.pending_open_folder.lock().unwrap();
            *lock = Some((folder_id, initial_cursor));
        }
    }

    /// Open desktop right-click context menu positioned at cursor.
    pub fn open_desktop_context_menu(
        &self,
        app: &AppHandle,
        folder_id: &str,
        cursor: (i32, i32),
    ) -> Result<(), String> {
        let cfg = self.get_config();
        let folder = match cfg.folders.get(folder_id) {
            Some(f) => f.clone(),
            None => return Err(format!("Folder '{}' not found", folder_id)),
        };

        let monitor_info = monitor::get_monitor_at_point(cursor.0, cursor.1)?;
        let scale = monitor_info.dpi_scale;
        let menu_w = (230.0 * scale) as u32;
        let menu_h = (260.0 * scale) as u32;

        // Clamp coordinates so menu stays fully inside the screen work area
        let mut x = cursor.0;
        let mut y = cursor.1;
        let max_x = monitor_info.work_area.right - menu_w as i32;
        let max_y = monitor_info.work_area.bottom - menu_h as i32;
        if x > max_x {
            x = cursor.0 - menu_w as i32;
        }
        if y > max_y {
            y = cursor.1 - menu_h as i32;
        }
        if x < monitor_info.work_area.left {
            x = monitor_info.work_area.left;
        }
        if y < monitor_info.work_area.top {
            y = monitor_info.work_area.top;
        }

        if let Some(overlay) = app.get_webview_window("overlay") {
            overlay
                .set_position(PhysicalPosition::new(x, y))
                .map_err(|e| format!("set_position failed: {}", e))?;
            overlay
                .set_size(PhysicalSize::new(menu_w, menu_h))
                .map_err(|e| format!("set_size failed: {}", e))?;

            let _ = overlay.emit("open-desktop-context-menu", OpenMenuPayload { folder });
            overlay.show().map_err(|e| format!("show overlay failed: {}", e))?;
            overlay.set_focus().map_err(|e| format!("focus overlay failed: {}", e))?;
        }
        Ok(())
    }
}

pub fn chrono_timestamp() -> String {
    chrono::Utc::now().to_rfc3339()
}

