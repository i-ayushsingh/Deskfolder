// ============================================================
// DeskFolder — Create / Rename Folder dialog
// ============================================================

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import clsx from "clsx";

interface CreateFolderDialogProps {
  open: boolean;
  initialName?: string;
  title?: string;
  submitLabel?: string;
  onSubmit: (name: string) => void | Promise<void>;
  onCancel: () => void;
}

export const CreateFolderDialog: React.FC<CreateFolderDialogProps> = ({
  open,
  initialName = "",
  title = "New folder",
  submitLabel = "Create",
  onSubmit,
  onCancel,
}) => {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      // Focus + select on open.
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [open, initialName]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  const handleSubmit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit(name.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onCancel}
          />
          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
            className={clsx(
              "relative w-full max-w-md rounded-fluent-lg p-6 fluent-stroke",
              "bg-fluent-bg-elevated shadow-fluent-lg"
            )}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-fluent-text-primary">
                {title}
              </h2>
              <button
                className="p-2 -mr-2 rounded-full text-fluent-text-tertiary hover:text-fluent-text-primary hover:bg-white/5 transition-colors"
                onClick={onCancel}
              >
                <X size={16} />
              </button>
            </div>

            <label className="block text-xs font-medium text-fluent-text-tertiary mb-2 uppercase tracking-wide">
              Folder name
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              placeholder="e.g. Games, Dev, Media"
              className="input-fluent"
              maxLength={40}
            />

            <div className="mt-6 flex justify-end gap-2">
              <button className="btn-ghost" onClick={onCancel} disabled={busy}>
                Cancel
              </button>
              <button
                className="btn-accent"
                onClick={handleSubmit}
                disabled={!name.trim() || busy}
              >
                {busy ? "Working…" : submitLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CreateFolderDialog;
