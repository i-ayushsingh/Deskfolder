// ============================================================
// DeskFolder — Comprehensive Unit & Integration Tests
// ============================================================

#[cfg(test)]
mod tests {
    use crate::config::{load_and_migrate_file, save_atomic};
    use crate::launcher::{parse_arguments, resolve_working_dir, validate_target};
    use crate::models::{AppEntry, Folder, FoldersConfig};
    use crate::monitor::{
        calculate_clamped_bounds, compute_layout, LayoutDimensions, MonitorInfo, Rect,
    };
    use crate::shortcut::sanitize_name;
    use crate::{has_dashboard_arg, parse_open_folder_arg};
    use std::fs;
    use std::path::PathBuf;
    use uuid::Uuid;

    // ------------------------------------------------------------
    // 1. Command-Line Parsing Tests
    // ------------------------------------------------------------
    #[test]
    fn test_parse_open_folder_arg_standard() {
        let args = vec![
            "deskfolder.exe".to_string(),
            "--open-folder".to_string(),
            "folder-123".to_string(),
        ];
        assert_eq!(parse_open_folder_arg(&args), Some("folder-123".to_string()));
    }

    #[test]
    fn test_parse_open_folder_arg_equals() {
        let args = vec![
            "deskfolder.exe".to_string(),
            "--open-folder=\"folder-456\"".to_string(),
        ];
        assert_eq!(parse_open_folder_arg(&args), Some("folder-456".to_string()));
    }

    #[test]
    fn test_parse_open_folder_arg_none() {
        let args = vec!["deskfolder.exe".to_string()];
        assert_eq!(parse_open_folder_arg(&args), None);
    }

    #[test]
    fn test_has_dashboard_arg() {
        let args1 = vec!["deskfolder.exe".to_string(), "--dashboard".to_string()];
        assert!(has_dashboard_arg(&args1));

        let args2 = vec!["deskfolder.exe".to_string(), "-d".to_string()];
        assert!(has_dashboard_arg(&args2));

        let args3 = vec!["deskfolder.exe".to_string()];
        assert!(!has_dashboard_arg(&args3));
    }

    // ------------------------------------------------------------
    // 2. Shortcut Identity & Sanitization Tests
    // ------------------------------------------------------------
    #[test]
    fn test_sanitize_folder_names() {
        assert_eq!(sanitize_name("Normal Folder"), "Normal Folder");
        assert_eq!(sanitize_name("Dev/Tools: <C++ & Rust>*?"), "Dev Tools   C++ & Rust");
        assert_eq!(sanitize_name("   "), "Folder");
        assert_eq!(sanitize_name("COM1"), "COM1");
    }

    // ------------------------------------------------------------
    // 3. Layout Dimensions & Sizing Tests
    // ------------------------------------------------------------
    #[test]
    fn test_compute_layout_scaling() {
        let l1 = compute_layout(0); // 1 slot (Add app tile)
        assert_eq!(l1.cols, 3);
        assert_eq!(l1.rows, 1);
        assert!(l1.width >= 360.0);

        let l3 = compute_layout(3); // 4 slots
        assert_eq!(l3.cols, 3);
        assert_eq!(l3.rows, 2);

        let l10 = compute_layout(10); // 11 slots
        assert_eq!(l10.cols, 4);
        assert_eq!(l10.rows, 3);

        let l25 = compute_layout(25); // 26 slots
        assert_eq!(l25.cols, 6);
        assert_eq!(l25.rows, 5);
    }

    #[test]
    fn test_chrono_timestamp_valid_rfc3339() {
        let ts = crate::state::chrono_timestamp();
        assert!(chrono::DateTime::parse_from_rfc3339(&ts).is_ok());
    }

    // ------------------------------------------------------------
    // 4. Multi-Monitor & High-DPI Clamping Tests
    // ------------------------------------------------------------
    #[test]
    fn test_monitor_clamping_primary_display() {
        let monitor = MonitorInfo {
            monitor_rect: Rect {
                left: 0,
                top: 0,
                right: 1920,
                bottom: 1080,
            },
            work_area: Rect {
                left: 0,
                top: 0,
                right: 1920,
                bottom: 1040, // 40px taskbar at bottom
            },
            dpi_scale: 1.0,
        };

        let layout = LayoutDimensions {
            cols: 3,
            rows: 2,
            card_width: 284.0,
            card_height: 256.0,
            width: 324.0,
            height: 296.0,
        };

        // Cursor near center (opens below icon)
        let bounds_center = calculate_clamped_bounds(500, 500, layout, monitor);
        assert_eq!(bounds_center.x, 500 - 324 / 2);
        assert_eq!(bounds_center.y, 500 + 32);
        assert_eq!(bounds_center.width, 324);
        assert_eq!(bounds_center.height, 296);

        // Cursor at bottom-right corner (must clamp inside work area)
        let bounds_bottom_right = calculate_clamped_bounds(1915, 1030, layout, monitor);
        assert!(bounds_bottom_right.x + (bounds_bottom_right.width as i32) <= monitor.work_area.right);
        assert!(bounds_bottom_right.y + (bounds_bottom_right.height as i32) <= monitor.work_area.bottom);
        assert!(bounds_bottom_right.x >= monitor.work_area.left);
        assert!(bounds_bottom_right.y >= monitor.work_area.top);

        // Cursor at top-left corner (must clamp inside work area)
        let bounds_top_left = calculate_clamped_bounds(5, 5, layout, monitor);
        assert!(bounds_top_left.x >= monitor.work_area.left);
        assert!(bounds_top_left.y >= monitor.work_area.top);
    }

    #[test]
    fn test_monitor_clamping_secondary_negative_coords() {
        // Secondary monitor positioned to the LEFT of primary display: [-1920, 0] to [0, 1080]
        let monitor = MonitorInfo {
            monitor_rect: Rect {
                left: -1920,
                top: 0,
                right: 0,
                bottom: 1080,
            },
            work_area: Rect {
                left: -1920,
                top: 0,
                right: 0,
                bottom: 1040,
            },
            dpi_scale: 1.5, // 150% scaling
        };

        let layout = LayoutDimensions {
            cols: 3,
            rows: 2,
            card_width: 284.0,
            card_height: 256.0,
            width: 324.0,
            height: 296.0,
        };

        let bounds = calculate_clamped_bounds(-960, 400, layout, monitor);
        assert!(bounds.x >= monitor.work_area.left);
        assert!(bounds.x + (bounds.width as i32) <= monitor.work_area.right);
        assert!(bounds.y >= monitor.work_area.top);
        assert!(bounds.y + (bounds.height as i32) <= monitor.work_area.bottom);
    }

    // ------------------------------------------------------------
    // 5. Argument Parsing & Launcher Tests
    // ------------------------------------------------------------
    #[test]
    fn test_parse_arguments_tokens() {
        let args = parse_arguments(r#"--flag "quoted value" 'single quoted' -v"#);
        assert_eq!(
            args,
            vec![
                "--flag".to_string(),
                "quoted value".to_string(),
                "single quoted".to_string(),
                "-v".to_string()
            ]
        );
    }

    #[test]
    fn test_resolve_working_dir() {
        let target = PathBuf::from("C:/Program Files/DeskApp/app.exe");
        let parent = resolve_working_dir(&target, None);
        assert_eq!(parent, Some(PathBuf::from("C:/Program Files/DeskApp")));
    }

    #[test]
    fn test_validate_target_existence() {
        assert!(!validate_target("C:/non_existent_folder_xyz/fake.exe"));
    }

    // ------------------------------------------------------------
    // 6. Persistence, Recovery & Migration Tests
    // ------------------------------------------------------------
    #[test]
    fn test_persistence_atomic_and_backup() {
        let temp_dir = std::env::temp_dir().join(format!("deskfolder_test_{}", Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();

        let cfg_path = temp_dir.join("folders.json");
        let bak_path = temp_dir.join("folders.json.bak");

        let mut cfg = FoldersConfig::default();
        let folder_id = "test-folder-1".to_string();
        cfg.folders.insert(
            folder_id.clone(),
            Folder {
                id: folder_id.clone(),
                name: "Work Tools".to_string(),
                apps: vec![AppEntry {
                    id: "app-1".to_string(),
                    name: "Editor".to_string(),
                    path: "C:/tools/editor.exe".to_string(),
                    arguments: Some("--new-window".to_string()),
                    working_dir: None,
                    icon: "icon:code".to_string(),
                    missing: false,
                    last_launched: None,
                }],
                created_at: "2026-08-14T00:00:00Z".to_string(),
                shortcut_path: None,
                shortcut_status: Some("ok".to_string()),
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

        // First save
        assert!(save_atomic(&cfg_path, &bak_path, &cfg).is_ok());
        assert!(cfg_path.exists());

        // Load back
        let loaded = load_and_migrate_file(&cfg_path).unwrap();
        assert_eq!(loaded.version, 2);
        assert_eq!(loaded.folders.len(), 1);
        assert_eq!(loaded.folders.get("test-folder-1").unwrap().name, "Work Tools");

        // Mutate and save again to verify backup creation
        let mut cfg2 = loaded.clone();
        cfg2.folders.get_mut("test-folder-1").unwrap().name = "Renamed Work Tools".to_string();
        assert!(save_atomic(&cfg_path, &bak_path, &cfg2).is_ok());
        assert!(bak_path.exists());

        // Backup should contain the previous state
        let bak_loaded = load_and_migrate_file(&bak_path).unwrap();
        assert_eq!(bak_loaded.folders.get("test-folder-1").unwrap().name, "Work Tools");

        // Clean up
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_corrupt_recovery_fallback() {
        let temp_dir = std::env::temp_dir().join(format!("deskfolder_corrupt_test_{}", Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();

        let cfg_path = temp_dir.join("folders.json");
        let bak_path = temp_dir.join("folders.json.bak");

        // Valid backup
        let mut cfg = FoldersConfig::default();
        cfg.folders.insert(
            "folder-rec".to_string(),
            Folder {
                id: "folder-rec".to_string(),
                name: "Recovered".to_string(),
                apps: vec![],
                created_at: "2026-08-14T00:00:00Z".to_string(),
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
        let valid_body = serde_json::to_string_pretty(&cfg).unwrap();
        fs::write(&bak_path, valid_body).unwrap();

        // Corrupted primary file
        fs::write(&cfg_path, "{ broken json ... !@#$").unwrap();

        // Attempting to parse primary fails
        assert!(load_and_migrate_file(&cfg_path).is_err());

        // Loading backup succeeds
        let recovered = load_and_migrate_file(&bak_path).unwrap();
        assert_eq!(recovered.folders.get("folder-rec").unwrap().name, "Recovered");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_v1_to_v2_migration() {
        let temp_dir = std::env::temp_dir().join(format!("deskfolder_mig_test_{}", Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();
        let v1_file = temp_dir.join("v1.json");

        let v1_json = r#"{
            "version": 1,
            "folders": {
                "f1": {
                    "id": "f1",
                    "name": "Legacy",
                    "apps": [
                        { "id": "a1", "name": "Notepad", "path": "notepad.exe", "icon": "" }
                    ],
                    "createdAt": "2026-01-01"
                }
            }
        }"#;

        fs::write(&v1_file, v1_json).unwrap();
        let migrated = load_and_migrate_file(&v1_file).unwrap();

        assert_eq!(migrated.version, 2);
        let app_entry = &migrated.folders.get("f1").unwrap().apps[0];
        assert_eq!(app_entry.icon, "icon:app");
        assert_eq!(app_entry.missing, false);

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
