// ============================================================
// DeskFolder — Windows System Integration & Accent Reader
// ============================================================
//
// Reads Windows 11 DWM registry settings to detect user accent colors
// and system appearance preferences.

/// Read user's Windows 11 accent color from registry (HKCU\Software\Microsoft\Windows\DWM\AccentColor).
pub fn get_system_accent_color() -> String {
    #[cfg(windows)]
    {
        use windows::core::w;
        use windows::Win32::System::Registry::{
            RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, KEY_READ,
            REG_DWORD,
        };

        unsafe {
            let mut hkey = HKEY::default();
            if RegOpenKeyExW(
                HKEY_CURRENT_USER,
                w!("Software\\Microsoft\\Windows\\DWM"),
                0,
                KEY_READ,
                &mut hkey,
            )
            .is_ok()
            {
                let mut value: u32 = 0;
                let mut size = std::mem::size_of::<u32>() as u32;
                let mut val_type = REG_DWORD;
                let res = RegQueryValueExW(
                    hkey,
                    w!("AccentColor"),
                    None,
                    Some(&mut val_type),
                    Some(&mut value as *mut u32 as *mut _),
                    Some(&mut size),
                );
                let _ = RegCloseKey(hkey);

                if res.is_ok() {
                    // Registry AccentColor format is 0xAABBGGRR
                    let r = value & 0xFF;
                    let g = (value >> 8) & 0xFF;
                    let b = (value >> 16) & 0xFF;
                    return format!("#{:02x}{:02x}{:02x}", r, g, b);
                }
            }
        }
    }

    // Default Fluent Blue fallback
    "#0078d4".to_string()
}

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct InstalledAppEntry {
    pub name: String,
    pub path: String,
    pub icon: Option<String>,
}

/// Scan Windows Start Menu and Desktop shortcuts for installed applications with extracted icons.
pub fn scan_installed_apps(app: &AppHandle) -> Vec<InstalledAppEntry> {
    let mut results: Vec<InstalledAppEntry> = Vec::new();
    let mut seen_paths: HashSet<String> = HashSet::new();
    let mut seen_names: HashSet<String> = HashSet::new();

    let mut search_roots: Vec<PathBuf> = Vec::new();

    // 1. ProgramData Start Menu
    if let Ok(program_data) = std::env::var("ProgramData") {
        let p = PathBuf::from(program_data).join("Microsoft").join("Windows").join("Start Menu").join("Programs");
        if p.exists() {
            search_roots.push(p);
        }
    }

    // 2. User AppData Start Menu
    if let Ok(app_data) = std::env::var("APPDATA") {
        let p = PathBuf::from(app_data).join("Microsoft").join("Windows").join("Start Menu").join("Programs");
        if p.exists() {
            search_roots.push(p);
        }
    }

    // 3. Desktop Shortcuts (User & Public)
    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        let p = PathBuf::from(user_profile).join("Desktop");
        if p.exists() {
            search_roots.push(p);
        }
    }
    if let Ok(public_dir) = std::env::var("PUBLIC") {
        let p = PathBuf::from(public_dir).join("Desktop");
        if p.exists() {
            search_roots.push(p);
        }
    }

    for root in search_roots {
        collect_lnk_files(app, &root, 0, &mut results, &mut seen_paths, &mut seen_names);
    }

    // Sort alphabetically by name
    results.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    results
}

fn collect_lnk_files(
    app: &AppHandle,
    dir: &Path,
    depth: usize,
    results: &mut Vec<InstalledAppEntry>,
    seen_paths: &mut HashSet<String>,
    seen_names: &mut HashSet<String>,
) {
    if depth > 4 {
        return;
    }

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            collect_lnk_files(app, &p, depth + 1, results, seen_paths, seen_names);
        } else if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
            if ext.eq_ignore_ascii_case("lnk") {
                let file_stem = match p.file_stem().and_then(|s| s.to_str()) {
                    Some(s) => s.trim(),
                    None => continue,
                };

                let lower_stem = file_stem.to_lowercase();

                // Filter out junk / uninstaller / documentation / folder shortcuts
                if lower_stem.contains("uninstall")
                    || lower_stem.contains("remove ")
                    || lower_stem.contains("documentation")
                    || lower_stem.contains("documents")
                    || lower_stem.contains("help")
                    || lower_stem.contains("readme")
                    || lower_stem.contains("release notes")
                    || lower_stem.contains("license")
                    || lower_stem.contains("website")
                    || lower_stem.contains("web site")
                    || lower_stem.contains("manual")
                    || lower_stem.contains("guide")
                    || lower_stem.contains("tools")
                    || lower_stem.contains("feedback")
                    || lower_stem.contains("diagnostic")
                    || lower_stem.starts_with("install ")
                    || lower_stem == "deskfolder"
                {
                    continue;
                }

                let lnk_path_str = p.to_string_lossy().to_string();
                if seen_paths.contains(&lnk_path_str) {
                    continue;
                }

                // Check shortcut target
                #[cfg(windows)]
                if let Some(target) = crate::icons::resolve_shortcut_target(&p) {
                    if target.is_dir() {
                        continue;
                    }
                    if let Some(target_ext) = target.extension().and_then(|e| e.to_str()) {
                        let t_ext = target_ext.to_lowercase();
                        if t_ext == "pdf" || t_ext == "txt" || t_ext == "doc" || t_ext == "docx" || t_ext == "html" || t_ext == "htm" || t_ext == "chm" {
                            continue;
                        }
                    }

                    let target_str = target.to_string_lossy().to_string();
                    let target_lower = target_str.to_lowercase();

                    if target_lower.contains("deskfolder.exe") || target_lower.contains("uninstall.exe") {
                        continue;
                    }

                    if seen_paths.contains(&target_str) {
                        continue;
                    }
                    seen_paths.insert(target_str);
                }

                if seen_names.contains(&lower_stem) {
                    continue;
                }

                seen_paths.insert(lnk_path_str.clone());
                seen_names.insert(lower_stem);

                // Extract real high-resolution base64 icon
                let icon = crate::icons::extract_icon(app, &lnk_path_str).ok();

                results.push(InstalledAppEntry {
                    name: file_stem.to_string(),
                    path: lnk_path_str,
                    icon,
                });
            }
        }
    }
}
