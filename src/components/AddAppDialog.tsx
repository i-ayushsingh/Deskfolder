// ============================================================
// DeskFolder — Add / Edit Application Dialog (B1, B2, B3, B4)
// ============================================================

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  FileSearch,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Search,
  Clipboard,
  Layers,
  Sparkles,
  Plus,
  FolderOpen,
  ArrowRight,
  RotateCw,
} from "lucide-react";
import { extractIcon, validateApp, isTauri } from "../lib/tauri";
import { useFolderStore } from "../lib/store";
import AppIcon from "./AppIcon";
import type { AppEntry, InstalledAppEntry } from "../lib/types";

interface AddAppDialogProps {
  open: boolean;
  initialApp?: AppEntry | null;
  currentFolderId?: string;
  title?: string;
  submitLabel?: string;
  onSubmit: (app: {
    name: string;
    path: string;
    arguments?: string;
    workingDir?: string;
    icon: string;
  }) => void | Promise<void>;
  onCancel: () => void;
}

export const AddAppDialog: React.FC<AddAppDialogProps> = ({
  open,
  initialApp = null,
  currentFolderId,
  title = "Add Application",
  submitLabel = "Save",
  onSubmit,
  onCancel,
}) => {
  const folders = useFolderStore((s) => s.folders);
  const installedAppsCache = useFolderStore((s) => s.installedAppsCache);
  const fetchInstalledApps = useFolderStore((s) => s.fetchInstalledApps);

  const [tab, setTab] = useState<"installed" | "manual" | "groups">(
    initialApp ? "manual" : "installed"
  );
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [arguments_, setArguments] = useState("");
  const [workingDir, setWorkingDir] = useState("");
  const [icon, setIcon] = useState<string>("icon:app");
  const [busy, setBusy] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pathValid, setPathValid] = useState<boolean | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [installedApps, setInstalledApps] = useState<InstalledAppEntry[]>(
    installedAppsCache || []
  );
  const [loadingInstalled, setLoadingInstalled] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadInstalled = useCallback(async (forceRefresh = false) => {
    setLoadingInstalled(true);
    try {
      const apps = await fetchInstalledApps(forceRefresh);
      setInstalledApps(apps);
    } catch (err) {
      console.warn("Failed to load installed apps:", err);
    } finally {
      setLoadingInstalled(false);
    }
  }, [fetchInstalledApps]);

  // Load installed apps when dialog opens
  useEffect(() => {
    if (open) {
      setName(initialApp?.name ?? "");
      setPath(initialApp?.path ?? "");
      setArguments(initialApp?.arguments ?? "");
      setWorkingDir(initialApp?.workingDir ?? "");
      setIcon(initialApp?.icon ?? "icon:app");
      setShowAdvanced(Boolean(initialApp?.arguments || initialApp?.workingDir));
      setPathValid(null);
      setErrorMsg(null);
      setSearchQuery("");
      setTab(initialApp ? "manual" : "installed");

      // If already cached, use cache immediately (0ms). Otherwise fetch.
      if (!initialApp) {
        if (installedAppsCache && installedAppsCache.length > 0) {
          setInstalledApps(installedAppsCache);
        } else {
          loadInstalled(false);
        }
      }

      setTimeout(() => {
        if (!initialApp) {
          searchInputRef.current?.focus();
        } else {
          nameRef.current?.focus();
        }
      }, 60);
    }
  }, [open, initialApp, installedAppsCache, loadInstalled]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  // Auto-validate path and auto-extract real app icon
  useEffect(() => {
    if (!open || !path.trim()) {
      setPathValid(null);
      return;
    }
    const t = setTimeout(async () => {
      const valid = await validateApp(path.trim());
      setPathValid(valid);
      if (valid) {
        setExtracting(true);
        const extracted = await extractIcon(path.trim());
        setExtracting(false);
        if (extracted) {
          setIcon(extracted);
        } else {
          setIcon("icon:app");
        }
      }
    }, 250);
    return () => clearTimeout(t);
  }, [path, open]);

  // Filter installed apps by search query
  const filteredInstalledApps = useMemo(() => {
    if (!searchQuery.trim()) return installedApps;
    const q = searchQuery.toLowerCase().trim();
    return installedApps.filter(
      (app) =>
        app.name.toLowerCase().includes(q) ||
        app.path.toLowerCase().includes(q)
    );
  }, [installedApps, searchQuery]);

  // Other folder apps for copy (B3)
  const otherFolderApps = useMemo(() => {
    const list: { folderName: string; app: AppEntry }[] = [];
    if (!folders || typeof folders !== "object") return list;
    for (const [fId, f] of Object.entries(folders)) {
      if (!f || (currentFolderId && fId === currentFolderId)) continue;
      if (Array.isArray(f.apps)) {
        for (const app of f.apps) {
          if (app) {
            list.push({ folderName: f.name || "Group", app });
          }
        }
      }
    }
    return list;
  }, [folders, currentFolderId]);

  const handleSelectInstalledApp = async (app: InstalledAppEntry) => {
    setErrorMsg(null);
    setPath(app.path);
    setName(app.name);
    const resolvedIcon = app.icon || "icon:app";
    setIcon(resolvedIcon);

    // Save directly to folder
    setBusy(true);
    try {
      await onSubmit({
        name: app.name,
        path: app.path,
        icon: resolvedIcon,
      });
    } catch (err: any) {
      setErrorMsg(typeof err === "string" ? err : err?.message || "Failed to add app");
      setTab("manual");
    } finally {
      setBusy(false);
    }
  };

  const handleCopyAppFromGroup = async (sourceApp: AppEntry) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await onSubmit({
        name: sourceApp.name,
        path: sourceApp.path,
        arguments: sourceApp.arguments,
        workingDir: sourceApp.workingDir,
        icon: sourceApp.icon,
      });
    } catch (err: any) {
      setErrorMsg(typeof err === "string" ? err : err?.message || "Failed to copy app");
      setTab("manual");
    } finally {
      setBusy(false);
    }
  };

  // B4: Paste from Clipboard
  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        setErrorMsg("Clipboard is empty or contains no path");
        return;
      }
      let cleaned = text.trim();
      // Strip leading and trailing quotes if copied as "C:\path"
      if (
        (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
        (cleaned.startsWith("'") && cleaned.endsWith("'"))
      ) {
        cleaned = cleaned.slice(1, -1).trim();
      }

      const pathLower = cleaned.toLowerCase();
      const isDeskFolder =
        pathLower.includes("deskfolder.exe") ||
        Object.values(folders).some(
          (f) =>
            f.shortcutPath?.toLowerCase() === pathLower ||
            pathLower.endsWith(`\\${f.name.toLowerCase()}.lnk`) ||
            pathLower.endsWith(`/${f.name.toLowerCase()}.lnk`)
        );

      if (isDeskFolder) {
        setErrorMsg("DeskFolder groups cannot be added inside another group");
        return;
      }

      setErrorMsg(null);
      setPath(cleaned);
      if (!name.trim()) {
        const base = cleaned.split(/[\/\\]/).pop() ?? cleaned;
        setName(base.replace(/\.(exe|lnk|bat|cmd|url)$/i, ""));
      }
    } catch (err) {
      setErrorMsg("Failed to read from clipboard. Please allow clipboard permissions.");
    }
  };

  // B1: HTML5 Drag & Drop file handler on dialog
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      // In Tauri / WebView2, file objects or paths are accessible
      const droppedPath = (file as any).path || file.name;
      if (droppedPath) {
        const pathLower = droppedPath.toLowerCase();
        const isDeskFolder =
          pathLower.includes("deskfolder.exe") ||
          Object.values(folders).some(
            (f) =>
              f.shortcutPath?.toLowerCase() === pathLower ||
              pathLower.endsWith(`\\${f.name.toLowerCase()}.lnk`) ||
              pathLower.endsWith(`/${f.name.toLowerCase()}.lnk`)
          );

        if (isDeskFolder) {
          setErrorMsg("DeskFolder groups cannot be added inside another group");
          return;
        }

        setErrorMsg(null);
        setPath(droppedPath);
        if (!name.trim()) {
          const base = droppedPath.split(/[\/\\]/).pop() ?? droppedPath;
          setName(base.replace(/\.(exe|lnk|bat|cmd|url)$/i, ""));
        }
        setTab("manual");
      }
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !path.trim() || busy) return;
    setErrorMsg(null);

    const pathLower = path.trim().toLowerCase();
    const isDeskFolder =
      pathLower.includes("deskfolder.exe") ||
      Object.values(folders).some(
        (f) =>
          f.shortcutPath?.toLowerCase() === pathLower ||
          pathLower.endsWith(`\\${f.name.toLowerCase()}.lnk`) ||
          pathLower.endsWith(`/${f.name.toLowerCase()}.lnk`)
      );

    if (isDeskFolder) {
      setErrorMsg("DeskFolder groups cannot be added inside another group");
      return;
    }

    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        path: path.trim(),
        arguments: arguments_.trim() || undefined,
        workingDir: workingDir.trim() || undefined,
        icon,
      });
    } catch (err: any) {
      setErrorMsg(typeof err === "string" ? err : err?.message || "Failed to add app");
    } finally {
      setBusy(false);
    }
  };

  const pickFile = async () => {
    try {
      if (isTauri()) {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const picked = await open({
          multiple: false,
          filters: [
            {
              name: "Applications & Shortcuts",
              extensions: ["exe", "lnk", "bat", "cmd", "url"],
            },
          ],
        });
        if (typeof picked === "string") {
          const pickedLower = picked.toLowerCase();
          const isDeskFolder =
            pickedLower.includes("deskfolder.exe") ||
            Object.values(folders).some(
              (f) =>
                f.shortcutPath?.toLowerCase() === pickedLower ||
                pickedLower.endsWith(`\\${f.name.toLowerCase()}.lnk`) ||
                pickedLower.endsWith(`/${f.name.toLowerCase()}.lnk`)
            );

          if (isDeskFolder) {
            setErrorMsg("DeskFolder groups cannot be added inside another group");
            return;
          }

          setErrorMsg(null);
          setPath(picked);
          if (!name.trim()) {
            const base = picked.split(/[\/\\]/).pop() ?? picked;
            setName(base.replace(/\.(exe|lnk|bat|cmd|url)$/i, ""));
          }
        }
      }
    } catch (err) {
      console.warn("Failed to open file picker:", err);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm select-none"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ duration: 0.15 }}
            className={`relative w-full max-w-lg rounded-2xl bg-[#24252a] border p-6 shadow-2xl text-neutral-200 flex flex-col max-h-[85vh] transition-colors ${
              isDragOver ? "border-sky-400/80 bg-[#282a32]" : "border-white/[0.08]"
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4 shrink-0">
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                {title}
              </h2>
              <button
                className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors"
                onClick={onCancel}
              >
                <X size={16} />
              </button>
            </div>

            {/* Error Message Banner */}
            {errorMsg && (
              <div className="mb-3.5 p-2.5 rounded-xl bg-red-950/80 border border-red-800/60 flex items-center gap-2 text-xs text-red-200 shrink-0">
                <AlertCircle size={14} className="text-red-400 shrink-0" />
                <span className="flex-1">{errorMsg}</span>
              </div>
            )}

            {/* 3 Tabs Header (Only when adding a new app) */}
            {!initialApp && (
              <div className="flex items-center gap-1 p-1 mb-4 rounded-xl bg-[#1d1e22] border border-white/[0.05] shrink-0">
                <button
                  type="button"
                  onClick={() => setTab("installed")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                    tab === "installed"
                      ? "bg-[#2f3037] text-white shadow-sm"
                      : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.03]"
                  }`}
                >
                  <Search size={13} />
                  <span>Installed Apps</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTab("manual")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                    tab === "manual"
                      ? "bg-[#2f3037] text-white shadow-sm"
                      : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.03]"
                  }`}
                >
                  <FileSearch size={13} />
                  <span>Custom / Browse</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTab("groups")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                    tab === "groups"
                      ? "bg-[#2f3037] text-white shadow-sm"
                      : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.03]"
                  }`}
                >
                  <Layers size={13} />
                  <span>From Groups</span>
                </button>
              </div>
            )}

            {/* TAB 1: INSTALLED APPS (B2) */}
            {tab === "installed" && !initialApp && (
              <div className="flex flex-col flex-1 min-h-0">
                {/* Search Bar + Rescan Button */}
                <div className="flex items-center gap-2 mb-3 shrink-0">
                  <div className="relative flex items-center flex-1">
                    <Search
                      size={15}
                      className="absolute left-3 text-neutral-400 pointer-events-none"
                    />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search installed applications (Chrome, Blender, Steam...)"
                      className="w-full bg-[#1e1f23] border border-white/[0.08] focus:border-white/40 focus:outline-none text-white text-xs pl-9 pr-8 py-2.5 rounded-xl transition-colors font-medium placeholder:text-neutral-500"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2.5 p-1 text-neutral-400 hover:text-white"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => loadInstalled(true)}
                    disabled={loadingInstalled}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#1e1f23] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-300 hover:text-white text-xs font-semibold transition-all shrink-0 disabled:opacity-50"
                    title="Rescan installed applications from Windows"
                  >
                    <RotateCw
                      size={13}
                      className={loadingInstalled ? "animate-spin text-sky-400" : ""}
                    />
                    <span>{loadingInstalled ? "Scanning…" : "Rescan"}</span>
                  </button>
                </div>

                {/* Installed Apps List */}
                <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar min-h-[220px] max-h-[340px]">
                  {loadingInstalled ? (
                    <div className="flex flex-col items-center justify-center h-48 text-neutral-400 text-xs gap-2">
                      <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>Scanning Windows Start Menu & extracting icons…</span>
                    </div>
                  ) : filteredInstalledApps.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-neutral-400 text-xs gap-1.5 text-center p-4">
                      <FolderOpen size={28} className="text-neutral-500 mb-1" />
                      <span className="font-semibold text-neutral-300">
                        {searchQuery ? "No matching applications found" : "No applications found"}
                      </span>
                      <span className="text-[11px] text-neutral-500">
                        You can click "Rescan" or switch to "Custom / Browse" to pick any .exe directly
                      </span>
                    </div>
                  ) : (
                    filteredInstalledApps.map((app) => (
                      <button
                        key={app.path}
                        onClick={() => handleSelectInstalledApp(app)}
                        disabled={busy}
                        className="w-full flex items-center justify-between p-2.5 rounded-xl bg-[#2b2c32] hover:bg-[#34353d] border border-white/[0.04] hover:border-white/10 transition-all text-left group"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                          <div className="w-8 h-8 rounded-lg bg-[#202125] flex items-center justify-center overflow-hidden shrink-0 border border-white/5 shadow-sm p-1">
                            {app.icon && (app.icon.startsWith("data:image/") || app.icon.startsWith("http")) ? (
                              <img
                                src={app.icon}
                                alt=""
                                className="w-full h-full object-contain"
                                draggable={false}
                              />
                            ) : (
                              <AppIcon value={app.icon || "icon:app"} size={20} shape="rounded-md" />
                            )}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-semibold text-white truncate group-hover:text-white">
                              {app.name}
                            </span>
                            <span className="text-[10px] text-neutral-400 truncate font-mono">
                              {app.path}
                            </span>
                          </div>
                        </div>
                        <div className="px-2.5 py-1 rounded-lg bg-white/[0.06] group-hover:bg-white text-neutral-300 group-hover:text-black text-[11px] font-semibold flex items-center gap-1 shrink-0 transition-colors">
                          <Plus size={12} strokeWidth={2.5} />
                          <span>Add</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: CUSTOM / BROWSE & PASTE (B4) */}
            {(tab === "manual" || initialApp) && (
              <div className="flex flex-col flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar">
                {/* Live Preview Card */}
                <div className="flex items-center gap-3.5 mb-4 p-3.5 rounded-xl bg-[#2b2c32] border border-white/[0.05] shrink-0">
                  <div className="w-12 h-12 rounded-xl bg-[#202125] flex items-center justify-center overflow-hidden shrink-0 border border-white/5 shadow-inner relative">
                    {extracting ? (
                      <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : icon && (icon.startsWith("https://") || icon.startsWith("http://") || icon.startsWith("data:image/")) ? (
                      <img
                        src={icon}
                        alt=""
                        className="w-full h-full object-contain p-1"
                        draggable={false}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <AppIcon value={icon} size={32} missing={pathValid === false} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      {name || "Application Name"}
                    </div>
                    <div className="text-xs text-neutral-400 truncate font-mono mt-0.5">
                      {path || "C:/Program Files/..."}
                    </div>
                    {pathValid === false && (
                      <div className="flex items-center gap-1 mt-1 text-[11px] text-amber-400">
                        <AlertCircle size={12} />
                        <span>Target path not found</span>
                      </div>
                    )}
                    {pathValid === true && !extracting && (
                      <div className="flex items-center gap-1 mt-1 text-[11px] text-emerald-400">
                        <CheckCircle2 size={12} />
                        <span>Verified — icon extracted</span>
                      </div>
                    )}
                    {extracting && (
                      <div className="text-[11px] text-neutral-400 mt-1">
                        Extracting icon…
                      </div>
                    )}
                  </div>
                </div>

                {/* Target Path Field + Browse + Paste Button (B4) */}
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">
                    TARGET PATH (.EXE, .LNK, .BAT, .CMD)
                  </label>
                  <button
                    type="button"
                    onClick={handlePasteClipboard}
                    className="flex items-center gap-1 text-[11px] font-medium text-neutral-300 hover:text-white bg-white/[0.06] hover:bg-white/10 px-2 py-0.5 rounded-md transition-colors"
                    title="Paste file path from clipboard (B4)"
                  >
                    <Clipboard size={12} />
                    <span>Paste Path</span>
                  </button>
                </div>

                <div className="relative flex items-center mb-4">
                  <input
                    type="text"
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    placeholder="C:/Program Files/App/app.exe or drop file here"
                    className="w-full bg-[#1e1f23] border border-white/[0.08] focus:border-white/40 focus:outline-none text-white text-xs px-3 py-2.5 rounded-lg pr-9 transition-colors font-mono"
                  />
                  <button
                    type="button"
                    onClick={pickFile}
                    className="absolute right-2 p-1 text-neutral-400 hover:text-white transition-colors"
                    title="Browse file"
                  >
                    <FileSearch size={16} />
                  </button>
                </div>

                {/* Display Name Field */}
                <label className="block text-[11px] font-semibold text-neutral-400 mb-1.5 uppercase tracking-wide">
                  DISPLAY NAME
                </label>
                <input
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Visual Studio Code"
                  className="w-full bg-[#1e1f23] border border-white/[0.12] focus:border-white/40 focus:outline-none text-white text-xs px-3 py-2.5 rounded-lg mb-3 transition-colors font-medium"
                  maxLength={40}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                />

                {/* Advanced Settings Toggle */}
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white mb-3 font-medium transition-colors"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                >
                  {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  <span>
                    {showAdvanced
                      ? "Hide advanced launch options"
                      : "Show advanced launch options (arguments, working dir)"}
                  </span>
                </button>

                {showAdvanced && (
                  <div className="p-3.5 mb-3 rounded-xl bg-[#1e1f23] border border-white/5 space-y-3">
                    <div>
                      <label className="block text-[11px] font-medium text-neutral-400 mb-1 uppercase tracking-wide">
                        Command-Line Arguments (optional)
                      </label>
                      <input
                        type="text"
                        value={arguments_}
                        onChange={(e) => setArguments(e.target.value)}
                        placeholder="e.g. --profile Default"
                        className="w-full bg-[#28292e] border border-white/10 text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-white/40"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-neutral-400 mb-1 uppercase tracking-wide">
                        Working Directory (optional)
                      </label>
                      <input
                        type="text"
                        value={workingDir}
                        onChange={(e) => setWorkingDir(e.target.value)}
                        placeholder="e.g. C:/Projects/workspace"
                        className="w-full bg-[#28292e] border border-white/10 text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-white/40"
                      />
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-2 flex justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={onCancel}
                    className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white rounded-lg transition-colors"
                    disabled={busy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!name.trim() || !path.trim() || busy}
                    className="px-6 py-2 rounded-lg bg-white text-black font-semibold text-xs tracking-wide shadow-sm hover:bg-neutral-200 active:scale-[0.98] disabled:opacity-40 disabled:hover:bg-white transition-all"
                  >
                    {busy ? "Saving…" : submitLabel}
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: FROM OTHER GROUPS (B3) */}
            {tab === "groups" && !initialApp && (
              <div className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar min-h-[220px] max-h-[340px]">
                  {otherFolderApps.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-neutral-400 text-xs gap-1.5 text-center p-4">
                      <Layers size={28} className="text-neutral-500 mb-1" />
                      <span className="font-semibold text-neutral-300">
                        No applications found in other groups
                      </span>
                      <span className="text-[11px] text-neutral-500">
                        Create other groups first or use "Installed Apps" to add programs.
                      </span>
                    </div>
                  ) : (
                    otherFolderApps.map(({ folderName, app }) => (
                      <button
                        key={`${folderName}-${app.id}`}
                        onClick={() => handleCopyAppFromGroup(app)}
                        disabled={busy}
                        className="w-full flex items-center justify-between p-2.5 rounded-xl bg-[#2b2c32] hover:bg-[#34353d] border border-white/[0.04] hover:border-white/10 transition-all text-left group"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                          <div className="w-8 h-8 rounded-lg bg-[#202125] flex items-center justify-center overflow-hidden shrink-0 border border-white/5 shadow-sm">
                            <AppIcon value={app.icon} size={22} shape="rounded-md" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-semibold text-white truncate">
                              {app.name}
                            </span>
                            <span className="text-[10px] text-neutral-400 truncate">
                              From group <strong className="text-neutral-300">{folderName}</strong>
                            </span>
                          </div>
                        </div>
                        <div className="px-2.5 py-1 rounded-lg bg-white/[0.06] group-hover:bg-white text-neutral-300 group-hover:text-black text-[11px] font-semibold flex items-center gap-1 shrink-0 transition-colors">
                          <Plus size={12} strokeWidth={2.5} />
                          <span>Copy</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default AddAppDialog;
