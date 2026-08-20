// ============================================================
// DeskFolder — Shared Types & Interfaces
// ============================================================

/** A single application entry inside a folder. */
export interface AppEntry {
  /** Stable unique id (UUID v4) used for React keys and dnd-kit. */
  id: string;
  /** Display name shown under the icon. */
  name: string;
  /** Absolute path to executable (.exe, .lnk, .bat, .cmd). */
  path: string;
  /** Optional command-line arguments. */
  arguments?: string;
  /** Optional working directory. */
  workingDir?: string;
  /**
   * Icon source:
   *   - "emoji:🎮"        → render emoji
   *   - "icon:code"       → render named Lucide icon
   *   - "file:C:/path/to/icon.png" → render cached PNG
   *   - "asset:..."       → render asset protocol URL
   *   - "icon:app"        → default fallback
   */
  icon: string;
  /** Whether the target executable is missing on the filesystem. */
  missing?: boolean;
  /** Unix timestamp in seconds of when the app was last launched (MRU sorting). */
  lastLaunched?: number;
}

export type AppEntryPatch = Partial<
  Pick<AppEntry, "name" | "path" | "arguments" | "workingDir" | "icon">
>;

/** Installed application discovered from Windows Start Menu / Desktop. */
export interface InstalledAppEntry {
  name: string;
  path: string;
  icon?: string;
}

/** Layout geometry computed by Rust. */
export interface LayoutDimensions {
  cols: number;
  rows: number;
  card_width: number;
  card_height: number;
  width: number;
  height: number;
}

/** A folder of apps — represented on the Windows desktop as a .lnk shortcut. */
export interface Folder {
  /** Stable unique ID; used in .lnk arguments (`--open-folder <id>`). */
  id: string;
  /** Display name. */
  name: string;
  /** Apps inside this folder. Order matters for grid layout. */
  apps: AppEntry[];
  /** When the folder was created (ISO string). */
  createdAt: string;
  /** Desktop shortcut file path if created. */
  shortcutPath?: string;
  /** Shortcut health status ("ok", "missing", "error"). */
  shortcutStatus?: string;
  /** Icon type: "grid" (default) */
  iconType?: "grid";
  /** Custom icon file path or asset URL (legacy) */
  customIconPath?: string;
  /** Desktop icon grid preview style ("2x2" or "3x3") */
  gridPreview?: "2x2" | "3x3";
  /** Number of columns in grid layout (e.g. 3, 4, 5) */
  columns?: number;
  /** Content area background style ("default", "acrylic", "solid", "minimal") */
  layout?: string;
  /** Show group name header */
  showHeader?: boolean;
  /** Show or hide program labels */
  showLabels?: boolean;
  /** Show group icon in system tray */
  showOnTray?: boolean;
  /** App sorting method: "custom" | "mru" | "alphabetical" */
  sortBy?: "custom" | "mru" | "alphabetical";
}

/** Open overlay folder event payload from Rust. */
export interface OpenFolderPayload {
  folder: Folder;
  layout: LayoutDimensions;
}

/** On-disk JSON configuration schema. */
export interface FoldersConfig {
  version: number;
  folders: Record<string, Folder>;
  folderOrder?: string[];
}


/** A 2D point. */
export interface Point {
  x: number;
  y: number;
}

/** Modes the React app can render in. */
export type AppMode = "dashboard" | "overlay";

/** Payload sent to overlay when desktop right-click menu opens */
export interface OpenMenuPayload {
  folder: Folder;
}
