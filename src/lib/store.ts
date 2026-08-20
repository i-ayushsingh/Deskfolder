// ============================================================
// DeskFolder — Reactive State Store (Zustand Cache)
// ============================================================
//
// Fast client-side cache and action dispatcher. The authoritative source
// of truth is the Rust backend. Every mutation requests a backend change,
// and the store updates in response to `state-updated` events from Rust.

import { create } from "zustand";
import type { AppEntry, AppEntryPatch, Folder, FoldersConfig } from "./types";
import {
  loadState,
  createFolder,
  renameFolder,
  saveFolder,
  deleteFolder,
  addApp,
  updateApp,
  removeApp,
  reorderApps,
  repairShortcut,
  openFolder,
  onStateUpdated,
} from "./tauri";

interface FolderState {
  folders: Record<string, Folder>;
  folderOrder: string[] | null;
  activeOverlayFolder: Folder | null;
  desktopContextMenuFolder: Folder | null;
  installedAppsCache: import("./types").InstalledAppEntry[] | null;

  // Lifecycle
  hydrate: () => Promise<void>;
  setActiveOverlayFolder: (folder: Folder | null) => void;
  setDesktopContextMenuFolder: (folder: Folder | null) => void;
  fetchInstalledApps: (forceRefresh?: boolean) => Promise<import("./types").InstalledAppEntry[]>;

  // Folder Actions
  createFolder: (name: string) => Promise<Folder>;
  renameFolder: (id: string, name: string) => Promise<Folder>;
  saveFolder: (folder: Folder) => Promise<Folder>;
  deleteFolder: (id: string) => Promise<void>;
  reorderFolders: (orderedIds: string[]) => Promise<void>;

  // App Actions
  addApp: (
    folderId: string,
    name: string,
    path: string,
    arguments_?: string,
    workingDir?: string,
    icon?: string
  ) => Promise<AppEntry>;
  updateApp: (
    folderId: string,
    appId: string,
    patch: AppEntryPatch
  ) => Promise<AppEntry>;
  removeApp: (folderId: string, appId: string) => Promise<void>;
  reorderApps: (folderId: string, orderedIds: string[]) => Promise<void>;

  // Shortcut Actions
  repairShortcut: (folderId: string) => Promise<string>;
  openFolder: (folderId: string) => Promise<void>;
}

let listenerInitialized = false;

export const useFolderStore = create<FolderState>((set, get) => ({
  folders: {},
  folderOrder: null,
  activeOverlayFolder: null,
  desktopContextMenuFolder: null,
  installedAppsCache: null,

  setActiveOverlayFolder(folder) {
    set({ activeOverlayFolder: folder, desktopContextMenuFolder: null });
  },

  setDesktopContextMenuFolder(folder) {
    set({ desktopContextMenuFolder: folder, activeOverlayFolder: null });
  },

  async fetchInstalledApps(forceRefresh = false) {
    if (!forceRefresh) {
      const current = get().installedAppsCache;
      if (current && current.length > 0) {
        return current;
      }
    }
    const { getInstalledApps } = await import("./tauri");
    const apps = await getInstalledApps(forceRefresh);
    set({ installedAppsCache: apps });
    return apps;
  },

  async hydrate() {
    try {
      const config = await loadState();
      set({
        folders: config.folders ?? {},
        folderOrder: config.folderOrder ?? null,
      });
    } catch (err) {
      console.error("Failed to load initial state:", err);
    }

    if (!listenerInitialized) {
      listenerInitialized = true;
      onStateUpdated((newConfig: FoldersConfig) => {
        set((s) => {
          const updatedFolders = newConfig.folders ?? {};
          let updatedActive = s.activeOverlayFolder;
          if (updatedActive && updatedFolders[updatedActive.id]) {
            updatedActive = updatedFolders[updatedActive.id];
          }
          return {
            folders: updatedFolders,
            folderOrder: newConfig.folderOrder ?? null,
            activeOverlayFolder: updatedActive,
          };
        });
      }).catch((err) => {
        console.warn("Failed to attach state-updated listener:", err);
      });
    }
  },

  async createFolder(name: string) {
    const folder = await createFolder(name);
    set((s) => ({
      folders: { ...s.folders, [folder.id]: folder },
      folderOrder: s.folderOrder ? [...s.folderOrder, folder.id] : null,
    }));
    return folder;
  },

  async renameFolder(id: string, name: string) {
    const updated = await renameFolder(id, name);
    set((s) => ({
      folders: { ...s.folders, [id]: updated },
    }));
    return updated;
  },

  async saveFolder(folder: Folder) {
    const updated = await saveFolder(folder);
    set((s) => ({
      folders: { ...s.folders, [updated.id]: updated },
    }));
    return updated;
  },

  async deleteFolder(id: string) {
    await deleteFolder(id);
    set((s) => {
      const next = { ...s.folders };
      delete next[id];
      const nextOrder = s.folderOrder ? s.folderOrder.filter((fId) => fId !== id) : null;
      return { folders: next, folderOrder: nextOrder };
    });
  },

  async reorderFolders(orderedIds: string[]) {
    const { reorderFolders } = await import("./tauri");
    await reorderFolders(orderedIds);
    set({ folderOrder: orderedIds });
  },

  async addApp(folderId, name, path, arguments_, workingDir, icon) {
    const entry = await addApp(folderId, name, path, arguments_, workingDir, icon);
    set((s) => {
      const folder = s.folders[folderId];
      if (!folder) return s;
      return {
        folders: {
          ...s.folders,
          [folderId]: { ...folder, apps: [...folder.apps, entry] },
        },
      };
    });
    return entry;
  },

  async updateApp(folderId, appId, patch) {
    const updated = await updateApp(folderId, appId, patch);
    set((s) => {
      const folder = s.folders[folderId];
      if (!folder) return s;
      return {
        folders: {
          ...s.folders,
          [folderId]: {
            ...folder,
            apps: folder.apps.map((a) => (a.id === appId ? updated : a)),
          },
        },
      };
    });
    return updated;
  },

  async removeApp(folderId, appId) {
    await removeApp(folderId, appId);
    set((s) => {
      const folder = s.folders[folderId];
      if (!folder) return s;
      return {
        folders: {
          ...s.folders,
          [folderId]: {
            ...folder,
            apps: folder.apps.filter((a) => a.id !== appId),
          },
        },
      };
    });
  },

  async reorderApps(folderId, orderedIds) {
    await reorderApps(folderId, orderedIds);
    set((s) => {
      const folder = s.folders[folderId];
      if (!folder) return s;
      const byId = new Map(folder.apps.map((a) => [a.id, a]));
      const reordered = orderedIds
        .map((id) => byId.get(id))
        .filter((a): a is AppEntry => Boolean(a));
      return {
        folders: {
          ...s.folders,
          [folderId]: { ...folder, apps: reordered },
        },
      };
    });
  },

  async repairShortcut(folderId) {
    return repairShortcut(folderId);
  },

  async openFolder(folderId) {
    await openFolder(folderId);
  },
}));
