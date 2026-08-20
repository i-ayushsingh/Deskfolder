// ============================================================
// DeskFolder — Tauri API & Command Invocation Bridge
// ============================================================

import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppEntry,
  AppEntryPatch,
  Folder,
  FoldersConfig,
  OpenFolderPayload,
  OpenMenuPayload,
} from "./types";

/** True when running inside a Tauri WebView. */
export const isTauri = (): boolean => {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
};

// ----------------------------------------------------------------
// State Queries & Mutations (Rust Authoritative)
// ----------------------------------------------------------------

export async function loadState(): Promise<FoldersConfig> {
  if (!isTauri()) {
    const raw = localStorage.getItem("deskfolder.config");
    if (raw) return JSON.parse(raw) as FoldersConfig;
    return { version: 2, folders: {} };
  }
  return invoke<FoldersConfig>("load_state");
}

export async function createFolder(name: string): Promise<Folder> {
  if (!isTauri()) {
    const id = "folder-" + Date.now().toString(36);
    const folder: Folder = {
      id,
      name: name.trim() || "New Folder",
      apps: [],
      createdAt: new Date().toISOString(),
      shortcutStatus: "ok",
    };
    const current = await loadState();
    current.folders[id] = folder;
    localStorage.setItem("deskfolder.config", JSON.stringify(current));
    return folder;
  }
  return invoke<Folder>("create_folder", { name });
}

export async function renameFolder(id: string, name: string): Promise<Folder> {
  if (!isTauri()) {
    const current = await loadState();
    if (current.folders[id]) {
      current.folders[id].name = name;
      localStorage.setItem("deskfolder.config", JSON.stringify(current));
      return current.folders[id];
    }
    throw new Error("Folder not found");
  }
  return invoke<Folder>("rename_folder", { id, name });
}

export async function deleteFolder(id: string): Promise<void> {
  if (!isTauri()) {
    const current = await loadState();
    delete current.folders[id];
    localStorage.setItem("deskfolder.config", JSON.stringify(current));
    return;
  }
  await invoke("delete_folder", { id });
}

export async function addApp(
  folderId: string,
  name: string,
  path: string,
  arguments_?: string,
  workingDir?: string,
  icon: string = "icon:app"
): Promise<AppEntry> {
  if (!isTauri()) {
    const entry: AppEntry = {
      id: "app-" + Date.now().toString(36),
      name,
      path,
      arguments: arguments_,
      workingDir,
      icon,
      missing: false,
    };
    const current = await loadState();
    if (current.folders[folderId]) {
      current.folders[folderId].apps.push(entry);
      localStorage.setItem("deskfolder.config", JSON.stringify(current));
    }
    return entry;
  }
  return invoke<AppEntry>("add_app", {
    folderId,
    name,
    path,
    arguments: arguments_ || null,
    workingDir: workingDir || null,
    icon,
  });
}

export async function updateApp(
  folderId: string,
  appId: string,
  patch: AppEntryPatch
): Promise<AppEntry> {
  if (!isTauri()) {
    const current = await loadState();
    const folder = current.folders[folderId];
    if (folder) {
      const idx = folder.apps.findIndex((a) => a.id === appId);
      if (idx >= 0) {
        folder.apps[idx] = { ...folder.apps[idx], ...patch };
        localStorage.setItem("deskfolder.config", JSON.stringify(current));
        return folder.apps[idx];
      }
    }
    throw new Error("App not found");
  }
  return invoke<AppEntry>("update_app", {
    folderId,
    appId,
    patch,
  });
}

export async function removeApp(
  folderId: string,
  appId: string
): Promise<void> {
  if (!isTauri()) {
    const current = await loadState();
    const folder = current.folders[folderId];
    if (folder) {
      folder.apps = folder.apps.filter((a) => a.id !== appId);
      localStorage.setItem("deskfolder.config", JSON.stringify(current));
    }
    return;
  }
  await invoke("remove_app", { folderId, appId });
}

export async function reorderApps(
  folderId: string,
  orderedIds: string[]
): Promise<void> {
  if (!isTauri()) {
    const current = await loadState();
    const folder = current.folders[folderId];
    if (folder) {
      const map = new Map(folder.apps.map((a) => [a.id, a]));
      folder.apps = orderedIds
        .map((id) => map.get(id))
        .filter((a): a is AppEntry => Boolean(a));
      localStorage.setItem("deskfolder.config", JSON.stringify(current));
    }
    return;
  }
  await invoke("reorder_apps", { folderId, orderedIds });
}

// ----------------------------------------------------------------
// Window & Process Operations
// ----------------------------------------------------------------

export async function openFolder(folderId: string): Promise<void> {
  if (!isTauri()) {
    console.info(`[mock] openFolder(${folderId})`);
    return;
  }
  await invoke("open_folder", { folderId });
}

export async function closeOverlay(): Promise<void> {
  if (!isTauri()) return;
  await invoke("close_overlay");
}

export async function setOverlayAlwaysOnTop(alwaysOnTop: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    await getCurrentWebviewWindow().setAlwaysOnTop(alwaysOnTop);
  } catch (err) {
    console.warn("setOverlayAlwaysOnTop failed:", err);
  }
}

export async function startOverlayDragging(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    await getCurrentWebviewWindow().startDragging();
  } catch (err) {
    console.warn("startOverlayDragging failed:", err);
  }
}

export async function showDashboard(): Promise<void> {
  if (!isTauri()) return;
  await invoke("show_dashboard");
}

export async function editFolderInDashboard(folderId: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("edit_folder_in_dashboard", { folderId });
}

export async function addAppInDashboard(folderId: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("add_app_in_dashboard", { folderId });
}

export async function hideDashboard(): Promise<void> {
  if (!isTauri()) return;
  await invoke("hide_dashboard");
}

export async function minimizeDashboard(): Promise<void> {
  if (!isTauri()) {
    console.info("[mock] minimizeDashboard()");
    return;
  }
  await invoke("minimize_dashboard");
}

export async function toggleMaximizeDashboard(): Promise<void> {
  if (!isTauri()) {
    console.info("[mock] toggleMaximizeDashboard()");
    return;
  }
  await invoke("toggle_maximize_dashboard");
}

export async function saveFolder(folder: Folder): Promise<Folder> {
  if (!isTauri()) {
    const current = await loadState();
    current.folders[folder.id] = folder;
    localStorage.setItem("deskfolder.config", JSON.stringify(current));
    return folder;
  }
  return invoke<Folder>("save_folder", { folder });
}

export async function reorderFolders(orderedIds: string[]): Promise<void> {
  if (!isTauri()) {
    const current = await loadState();
    current.folderOrder = orderedIds;
    localStorage.setItem("deskfolder.config", JSON.stringify(current));
    return;
  }
  await invoke("reorder_folders", { orderedIds });
}

export async function revealInExplorer(path: string): Promise<void> {
  if (!isTauri()) {
    console.info(`[mock] revealInExplorer(${path})`);
    return;
  }
  await invoke("reveal_in_explorer", { path });
}

export async function launchApp(
  path: string,
  arguments_?: string,
  workingDir?: string,
  folderId?: string,
  appId?: string
): Promise<void> {
  if (!isTauri()) {
    console.info(`[mock] launchApp(${path})`);
    return;
  }
  await invoke("launch_app", {
    path,
    arguments: arguments_ || null,
    workingDir: workingDir || null,
    folderId: folderId || null,
    appId: appId || null,
  });
}

export async function validateApp(path: string): Promise<boolean> {
  if (!isTauri()) return true;
  return invoke<boolean>("validate_app", { path });
}

export async function getInstalledApps(
  forceRefresh: boolean = false
): Promise<import("./types").InstalledAppEntry[]> {
  if (!isTauri()) {
    return [
      { name: "Google Chrome", path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", icon: "icon:chrome" },
      { name: "Visual Studio Code", path: "C:\\Users\\User\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe", icon: "icon:code" },
      { name: "Notepad", path: "C:\\Windows\\notepad.exe", icon: "icon:notepad" },
      { name: "Calculator", path: "C:\\Windows\\System32\\calc.exe", icon: "icon:calc" },
    ];
  }
  return invoke<import("./types").InstalledAppEntry[]>("get_installed_apps", {
    forceRefresh,
  });
}

export async function repairShortcut(folderId: string): Promise<string> {
  if (!isTauri()) return "C:/mock/shortcut.lnk";
  return invoke<string>("repair_shortcut", { folderId });
}

export async function extractIcon(targetPath: string): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    // Rust now returns a data:image/png;base64,... URL directly
    const dataUrl = await invoke<string>("extract_icon", { targetPath });
    return dataUrl;
  } catch (err) {
    console.warn("extract_icon failed:", err);
    return null;
  }
}

export async function exportConfig(destinationPath: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("export_config", { destinationPath });
}

export async function importConfig(sourcePath: string): Promise<FoldersConfig> {
  if (!isTauri()) return { version: 2, folders: {} };
  return invoke<FoldersConfig>("import_config", { sourcePath });
}

export async function overlayReady(): Promise<void> {
  if (!isTauri()) return;
  await invoke("overlay_ready");
}

export async function openExternalUrl(url: string): Promise<void> {
  if (!isTauri()) {
    window.open(url, "_blank");
    return;
  }
  try {
    await invoke("open_url", { url });
  } catch (err) {
    console.warn("Failed to open URL natively:", err);
    window.open(url, "_blank");
  }
}

export async function quitApp(): Promise<void> {
  if (!isTauri()) {
    console.info("[mock] quitApp()");
    return;
  }
  await invoke("quit_app");
}

export async function getSystemAccent(): Promise<string> {
  if (!isTauri()) return "#0078d4";
  try {
    return await invoke<string>("get_system_accent");
  } catch {
    return "#0078d4";
  }
}

// ----------------------------------------------------------------
// Events Subscription
// ----------------------------------------------------------------

export function onStateUpdated(
  cb: (config: FoldersConfig) => void
): Promise<UnlistenFn> {
  return listen<FoldersConfig>("state-updated", (event) => {
    cb(event.payload);
  });
}

export function onOpenOverlayFolder(
  cb: (payload: OpenFolderPayload) => void
): Promise<UnlistenFn> {
  return listen<OpenFolderPayload>("open-overlay-folder", (event) => {
    cb(event.payload);
  });
}

export function onOpenDesktopContextMenu(
  cb: (payload: OpenMenuPayload) => void
): Promise<UnlistenFn> {
  return listen<OpenMenuPayload>("open-desktop-context-menu", (event) => {
    cb(event.payload);
  });
}

export function appCountLabel(folder: Folder): string {
  const n = folder.apps.length;
  return n === 1 ? "1 app" : `${n} apps`;
}

