// ============================================================
// DeskFolder — Core Data Models
// ============================================================

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A single application entry inside a folder.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AppEntry {
    /// Stable unique ID (UUID v4)
    pub id: String,
    /// Display name shown under the icon
    pub name: String,
    /// Absolute path to executable (.exe, .lnk, .bat, .cmd)
    pub path: String,
    /// Optional command-line arguments
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub arguments: Option<String>,
    /// Optional working directory
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "workingDir")]
    pub working_dir: Option<String>,
    /// Icon source: "icon:<name>", "emoji:<char>", "file:<path>", or "auto:extracted"
    #[serde(default = "default_icon")]
    pub icon: String,
    /// Whether the target file is missing on the filesystem
    #[serde(default)]
    pub missing: bool,
    /// Unix timestamp of last launch (seconds)
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "lastLaunched")]
    pub last_launched: Option<u64>,
}

fn default_icon() -> String {
    "icon:app".to_string()
}

/// A desktop folder grouping applications.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Folder {
    /// Stable unique ID (UUID v4)
    pub id: String,
    /// Display name (also description in shortcut)
    pub name: String,
    /// Apps in this folder in display order
    #[serde(default)]
    pub apps: Vec<AppEntry>,
    /// Creation timestamp (ISO string)
    #[serde(rename = "createdAt")]
    pub created_at: String,
    /// Absolute path to the .lnk on Desktop if created
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "shortcutPath")]
    pub shortcut_path: Option<String>,
    /// Shortcut health status ("ok", "missing", "error")
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "shortcutStatus")]
    pub shortcut_status: Option<String>,
    /// Icon type: "grid" (default)
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "iconType")]
    pub icon_type: Option<String>,
    /// Custom icon file path (optional legacy)
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "customIconPath")]
    pub custom_icon_path: Option<String>,
    /// Grid preview size for desktop shortcut icon ("2x2" or "3x3")
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "gridPreview")]
    pub grid_preview: Option<String>,
    /// Number of columns in grid layout (e.g. 3, 4, 5)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub columns: Option<u32>,
    /// Content area background style ("default", "acrylic", "solid", "minimal")
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layout: Option<String>,
    /// Show group name header
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "showHeader")]
    pub show_header: Option<bool>,
    /// Show or hide program labels
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "showLabels")]
    pub show_labels: Option<bool>,
    /// Show group icon in system tray
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "showOnTray")]
    pub show_on_tray: Option<bool>,
    /// Sorting method: "custom" | "mru" | "alphabetical"
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "sortBy")]
    pub sort_by: Option<String>,
}

/// On-disk configuration schema (folders.json)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FoldersConfig {
    /// Schema version (current is 2)
    pub version: u32,
    /// Folders indexed by folder ID
    #[serde(default)]
    pub folders: HashMap<String, Folder>,
    /// Custom ordering of folder IDs for dashboard display
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "folderOrder")]
    pub folder_order: Option<Vec<String>>,
}

impl Default for FoldersConfig {
    fn default() -> Self {
        Self {
            version: 2,
            folders: HashMap::new(),
            folder_order: None,
        }
    }
}

/// Payload sent to frontend when opening an overlay folder.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OpenFolderPayload {
    pub folder: Folder,
    pub layout: crate::monitor::LayoutDimensions,
}

/// Payload sent to frontend when opening the desktop right-click menu.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OpenMenuPayload {
    pub folder: Folder,
}

