// ============================================================
// DeskFolder — Windows 11 Native Fluent Overlay Window
// ============================================================

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus,
  Pencil,
  X,
  Pin,
  AlertCircle,
  Play,
  Trash2,
  FolderOpen,
  Search,
} from "lucide-react";
import clsx from "clsx";
import { useFolderStore } from "../lib/store";
import {
  closeOverlay,
  launchApp,
  editFolderInDashboard,
  addAppInDashboard,
  setOverlayAlwaysOnTop,
  startOverlayDragging,
  openFolder,
  extractIcon,
  revealInExplorer,
  showDashboard,
} from "../lib/tauri";
import type { AppEntry, Folder } from "../lib/types";
import AppIcon from "./AppIcon";

interface OverlayProps {
  devBackdrop?: boolean;
}

export const Overlay: React.FC<OverlayProps> = ({ devBackdrop = false }) => {
  const activeOverlayFolder = useFolderStore((s) => s.activeOverlayFolder);
  const desktopContextMenuFolder = useFolderStore((s) => s.desktopContextMenuFolder);
  const reorderApps = useFolderStore((s) => s.reorderApps);
  const removeApp = useFolderStore((s) => s.removeApp);
  const addApp = useFolderStore((s) => s.addApp);
  const deleteFolder = useFolderStore((s) => s.deleteFolder);

  const [open, setOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    app: AppEntry;
    x: number;
    y: number;
  } | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const isDraggingAppTileRef = useRef(false);
  const isDraggingWindowRef = useRef(false);
  const lastWindowDragTimeRef = useRef<number>(0);
  const openTimeRef = useRef<number>(0);

  const isDesktopMenu = Boolean(desktopContextMenuFolder);
  const folder: Folder | null = desktopContextMenuFolder || activeOverlayFolder;

  const cols = folder?.columns ?? 4;
  const showHeader = folder?.showHeader ?? true;
  const showLabels = folder?.showLabels ?? true;
  const layout = folder?.layout ?? "Default";

  // Check prefers-reduced-motion
  const prefersReduced = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (folder) {
      setOpen(true);
      setLaunchError(null);
      setContextMenu(null);
      isDraggingWindowRef.current = false;
      lastWindowDragTimeRef.current = 0;
      openTimeRef.current = Date.now();
    }
  }, [folder]);

  const dismiss = useCallback(() => {
    setOpen(false);
    setIsLocked(false);
    setContextMenu(null);
    isDraggingWindowRef.current = false;
    setOverlayAlwaysOnTop(false).catch(() => {});
  }, []);

  // Global mouseup to reset window dragging state
  useEffect(() => {
    const handleMouseUp = () => {
      if (isDraggingWindowRef.current) {
        isDraggingWindowRef.current = false;
        lastWindowDragTimeRef.current = Date.now();
      }
    };
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, []);

  // Dismiss on window blur (unless locked/pinned or currently dragging window/tile)
  useEffect(() => {
    if (!open || isLocked) return;
    const handleBlur = () => {
      // Do NOT dismiss if window dragging or tile dragging was active recently
      if (
        isDraggingWindowRef.current ||
        isDraggingAppTileRef.current ||
        Date.now() - lastWindowDragTimeRef.current < 2000 ||
        Date.now() - openTimeRef.current < 400
      ) {
        return;
      }
      dismiss();
    };
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [open, isLocked, dismiss]);

  // Click outside card (unless locked/pinned)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (contextMenu) {
        setContextMenu(null);
      }
      if (!isLocked && overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        if (!isDraggingWindowRef.current && Date.now() - lastWindowDragTimeRef.current > 800) {
          dismiss();
        }
      }
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 100);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [open, isLocked, contextMenu, dismiss]);

  // Escape key dismisses context menu first, then overlay
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (contextMenu) {
          setContextMenu(null);
        } else {
          dismiss();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, contextMenu, dismiss]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const handleDragStart = (_e: DragStartEvent) => {
    isDraggingAppTileRef.current = true;
    setContextMenu(null);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setTimeout(() => {
      isDraggingAppTileRef.current = false;
    }, 150);
    const { active, over } = e;
    if (!over || active.id === over.id || !folder) return;
    const ids = folder.apps.map((a) => a.id);
    const from = ids.indexOf(active.id as string);
    const to = ids.indexOf(over.id as string);
    if (from < 0 || to < 0) return;
    await reorderApps(folder.id, arrayMove(ids, from, to));
  };

  const sortedApps = useMemo(() => {
    if (!folder) return [];
    const list = [...folder.apps];
    if (folder.sortBy === "mru") {
      list.sort((a, b) => (b.lastLaunched ?? 0) - (a.lastLaunched ?? 0));
    } else if (folder.sortBy === "alphabetical") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [folder]);

  const displayApps = useMemo(() => {
    if (!searchQuery.trim()) return sortedApps;
    const q = searchQuery.toLowerCase().trim();
    return sortedApps.filter(
      (a) => a.name.toLowerCase().includes(q) || a.path.toLowerCase().includes(q)
    );
  }, [sortedApps, searchQuery]);

  const handleLaunch = async (app: AppEntry) => {
    if (isDraggingAppTileRef.current || isDraggingWindowRef.current) return;
    try {
      setLaunchError(null);
      await launchApp(app.path, app.arguments, app.workingDir, folder?.id, app.id);
      if (!isLocked) {
        dismiss();
      }
    } catch (err: any) {
      setLaunchError(typeof err === "string" ? err : err?.message || "Failed to launch");
    }
  };

  const toggleLock = () => {
    const next = !isLocked;
    setIsLocked(next);
    setOverlayAlwaysOnTop(next).catch(() => {});
  };

  if (!folder) return null;

  const ICON_W = 60;
  const GAP = 8;
  const PAD = 12;
  const cardWidth = isDesktopMenu ? 210 : PAD * 2 + cols * ICON_W + (cols - 1) * GAP;
  const tileHeight = showLabels ? 76 : 56;

  // Background style based on layout setting
  const getCardStyle = () => {
    if (isDesktopMenu) {
      return {
        backgroundColor: "rgba(28, 29, 33, 0.96)",
        backdropFilter: "blur(32px) saturate(150%)",
        WebkitBackdropFilter: "blur(32px) saturate(150%)",
      };
    }
    switch (layout.toLowerCase()) {
      case "acrylic":
        return {
          backgroundColor: "rgba(30, 31, 35, 0.88)",
          backdropFilter: "blur(32px) saturate(150%)",
          WebkitBackdropFilter: "blur(32px) saturate(150%)",
        };
      case "solid":
        return {
          backgroundColor: "#1e1f23",
        };
      case "minimal":
        return {
          backgroundColor: "rgba(24, 25, 28, 0.94)",
        };
      default:
        return {
          backgroundColor: "rgba(32, 33, 37, 0.92)",
          backdropFilter: "blur(28px) saturate(140%)",
          WebkitBackdropFilter: "blur(28px) saturate(140%)",
        };
    }
  };

  return (
    <div
      className={clsx(
        "min-h-screen w-full flex items-start justify-center select-none cursor-default",
        devBackdrop && "bg-neutral-900"
      )}
      style={{ paddingTop: 4 }}
    >
      <AnimatePresence onExitComplete={() => closeOverlay().catch(() => {})}>
        {open && (
          <motion.div
            ref={overlayRef}
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: -4 }}
            animate={prefersReduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: -4 }}
            transition={{ duration: prefersReduced ? 0.01 : 0.12, ease: [0.16, 1, 0.3, 1] }}
            onDragOver={(e) => {
              if (isDesktopMenu) return;
              e.preventDefault();
              e.stopPropagation();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={async (e) => {
              if (isDesktopMenu || !folder) return;
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
                  console.warn("Failed to drop-add app to overlay:", err);
                }
              }
            }}
            style={{
              width: cardWidth,
              ...getCardStyle(),
            }}
            className={`relative rounded-[16px] overflow-hidden shadow-2xl transition-all duration-150 ${
              isDragOver
                ? "border-2 border-sky-400/90 shadow-sky-500/20 scale-[1.02]"
                : "border border-white/[0.10]"
            }`}
          >
            {isDesktopMenu ? (
              /* Custom Desktop Right-Click Context Menu */
              <div className="p-1.5 flex flex-col gap-1 text-white select-none">
                {/* Header with Group Name */}
                <div className="px-2.5 py-1.5 border-b border-white/[0.08] flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-white/90 truncate">{folder.name}</span>
                  <span className="text-[10px] text-white/40">{folder.apps.length} apps</span>
                </div>

                {/* Open Folder */}
                <button
                  onClick={async () => {
                    dismiss();
                    await openFolder(folder.id);
                  }}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] text-left text-white text-xs cursor-default transition-colors"
                >
                  <FolderOpen size={14} className="text-white/80" />
                  <span>Open Folder</span>
                </button>

                {/* Add Application */}
                <button
                  onClick={() => {
                    dismiss();
                    addAppInDashboard(folder.id).catch(() => {});
                  }}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] text-left text-white text-xs cursor-default transition-colors"
                >
                  <Plus size={14} className="text-white/80" />
                  <span>Add Application</span>
                </button>

                {/* Edit Group */}
                <button
                  onClick={() => {
                    dismiss();
                    editFolderInDashboard(folder.id).catch(() => {});
                  }}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] text-left text-white text-xs cursor-default transition-colors"
                >
                  <Pencil size={14} className="text-white/80" />
                  <span>Edit Group</span>
                </button>

                <div className="h-px bg-white/[0.08] my-0.5" />

                {/* Delete Group */}
                <button
                  onClick={async () => {
                    dismiss();
                    await deleteFolder(folder.id);
                  }}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-red-500/20 text-left text-red-400 text-xs cursor-default transition-colors"
                >
                  <Trash2 size={14} />
                  <span>Delete Group</span>
                </button>
              </div>
            ) : (
              /* Standard Folder Popover Card */
              <>
                {/* Top Draggable Header Bar */}
                <div
                  onMouseDown={(e) => {
                    if (e.button === 0 && !(e.target as HTMLElement).closest(".no-drag")) {
                      isDraggingWindowRef.current = true;
                      lastWindowDragTimeRef.current = Date.now();
                      startOverlayDragging();
                    }
                  }}
                  className="flex items-center justify-between px-3 pt-2.5 pb-1 cursor-move select-none"
                >
                  {/* Folder Name on Left (if showHeader is true) */}
                  {showHeader ? (
                    <span className="text-[12px] font-semibold text-white/90 truncate pointer-events-none pl-0.5">
                      {folder.name}
                    </span>
                  ) : (
                    <span className="text-[11px] text-white/30 pointer-events-none pl-0.5">•••</span>
                  )}

                  {/* Action Buttons on Right (Pin/Lock, Close) */}
                  <div className="flex items-center gap-1 no-drag" onMouseDown={(e) => e.stopPropagation()}>
                    <button
                      onClick={toggleLock}
                      className={clsx(
                        "p-1 rounded-md transition-colors no-drag cursor-default",
                        isLocked
                          ? "bg-white/20 text-white border border-white/30 shadow-sm"
                          : "text-white/40 hover:text-white/80 hover:bg-white/[0.07]"
                      )}
                      title={isLocked ? "Pinned on top (Click to unpin)" : "Pin on top (Keeps folder open)"}
                    >
                      <Pin size={12} className={clsx("transition-transform", isLocked && "-rotate-45")} />
                    </button>

                    <button
                      onClick={dismiss}
                      className="p-1 rounded-md text-white/40 hover:text-white/80 hover:bg-white/[0.07] transition-colors no-drag cursor-default"
                      title="Close (Esc)"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>

                {/* Search Bar when >= 5 apps (U3) */}
                {folder.apps.length >= 5 && (
                  <div className="px-3 pt-0.5 pb-1 no-drag">
                    <div className="relative flex items-center">
                      <Search size={12} className="absolute left-2.5 text-white/40 pointer-events-none" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filter apps..."
                        className="w-full bg-white/[0.06] hover:bg-white/[0.09] focus:bg-white/[0.12] border border-white/[0.08] focus:border-white/30 focus:outline-none text-white text-[11px] pl-7 pr-6 py-1 rounded-lg transition-colors placeholder:text-white/30 font-medium"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery("")}
                          className="absolute right-1.5 p-0.5 text-white/40 hover:text-white"
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Launch Error Banner */}
                {launchError && (
                  <div className="mx-2.5 my-1 p-2 rounded-xl bg-red-950/80 border border-red-800/60 flex items-start gap-2 text-[10px] text-red-200">
                    <AlertCircle size={12} className="text-red-400 shrink-0 mt-0.5" />
                    <span className="flex-1 min-w-0">{launchError}</span>
                    <button onClick={() => setLaunchError(null)} className="text-red-400 hover:text-red-200 no-drag">
                      <X size={10} />
                    </button>
                  </div>
                )}

                {/* Empty State or Icon Grid (U4) */}
                {folder.apps.length === 0 ? (
                  <div className="px-4 py-6 flex flex-col items-center justify-center text-center no-drag">
                    <span className="text-[11px] text-white/60 mb-2.5 font-medium">Add apps from the dashboard</span>
                    <button
                      onClick={() => {
                        dismiss();
                        editFolderInDashboard(folder.id).catch(() => {});
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-default"
                    >
                      <Plus size={13} />
                      <span>Add Apps</span>
                    </button>
                  </div>
                ) : (
                  <div className="px-3 pt-1.5 pb-1">
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={displayApps.map((a) => a.id)}
                        strategy={rectSortingStrategy}
                      >
                        <div
                          className="grid"
                          style={{
                            gridTemplateColumns: `repeat(${cols}, ${ICON_W}px)`,
                            gap: `${GAP}px`,
                          }}
                        >
                          {displayApps.map((app) => (
                            <SortableAppTile
                              key={app.id}
                              app={app}
                              showLabel={showLabels}
                              tileHeight={tileHeight}
                              onLaunch={() => handleLaunch(app)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                const rect = overlayRef.current?.getBoundingClientRect();
                                if (rect) {
                                  setContextMenu({
                                    app,
                                    x: Math.min(e.clientX - rect.left, cardWidth - 150),
                                    y: Math.max(10, e.clientY - rect.top - 10),
                                  });
                                }
                              }}
                            />
                          ))}

                          {/* Add tile */}
                          {!searchQuery && (
                            <button
                              onClick={() => {
                                dismiss();
                                addAppInDashboard(folder.id).catch(() => {});
                              }}
                              className="flex flex-col items-center justify-center gap-1 group outline-none no-drag cursor-default"
                              style={{ width: ICON_W, height: tileHeight }}
                              title="Add app to this group"
                            >
                              <div className="w-[46px] h-[46px] rounded-[13px] border border-dashed border-white/20 flex items-center justify-center bg-white/[0.03] group-hover:bg-white/[0.07] group-hover:border-white/35 transition-all duration-150">
                                <Plus size={18} className="text-white/35 group-hover:text-white/60" />
                              </div>
                              {showLabels && (
                                <span className="text-[10px] text-white/35 group-hover:text-white/60 truncate">Add</span>
                              )}
                            </button>
                          )}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                )}

                {/* Footer: status / edit button */}
                <div className="flex items-center justify-end px-3 pb-2 pt-0">
                  <button
                    onClick={() => {
                      dismiss();
                      editFolderInDashboard(folder.id).catch(() => {});
                    }}
                    className="p-1 rounded-md text-white/30 hover:text-white/80 hover:bg-white/[0.07] transition-colors no-drag flex items-center gap-1 text-[10px] cursor-default"
                    title="Edit Group in Dashboard"
                  >
                    <Pencil size={12} />
                  </button>
                </div>

                {/* Fluent App Right-Click Context Menu */}
                {contextMenu && (
                  <div
                    style={{
                      top: contextMenu.y,
                      left: contextMenu.x,
                      backgroundColor: "#2b2c32",
                    }}
                    className="absolute z-50 w-40 rounded-xl border border-white/10 shadow-2xl p-1 flex flex-col gap-0.5 text-neutral-200 text-xs no-drag select-none"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => {
                        const app = contextMenu.app;
                        setContextMenu(null);
                        handleLaunch(app);
                      }}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] text-left text-white text-[11px] cursor-default"
                    >
                      <Play size={12} className="text-white/80" />
                      <span>Open</span>
                    </button>

                    <button
                      onClick={() => {
                        const app = contextMenu.app;
                        setContextMenu(null);
                        revealInExplorer(app.path).catch(() => {});
                      }}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] text-left text-neutral-300 text-[11px] cursor-default"
                    >
                      <FolderOpen size={12} />
                      <span>Reveal in Explorer</span>
                    </button>

                    <button
                      onClick={() => {
                        dismiss();
                        editFolderInDashboard(folder.id).catch(() => {});
                      }}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] text-left text-neutral-300 text-[11px] cursor-default"
                    >
                      <Pencil size={12} />
                      <span>Edit in App</span>
                    </button>

                    <div className="h-px bg-white/[0.08] my-0.5" />

                    <button
                      onClick={async () => {
                        const appId = contextMenu.app.id;
                        setContextMenu(null);
                        await removeApp(folder.id, appId);
                      }}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-red-500/15 text-left text-red-400 text-[11px] cursor-default"
                    >
                      <Trash2 size={12} />
                      <span>Remove</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ----------------------------------------------------------------
// Sortable App Tile
// ----------------------------------------------------------------

interface SortableAppTileProps {
  app: AppEntry;
  showLabel: boolean;
  tileHeight: number;
  onLaunch: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const SortableAppTile: React.FC<SortableAppTileProps> = ({
  app,
  showLabel,
  tileHeight,
  onLaunch,
  onContextMenu,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: app.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    width: 60,
    height: tileHeight,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onContextMenu={onContextMenu}
      className={clsx(
        "flex flex-col items-center justify-center gap-1 select-none outline-none no-drag cursor-default",
        "rounded-[12px] p-0.5 transition-colors duration-100",
        isDragging
          ? "bg-white/10"
          : "hover:bg-white/[0.07] active:bg-white/[0.12]"
      )}
      onClick={onLaunch}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onLaunch();
        }
      }}
      title={`${app.name}\n${app.path}${app.missing ? "\n(File missing)" : ""}`}
    >
      <AppIcon value={app.icon} size={46} missing={app.missing} shape="rounded-[13px]" />
      {showLabel && (
        <span className="text-[10px] font-medium text-white/75 truncate w-full text-center px-0.5">
          {app.name}
        </span>
      )}
    </div>
  );
};

export default Overlay;
