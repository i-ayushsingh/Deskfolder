// ============================================================
// DeskFolder — FolderCard Component
// ============================================================

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Folder as FolderIcon,
  Play,
  Wrench,
  Pencil,
  Trash2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import clsx from "clsx";
import type { Folder } from "../lib/types";
import { appCountLabel } from "../lib/tauri";
import AppIcon from "./AppIcon";

interface FolderCardProps {
  folder: Folder;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRepairShortcut: () => Promise<void>;
}

export const FolderCard: React.FC<FolderCardProps> = ({
  folder,
  onOpen,
  onEdit,
  onDelete,
  onRepairShortcut,
}) => {
  const preview = folder.apps.slice(0, 4);
  const missingCount = folder.apps.filter((a) => a.missing).length;
  const shortcutMissing = folder.shortcutStatus === "missing";
  const [repairing, setRepairing] = useState(false);

  const handleRepair = async () => {
    setRepairing(true);
    try {
      await onRepairShortcut();
    } finally {
      setRepairing(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 280, damping: 22 }}
      className={clsx(
        "card-fluent reveal group relative flex flex-col gap-4 select-none",
        "hover:bg-fluent-bg-elevated"
      )}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty(
          "--reveal-x",
          `${e.clientX - rect.left}px`
        );
        e.currentTarget.style.setProperty(
          "--reveal-y",
          `${e.clientY - rect.top}px`
        );
      }}
    >
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-fluent-accent/15 flex items-center justify-center border border-fluent-accent/20 shrink-0">
            <FolderIcon size={18} className="text-fluent-accent" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-fluent-text-primary truncate">
              {folder.name}
            </h3>
            <div className="flex items-center gap-2 text-[11px] text-fluent-text-tertiary">
              <span>{appCountLabel(folder)}</span>
              {missingCount > 0 && (
                <span className="flex items-center gap-0.5 text-amber-400 font-medium">
                  <AlertTriangle size={11} />
                  {missingCount} missing
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-fluent-text-tertiary hover:text-fluent-text-primary hover:bg-white/5 transition-colors no-drag"
            title="Edit folder & apps"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-fluent-text-tertiary hover:text-fluent-danger hover:bg-fluent-danger/10 transition-colors no-drag"
            title="Delete folder & shortcut"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* App Previews */}
      <div className="flex items-center gap-2 py-1 min-h-[44px]">
        {preview.length === 0 ? (
          <div className="text-xs text-fluent-text-tertiary italic">
            Empty folder — click Edit to add apps
          </div>
        ) : (
          preview.map((a) => (
            <AppIcon
              key={a.id}
              value={a.icon}
              size={36}
              shape="rounded-xl"
              missing={a.missing}
            />
          ))
        )}
        {folder.apps.length > 4 && (
          <span className="text-xs text-fluent-text-tertiary ml-1 font-medium">
            +{folder.apps.length - 4}
          </span>
        )}
      </div>

      {/* Shortcut Health & Action Row */}
      <div className="mt-auto pt-3 flex items-center gap-2 no-drag">
        {shortcutMissing ? (
          <button
            onClick={handleRepair}
            disabled={repairing}
            className="btn-ghost flex-1 py-1.5 text-xs text-amber-300 border border-amber-500/30 hover:bg-amber-500/10"
            title="Desktop shortcut was deleted or moved. Click to recreate."
          >
            <Wrench size={12} />
            {repairing ? "Repairing…" : "Repair Shortcut"}
          </button>
        ) : (
          <button
            onClick={handleRepair}
            disabled={repairing}
            className="btn-ghost flex-1 py-1.5 text-xs text-fluent-text-secondary"
            title="Rebuild shortcut on Desktop"
          >
            <CheckCircle2 size={12} className="text-emerald-400" />
            {repairing ? "Rebuilding…" : "Shortcut OK"}
          </button>
        )}

        <button
          onClick={onOpen}
          className="btn-accent py-1.5 px-4 text-xs font-semibold"
          title="Open floating folder popup"
        >
          <Play size={12} />
          Open
        </button>
      </div>
    </motion.div>
  );
};

export default FolderCard;
