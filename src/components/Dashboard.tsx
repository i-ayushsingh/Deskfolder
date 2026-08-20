import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus,
  X,
  Minus,
  Square,
  Search,
  RotateCw,
  MoreVertical,
  MoreHorizontal,
  Pencil,
  Trash2,
  FolderOpen,
  Wrench,
  Download,
  Upload,
  Coffee,
  CheckCircle2,
  AlertCircle,
  Folder as FolderIcon,
  Layers,
  Settings,
  GripVertical,
} from "lucide-react";
import { useFolderStore } from "../lib/store";
import {
  hideDashboard,
  minimizeDashboard,
  toggleMaximizeDashboard,
  quitApp,
  exportConfig,
  importConfig,
  openExternalUrl,
  getSystemAccent,
  extractIcon,
} from "../lib/tauri";
import GroupEditorModal from "./GroupEditorModal";
import SettingsModal from "./SettingsModal";
import AppIcon from "./AppIcon";
import type { AppEntry, Folder } from "../lib/types";

interface DashboardProps {
  devMode?: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({ devMode = false }) => {
  const folders = useFolderStore((s) => s.folders);
  const folderOrder = useFolderStore((s) => s.folderOrder);
  const createFolder = useFolderStore((s) => s.createFolder);
  const saveFolder = useFolderStore((s) => s.saveFolder);
  const deleteFolder = useFolderStore((s) => s.deleteFolder);
  const reorderFolders = useFolderStore((s) => s.reorderFolders);
  const repairShortcut = useFolderStore((s) => s.repairShortcut);
  const openFolder = useFolderStore((s) => s.openFolder);
  const hydrate = useFolderStore((s) => s.hydrate);

  React.useEffect(() => {
    hydrate();
    const onFocus = () => {
      hydrate();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [hydrate]);

  React.useEffect(() => {
    let unlistenEdit: (() => void) | undefined;
    let unlistenAdd: (() => void) | undefined;

    import("@tauri-apps/api/event")
      .then(({ listen }) => {
        listen<string>("open-edit-folder", (event) => {
          const folderId = event.payload;
          const currentFolders = useFolderStore.getState().folders;
          if (currentFolders[folderId]) {
            setEditingGroup(currentFolders[folderId]);
          }
        }).then((un) => {
          unlistenEdit = un;
        });

        listen<string>("open-add-app-folder", (event) => {
          const folderId = event.payload;
          const currentFolders = useFolderStore.getState().folders;
          if (currentFolders[folderId]) {
            setEditingGroup(currentFolders[folderId]);
          }
        }).then((un) => {
          unlistenAdd = un;
        });
      })
      .catch(() => {});

    return () => {
      if (unlistenEdit) unlistenEdit();
      if (unlistenAdd) unlistenAdd();
    };
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [editingGroup, setEditingGroup] = useState<Folder | null>(null);
  const [isCreatingNewGroup, setIsCreatingNewGroup] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpenFolderId, setMenuOpenFolderId] = useState<string | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const folderList = useMemo(() => {
    const all = Object.values(folders);
    if (!folderOrder || folderOrder.length === 0) {
      return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    const orderMap = new Map(folderOrder.map((id, index) => [id, index]));
    return [...all].sort((a, b) => {
      const idxA = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
      const idxB = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
      if (idxA !== idxB) return idxA - idxB;
      return a.createdAt.localeCompare(b.createdAt);
    });
  }, [folders, folderOrder]);

  const filteredFolders = folderList.filter((f) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      f.name.toLowerCase().includes(q) ||
      f.apps.some((a) => a.name.toLowerCase().includes(q))
    );
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleGroupDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const currentIds = folderList.map((f) => f.id);
    const oldIndex = currentIds.indexOf(active.id as string);
    const newIndex = currentIds.indexOf(over.id as string);
    if (oldIndex !== -1 && newIndex !== -1) {
      const newOrder = arrayMove(currentIds, oldIndex, newIndex);
      await reorderFolders(newOrder);
    }
  };

  const handleWindowMinimize = () => {
    if (devMode) return;
    minimizeDashboard().catch(() => {});
  };

  const handleWindowMaximize = () => {
    if (devMode) return;
    toggleMaximizeDashboard().catch(() => {});
  };

  const handleWindowClose = () => {
    if (devMode) return;
    hideDashboard().catch(() => {});
  };

  const handleRefresh = async () => {
    try {
      await hydrate();
      showToast("success", "Groups refreshed");
    } catch {
      showToast("error", "Failed to refresh");
    }
  };

  const handleExport = async () => {
    try {
      setHeaderMenuOpen(false);
      const { save } = await import("@tauri-apps/plugin-dialog");
      const path = await save({
        filters: [{ name: "JSON Configuration", extensions: ["json"] }],
        defaultPath: "deskfolder-backup.json",
      });
      if (path) {
        await exportConfig(path);
        showToast("success", "Configuration exported successfully");
      }
    } catch (err: any) {
      showToast("error", `Export failed: ${err}`);
    }
  };

  const handleImport = async () => {
    try {
      setHeaderMenuOpen(false);
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        multiple: false,
        filters: [{ name: "JSON Configuration", extensions: ["json"] }],
      });
      if (typeof path === "string") {
        await importConfig(path);
        showToast("success", "Configuration imported successfully");
      }
    } catch (err: any) {
      showToast("error", `Import failed: ${err}`);
    }
  };

  const handleSaveGroup = async (groupData: {
    id?: string;
    name: string;
    apps: AppEntry[];
    gridPreview?: "2x2" | "3x3";
    columns?: number;
    layout?: string;
    showHeader?: boolean;
    showLabels?: boolean;
    showOnTray?: boolean;
    sortBy?: "custom" | "mru" | "alphabetical";
  }) => {
    try {
      if (groupData.id && folders[groupData.id]) {
        // Update existing folder
        const existing = folders[groupData.id];
        const updated: Folder = {
          ...existing,
          name: groupData.name,
          apps: groupData.apps,
          gridPreview: groupData.gridPreview,
          columns: groupData.columns,
          layout: groupData.layout,
          showHeader: groupData.showHeader,
          showLabels: groupData.showLabels,
          showOnTray: groupData.showOnTray,
          sortBy: groupData.sortBy ?? existing.sortBy,
        };
        await saveFolder(updated);
        showToast("success", `Updated "${groupData.name}"`);
      } else {
        // Create new folder
        const created = await createFolder(groupData.name);
        const updated: Folder = {
          ...created,
          apps: groupData.apps,
          gridPreview: groupData.gridPreview,
          columns: groupData.columns,
          layout: groupData.layout,
          showHeader: groupData.showHeader,
          showLabels: groupData.showLabels,
          showOnTray: groupData.showOnTray,
          sortBy: groupData.sortBy,
        };
        await saveFolder(updated);
        showToast("success", `Created "${groupData.name}"`);
      }
    } catch (err: any) {
      showToast("error", `Failed to save group: ${err}`);
    }
  };

  return (
    <div
      className="h-screen w-screen flex flex-col select-none overflow-hidden text-neutral-200"
      style={{ backgroundColor: "#18191c" }}
      onClick={() => {
        if (menuOpenFolderId) setMenuOpenFolderId(null);
        if (headerMenuOpen) setHeaderMenuOpen(false);
      }}
    >
      {/* ============================================================
          Window Header & Search Bar
          ============================================================ */}
      <header
        onDoubleClick={handleWindowMaximize}
        className="drag-region pt-3.5 px-6 pb-3 flex items-center justify-between shrink-0 border-b border-white/[0.04] cursor-default"
      >
        {/* Title */}
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="DeskFolder" className="w-5 h-5 rounded-md inline-block shadow-sm" />
          <h1 className="text-[17px] font-bold tracking-tight text-white leading-tight select-none">
            DeskFolder
          </h1>
        </div>

        {/* Search Input, Settings & Window Controls */}
        <div className="flex items-center gap-2 no-drag">
          {/* Search Box */}
          <div className="relative flex items-center">
            <Search
              size={13}
              className="absolute left-2.5 text-neutral-400 pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search groups..."
              className="w-40 focus:w-52 transition-all duration-200 pl-7 pr-3 py-1.5 text-xs bg-[#242529] hover:bg-[#282a2f] focus:bg-[#2b2c32] text-white placeholder-neutral-500 rounded-lg border border-white/[0.06] focus:border-white/40 focus:outline-none font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 text-neutral-500 hover:text-neutral-300"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Settings Button in Header */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors"
            title="Settings"
          >
            <Settings size={15} />
          </button>

          {/* Window Control Buttons */}
          <div className="flex items-center gap-0.5 ml-1">
            <button
              className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors"
              onClick={handleWindowMinimize}
              title="Minimize"
            >
              <Minus size={14} />
            </button>
            <button
              className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors"
              onClick={handleWindowMaximize}
              title="Maximize / Restore"
            >
              <Square size={12} />
            </button>
            <button
              className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-red-600/80 transition-colors"
              onClick={handleWindowClose}
              title="Close"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* ============================================================
          Toolbar & Action Row (Refresh, Add, More)
          ============================================================ */}
      <div className="px-6 py-3 flex items-center justify-between shrink-0">
        <span className="text-xs font-semibold text-neutral-400 tracking-wide">
          {filteredFolders.length} {filteredFolders.length === 1 ? "Group" : "Groups"}
        </span>

        <div className="flex items-center gap-1.5 relative">
          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Refresh Groups"
          >
            <RotateCw size={15} />
          </button>

          {/* Add New Group Button */}
          <button
            onClick={() => {
              setEditingGroup(null);
              setIsCreatingNewGroup(true);
            }}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Add New Group"
          >
            <Plus size={17} />
          </button>

          {/* Three Dots Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setHeaderMenuOpen(!headerMenuOpen);
            }}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="More options"
          >
            <MoreVertical size={16} />
          </button>

          {/* Header Context Menu */}
          <AnimatePresence>
            {headerMenuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                className="absolute right-0 top-full mt-1 w-48 rounded-xl bg-[#232428] border border-white/10 shadow-2xl p-1 z-50 text-xs text-neutral-300"
              >
                <button
                  onClick={handleExport}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.08] hover:text-white transition-colors"
                >
                  <Download size={14} />
                  <span>Export to JSON</span>
                </button>
                <button
                  onClick={handleImport}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.08] hover:text-white transition-colors"
                >
                  <Upload size={14} />
                  <span>Import from JSON</span>
                </button>
                <button
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    openExternalUrl("https://github.com/i-ayushsingh/Deskfolder");
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.08] hover:text-white transition-colors"
                >
                  <FolderOpen size={14} />
                  <span>GitHub Repository</span>
                </button>
                <button
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    setSettingsOpen(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.08] hover:text-white transition-colors"
                >
                  <Settings size={14} />
                  <span>Settings</span>
                </button>
                <div className="h-px bg-white/10 my-1" />
                <button
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    quitApp();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
                >
                  <X size={14} />
                  <span>Quit DeskFolder</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ============================================================
          Main Group List Area (Sortable DndContext U5)
          ============================================================ */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {filteredFolders.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center mb-3">
              <Layers size={24} className="text-neutral-400" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">
              {searchQuery ? "No groups found" : "No app groups yet"}
            </h3>
            <p className="text-xs text-neutral-400 max-w-xs mb-4">
              {searchQuery
                ? `No group matched "${searchQuery}"`
                : "Create a group to organize your desktop apps into a sleek popup."}
            </p>
            {!searchQuery && (
              <button
                onClick={() => {
                  setEditingGroup(null);
                  setIsCreatingNewGroup(true);
                }}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-white text-black font-semibold text-xs hover:bg-neutral-200 active:scale-[0.98] transition-all shadow-sm cursor-default"
              >
                <Plus size={15} />
                <span>Create Group</span>
              </button>
            )}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleGroupDragEnd}
          >
            <SortableContext
              items={filteredFolders.map((f) => f.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-2.5">
                {filteredFolders.map((folder) => (
                  <SortableGroupCard
                    key={folder.id}
                    folder={folder}
                    isMenuOpen={menuOpenFolderId === folder.id}
                    onToggleMenu={(e) => {
                      e.stopPropagation();
                      setMenuOpenFolderId(
                        menuOpenFolderId === folder.id ? null : folder.id
                      );
                    }}
                    onCloseMenu={() => setMenuOpenFolderId(null)}
                    onOpenPopup={async () => {
                      try {
                        await openFolder(folder.id);
                        hideDashboard().catch(() => {});
                      } catch (err: any) {
                        showToast("error", `Failed to open folder: ${err}`);
                      }
                    }}
                    onEdit={() => {
                      setEditingGroup(folder);
                      setIsCreatingNewGroup(false);
                    }}
                    onRepairShortcut={async () => {
                      try {
                        await repairShortcut(folder.id);
                        showToast("success", `Repaired shortcut for "${folder.name}"`);
                      } catch (err: any) {
                        showToast("error", `Repair failed: ${err}`);
                      }
                    }}
                    onDelete={async () => {
                      if (
                        confirm(
                          `Delete group "${folder.name}" and remove its desktop shortcut?`
                        )
                      ) {
                        try {
                          await deleteFolder(folder.id);
                          if (editingGroup?.id === folder.id) {
                            setEditingGroup(null);
                          }
                          showToast("success", `Deleted "${folder.name}"`);
                        } catch (err: any) {
                          showToast("error", `Delete failed: ${err}`);
                        }
                      }
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Win11 Bottom-Right Floating Toast Notification (U7) */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={`fixed bottom-5 right-5 p-3 rounded-xl flex items-center gap-2.5 text-xs shadow-2xl z-50 border backdrop-blur-md ${
              toast.type === "success"
                ? "bg-[#1c2420]/95 border-emerald-500/40 text-emerald-200"
                : "bg-[#281c1c]/95 border-red-500/40 text-red-200"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle size={15} className="text-red-400 shrink-0" />
            )}
            <span className="font-medium">{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="text-neutral-400 hover:text-white p-0.5 ml-1"
            >
              <X size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============================================================
          Group Editor & Creation Modal (Screenshots 1, 2, 3, 4, 5)
          ============================================================ */}
      <GroupEditorModal
        key={editingGroup?.id ?? (isCreatingNewGroup ? "create-new" : "closed")}
        open={isCreatingNewGroup || !!editingGroup}
        initialFolder={editingGroup}
        onClose={() => {
          setIsCreatingNewGroup(false);
          setEditingGroup(null);
        }}
        onSave={handleSaveGroup}
      />

      {/* Settings Modal */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
};

// ============================================================
// Sortable Group Card Wrapper (U5)
// ============================================================

interface SortableGroupCardProps extends GroupCardProps {}

const SortableGroupCard: React.FC<SortableGroupCardProps> = (props) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.folder.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 30 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <GroupCard {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
};

// ============================================================
// Group Card Component (Single Row with 2x2 Preview)
// ============================================================

interface GroupCardProps {
  folder: Folder;
  isMenuOpen: boolean;
  onToggleMenu: (e: React.MouseEvent) => void;
  onCloseMenu: () => void;
  onOpenPopup: () => void;
  onEdit: () => void;
  onRepairShortcut: () => void;
  onDelete: () => void;
  dragHandleProps?: Record<string, any>;
}

const GroupCard: React.FC<GroupCardProps> = ({
  folder,
  isMenuOpen,
  onToggleMenu,
  onCloseMenu,
  onOpenPopup,
  onEdit,
  onRepairShortcut,
  onDelete,
  dragHandleProps,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const addApp = useFolderStore((s) => s.addApp);
  const is3x3 = folder.gridPreview === "3x3";
  const previewApps = is3x3 ? folder.apps.slice(0, 9) : folder.apps.slice(0, 4);
  const horizontalApps = folder.apps.slice(0, 6);
  const remainingCount = folder.apps.length - 6;

  const handleCardDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;

    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      const file = e.dataTransfer.files[i];
      const filePath = (file as any).path || file.name;
      if (!filePath) continue;

      const pathLower = filePath.toLowerCase();
      if (
        pathLower.includes("deskfolder.exe") ||
        (pathLower.endsWith(".lnk") && pathLower.includes(folder.name.toLowerCase()))
      ) {
        continue;
      }

      const base = filePath.split(/[\/\\]/).pop() ?? filePath;
      const appName = base.replace(/\.(exe|lnk|bat|cmd|url)$/i, "");
      const extracted = await extractIcon(filePath);
      const icon = extracted || "icon:app";

      try {
        await addApp(folder.id, appName, filePath, undefined, undefined, icon);
      } catch (err) {
        console.warn("Failed to drop-add app:", err);
      }
    }
  };

  return (
    <div
      onClick={onEdit}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragOver(false);
      }}
      onDrop={handleCardDrop}
      className={`w-full transition-all duration-150 rounded-xl p-3 flex items-center justify-between border relative group cursor-pointer ${
        isDragOver
          ? "bg-[#282a32] border-sky-400/80 shadow-lg shadow-sky-500/10 scale-[1.01]"
          : "bg-[#202126] hover:bg-[#26272e] border-white/[0.05]"
      }`}
    >
      {/* Left: Drag Handle + 2x2 / 3x3 Grid Icon + Info */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Drag Handle (U5) */}
        <div
          {...dragHandleProps}
          onClick={(e) => e.stopPropagation()}
          className="p-1 rounded-md text-neutral-500 hover:text-white hover:bg-white/[0.06] cursor-grab active:cursor-grabbing transition-colors shrink-0 -ml-1"
          title="Drag to reorder groups"
        >
          <GripVertical size={16} />
        </div>

        {/* Thumbnail Box */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="w-12 h-12 rounded-xl bg-[#151619] border border-white/[0.06] p-1 flex items-center justify-center shrink-0 shadow-inner group-hover:border-white/15 transition-colors"
          title="Click to edit group"
        >
          {is3x3 ? (
            previewApps.length === 1 ? (
              <AppIcon value={previewApps[0].icon} size={32} shape="rounded-lg" />
            ) : previewApps.length > 1 ? (
              <div className="w-full h-full grid grid-cols-3 gap-0.5 place-items-center">
                {previewApps.map((app) => (
                  <AppIcon
                    key={app.id}
                    value={app.icon}
                    size={11}
                    shape="rounded-[2px]"
                  />
                ))}
              </div>
            ) : (
              <FolderIcon size={18} className="text-neutral-500" />
            )
          ) : previewApps.length === 1 ? (
            <AppIcon value={previewApps[0].icon} size={32} shape="rounded-lg" />
          ) : previewApps.length > 1 ? (
            <div className="w-full h-full grid grid-cols-2 gap-1 place-items-center">
              {previewApps.map((app) => (
                <AppIcon
                  key={app.id}
                  value={app.icon}
                  size={17}
                  shape="rounded-sm"
                />
              ))}
            </div>
          ) : (
            <FolderIcon size={18} className="text-neutral-500" />
          )}
        </div>

        {/* Group Name & Horizontal App Icons */}
        <div className="flex flex-col min-w-0">
          <span className="text-[14px] font-semibold text-white truncate group-hover:text-white transition-colors">
            {folder.name}
          </span>

          {/* App Icons Row */}
          <div className="flex items-center gap-1.5 mt-1">
            {horizontalApps.map((app) => (
              <AppIcon
                key={app.id}
                value={app.icon}
                size={18}
                shape="rounded-md"
              />
            ))}
            {remainingCount > 0 && (
              <span className="text-[11px] font-medium text-neutral-400 ml-0.5">
                +{remainingCount}
              </span>
            )}
            {folder.apps.length === 0 && (
              <span className="text-[11px] text-neutral-500 italic">
                No apps yet
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div
        className="flex items-center gap-1 shrink-0 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onEdit}
          className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          title="Edit apps in this group"
        >
          <Pencil size={15} />
        </button>

        <button
          onClick={onToggleMenu}
          className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          title="Options"
        >
          <MoreHorizontal size={16} />
        </button>

        {/* Context Menu Dropdown */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              className="absolute right-0 top-full mt-1 w-48 rounded-xl bg-[#232428] border border-white/10 shadow-2xl p-1 z-50 text-xs text-neutral-300"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  onCloseMenu();
                  onOpenPopup();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.08] hover:text-white transition-colors"
              >
                <FolderOpen size={14} className="text-white/80" />
                <span>Open Popup</span>
              </button>
              <button
                onClick={() => {
                  onCloseMenu();
                  onEdit();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.08] hover:text-white transition-colors"
              >
                <Pencil size={14} />
                <span>Edit Group</span>
              </button>
              <button
                onClick={() => {
                  onCloseMenu();
                  onRepairShortcut();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.08] hover:text-white transition-colors"
              >
                <Wrench size={14} />
                <span>Repair Shortcut</span>
              </button>
              <div className="h-px bg-white/10 my-1" />
              <button
                onClick={() => {
                  onCloseMenu();
                  onDelete();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
              >
                <Trash2 size={14} />
                <span>Delete Group</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Dashboard;

