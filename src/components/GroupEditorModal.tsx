// ============================================================
// DeskFolder — Group Editor Modal
// ============================================================

import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Minus,
  Square,
  Plus,
  Settings,
  Folder as FolderIcon,
  Pencil,
  Trash2,
  Search,
  FolderOpen,
} from "lucide-react";
import AppIcon from "./AppIcon";
import GridIconModal from "./GridIconModal";
import CustomizeModal from "./CustomizeModal";
import AddAppDialog from "./AddAppDialog";
import { revealInExplorer } from "../lib/tauri";
import type { AppEntry, Folder } from "../lib/types";

interface GroupEditorModalProps {
  open: boolean;
  initialFolder?: Folder | null;
  onClose: () => void;
  onSave: (folderData: {
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
  }) => Promise<void>;
}

export const GroupEditorModal: React.FC<GroupEditorModalProps> = ({
  open,
  initialFolder,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState(initialFolder?.name ?? "App Group");
  const [apps, setApps] = useState<AppEntry[]>(
    Array.isArray(initialFolder?.apps) ? initialFolder!.apps : []
  );
  const [gridPreview, setGridPreview] = useState<"2x2" | "3x3">(
    initialFolder?.gridPreview ?? "2x2"
  );
  const [columns, setColumns] = useState<number>(initialFolder?.columns ?? 4);
  const [layout, setLayout] = useState<string>(initialFolder?.layout ?? "Default");
  const [showHeader, setShowHeader] = useState<boolean>(
    initialFolder?.showHeader ?? true
  );
  const [showLabels, setShowLabels] = useState<boolean>(
    initialFolder?.showLabels ?? true
  );
  const [sortBy, setSortBy] = useState<"custom" | "mru" | "alphabetical">(
    initialFolder?.sortBy ?? "custom"
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [gridIconModalOpen, setGridIconModalOpen] = useState(false);
  const [customizeModalOpen, setCustomizeModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<AppEntry | null>(null);
  const [addAppDialogOpen, setAddAppDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync when initialFolder changes
  useEffect(() => {
    if (open && initialFolder) {
      setName(initialFolder.name ?? "App Group");
      setApps(Array.isArray(initialFolder.apps) ? initialFolder.apps : []);
      setGridPreview(initialFolder.gridPreview ?? "2x2");
      setColumns(initialFolder.columns ?? 4);
      setLayout(initialFolder.layout ?? "Default");
      setShowHeader(initialFolder.showHeader ?? true);
      setShowLabels(initialFolder.showLabels ?? true);
      setSortBy(initialFolder.sortBy ?? "custom");
    } else if (open && !initialFolder) {
      setName("App Group");
      setApps([]);
      setGridPreview("2x2");
      setColumns(4);
      setLayout("Default");
      setShowHeader(true);
      setShowLabels(true);
      setSortBy("custom");
    }
  }, [open, initialFolder]);

  const previewApps = useMemo(() => {
    const list = Array.isArray(apps) ? apps : [];
    return gridPreview === "3x3" ? list.slice(0, 9) : list.slice(0, 4);
  }, [apps, gridPreview]);

  const filteredApps = useMemo(() => {
    const list = Array.isArray(apps) ? apps : [];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (a) =>
        (a?.name && a.name.toLowerCase().includes(q)) ||
        (a?.path && a.path.toLowerCase().includes(q))
    );
  }, [apps, searchQuery]);

  const handleSaveAll = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({
        id: initialFolder?.id,
        name: name.trim(),
        apps,
        gridPreview,
        columns,
        layout,
        showHeader,
        showLabels,
        sortBy,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleAppSubmit = (newAppData: {
    name: string;
    path: string;
    arguments?: string;
    workingDir?: string;
    icon: string;
  }) => {
    if (editingApp) {
      setApps(
        apps.map((a) => (a.id === editingApp.id ? { ...a, ...newAppData } : a))
      );
    } else {
      const newApp: AppEntry = {
        id: "app-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: newAppData.name,
        path: newAppData.path,
        arguments: newAppData.arguments,
        workingDir: newAppData.workingDir,
        icon: newAppData.icon,
      };
      setApps([...apps, newApp]);
    }
    setAddAppDialogOpen(false);
    setEditingApp(null);
  };

  const handleRemoveApp = (appId: string) => {
    setApps(apps.filter((a) => a.id !== appId));
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm select-none">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-lg rounded-2xl bg-[#1e1f23] border border-white/[0.08] shadow-2xl p-6 flex flex-col max-h-[92vh] text-neutral-200"
          >
            {/* Top Window Title / Close Controls */}
            <div className="flex items-center justify-end gap-1 mb-2 -mt-2 -mr-2">
              <button
                className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.08]"
                onClick={onClose}
              >
                <Minus size={14} />
              </button>
              <button
                className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.08]"
                onClick={onClose}
              >
                <Square size={12} />
              </button>
              <button
                className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-red-600/80"
                onClick={onClose}
              >
                <X size={14} />
              </button>
            </div>

            {/* Group Name & Icon Selection Header (Screenshot 1) */}
            <div className="flex items-start justify-between gap-4 mb-5">
              {/* Left: Editable Group Name */}
              <div className="flex flex-col flex-1 min-w-0">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="App Group..."
                  className="text-[22px] font-bold text-white bg-transparent border-b border-transparent hover:border-white/10 focus:border-white/40 focus:outline-none transition-colors w-full tracking-tight"
                />
                <span className="text-xs text-neutral-400 mt-1">Group Name</span>
              </div>

              {/* Right: Desktop Icon Box Button */}
              <div
                onClick={() => setGridIconModalOpen(true)}
                className="w-16 h-16 rounded-2xl bg-[#28292e] border border-white/[0.08] hover:border-white/20 p-1.5 flex items-center justify-center cursor-pointer group shadow-inner relative transition-all"
                title="Desktop Icon Preview (Click to toggle 2x2 / 3x3)"
              >
                {gridPreview === "3x3" ? (
                  previewApps.length === 1 ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <AppIcon value={previewApps[0].icon} size={42} shape="rounded-xl" />
                    </div>
                  ) : previewApps.length > 1 ? (
                    <div className="w-full h-full grid grid-cols-3 gap-0.5 place-items-center p-0.5">
                      {previewApps.map((app) => (
                        <AppIcon
                          key={app.id}
                          value={app.icon}
                          size={14}
                          shape="rounded-sm"
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="w-full h-full border border-dashed border-white/20 rounded-xl flex items-center justify-center text-neutral-500 group-hover:text-neutral-300">
                      <FolderIcon size={24} strokeWidth={1.5} />
                    </div>
                  )
                ) : previewApps.length === 1 ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <AppIcon value={previewApps[0].icon} size={42} shape="rounded-xl" />
                  </div>
                ) : previewApps.length > 1 ? (
                  <div className="w-full h-full grid grid-cols-2 gap-1 place-items-center">
                    {previewApps.map((app) => (
                      <AppIcon
                        key={app.id}
                        value={app.icon}
                        size={22}
                        shape="rounded-md"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="w-full h-full border border-dashed border-white/20 rounded-xl flex items-center justify-center text-neutral-500 group-hover:text-neutral-300">
                    <FolderIcon size={24} strokeWidth={1.5} />
                  </div>
                )}
              </div>
            </div>

            {/* Inner Content Card (Screenshot 1) */}
            <div className="flex-1 rounded-xl bg-[#25262c] border border-white/[0.06] p-4 flex flex-col min-h-[260px] overflow-hidden">
              {/* Card Action Header */}
              <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-white/[0.04]">
                {/* In-Group Search Bar */}
                <div className="relative flex items-center flex-1 max-w-[240px]">
                  <Search
                    size={13}
                    className="absolute left-2.5 text-neutral-400 pointer-events-none"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search apps in group..."
                    className="w-full bg-[#1e1f23] border border-white/[0.06] focus:border-white/30 focus:outline-none text-white text-xs pl-8 pr-7 py-1.5 rounded-lg transition-colors placeholder:text-neutral-500 font-medium"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 p-0.5 text-neutral-400 hover:text-white"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCustomizeModalOpen(true)}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                    title="Customize Group"
                  >
                    <Settings size={17} />
                  </button>
                  <button
                    onClick={() => {
                      setEditingApp(null);
                      setAddAppDialogOpen(true);
                    }}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                    title="Add Application"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>

              {/* Apps List inside the Group */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {apps.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-10 text-neutral-500">
                    <p className="text-xs">No applications added to this group yet.</p>
                    <button
                      onClick={() => {
                        setEditingApp(null);
                        setAddAppDialogOpen(true);
                      }}
                      className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-neutral-200 text-xs transition-colors"
                    >
                      <Plus size={14} />
                      <span>Add First App</span>
                    </button>
                  </div>
                ) : filteredApps.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-10 text-neutral-500">
                    <p className="text-xs">No applications matching "{searchQuery}"</p>
                    <button
                      onClick={() => setSearchQuery("")}
                      className="mt-2 text-xs text-neutral-300 hover:text-white underline"
                    >
                      Clear search
                    </button>
                  </div>
                ) : (
                  filteredApps.map((app) => (
                    <div
                      key={app.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-[#1d1e22] border border-white/[0.04] hover:border-white/10 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <AppIcon
                          value={app.icon}
                          size={38}
                          shape="rounded-xl"
                          missing={app.missing}
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-semibold text-white truncate">
                            {app.name}
                          </span>
                          <span className="text-[11px] text-neutral-400 truncate font-mono">
                            {app.path}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <button
                          onClick={() => revealInExplorer(app.path)}
                          className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.06] text-xs transition-colors"
                          title="Reveal in Explorer"
                        >
                          <FolderOpen size={13} />
                        </button>
                        <button
                          onClick={() => {
                            setEditingApp(app);
                            setAddAppDialogOpen(true);
                          }}
                          className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.06] text-xs transition-colors"
                          title="Edit App"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleRemoveApp(app.id)}
                          className="p-1.5 rounded-md text-neutral-400 hover:text-red-400 hover:bg-red-500/10 text-xs transition-colors"
                          title="Remove App"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Bottom-Right Save Button */}
            <div className="mt-5 flex justify-end gap-3 items-center">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAll}
                disabled={!name.trim() || saving}
                className="px-6 py-2 rounded-lg bg-white text-black font-semibold text-xs tracking-wide shadow-sm hover:bg-neutral-200 active:scale-[0.98] disabled:opacity-40 disabled:hover:bg-white transition-all"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </motion.div>

          {/* Desktop Icon Grid Preview Selector Modal */}
          <GridIconModal
            open={gridIconModalOpen}
            currentPreview={gridPreview}
            onClose={() => setGridIconModalOpen(false)}
            onSelectPreview={(preview) => {
              setGridPreview(preview);
            }}
          />

          {/* Customize Modal */}
          <CustomizeModal
            open={customizeModalOpen}
            folder={{
              id: initialFolder?.id ?? "temp",
              name,
              apps,
              createdAt: initialFolder?.createdAt ?? new Date().toISOString(),
              columns,
              layout,
              showHeader,
              showLabels,
              gridPreview,
              sortBy,
            }}
            onClose={() => setCustomizeModalOpen(false)}
            onSave={(customization) => {
              setColumns(customization.columns);
              setLayout(customization.layout);
              setShowHeader(customization.showHeader);
              setShowLabels(customization.showLabels);
              setGridPreview(customization.gridPreview);
              if (customization.sortBy) {
                setSortBy(customization.sortBy);
              }
            }}
          />

          {/* Add / Edit App Dialog */}
          <AddAppDialog
            open={addAppDialogOpen}
            initialApp={editingApp}
            currentFolderId={initialFolder?.id}
            title={editingApp ? "Edit Application" : "Add Application"}
            submitLabel="Save"
            onSubmit={handleAppSubmit}
            onCancel={() => {
              setAddAppDialogOpen(false);
              setEditingApp(null);
            }}
          />
        </div>
      )}
    </AnimatePresence>
  );
};

export default GroupEditorModal;
