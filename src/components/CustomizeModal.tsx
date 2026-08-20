// ============================================================
// DeskFolder — Customize Group Modal
// ============================================================

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronDown } from "lucide-react";
import type { Folder } from "../lib/types";

interface CustomizeModalProps {
  open: boolean;
  folder: Folder;
  onClose: () => void;
  onSave: (customization: {
    columns: number;
    layout: string;
    showHeader: boolean;
    showLabels: boolean;
    gridPreview: "2x2" | "3x3";
    sortBy?: "custom" | "mru" | "alphabetical";
  }) => void;
}

export const CustomizeModal: React.FC<CustomizeModalProps> = ({
  open,
  folder,
  onClose,
  onSave,
}) => {
  const [columns, setColumns] = useState<number>(folder.columns ?? 4);
  const [layout, setLayout] = useState<string>(folder.layout ?? "Default");
  const [showHeader, setShowHeader] = useState<boolean>(folder.showHeader ?? true);
  const [showLabels, setShowLabels] = useState<boolean>(folder.showLabels ?? true);
  const [gridPreview, setGridPreview] = useState<"2x2" | "3x3">(folder.gridPreview ?? "2x2");
  const [sortBy, setSortBy] = useState<"custom" | "mru" | "alphabetical">(
    folder.sortBy ?? "custom"
  );

  const handleSave = () => {
    onSave({
      columns,
      layout,
      showHeader,
      showLabels,
      gridPreview,
      sortBy,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm select-none">
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-md rounded-2xl bg-[#24252a] border border-white/[0.08] p-6 shadow-2xl text-neutral-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-white">Customize</h3>
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Customization Options */}
            <div className="flex flex-col gap-2">
              {/* Option 1: Desktop Icon Preview */}
              <div className="p-3.5 rounded-xl bg-[#2b2c32] flex items-center justify-between border border-white/[0.04]">
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="text-xs font-semibold text-white">Desktop Icon Preview</span>
                  <span className="text-[11px] text-neutral-400">
                    Preview grid style on the desktop shortcut
                  </span>
                </div>
                <div className="relative shrink-0">
                  <select
                    value={gridPreview}
                    onChange={(e) => setGridPreview(e.target.value as "2x2" | "3x3")}
                    className="appearance-none bg-[#373840] text-white text-xs font-medium py-1.5 pl-3 pr-7 rounded-lg border border-white/10 focus:outline-none focus:border-white/40 cursor-default"
                  >
                    <option value="2x2">2x2 Grid (4 Apps)</option>
                    <option value="3x3">3x3 Grid (9 Apps)</option>
                  </select>
                  <ChevronDown
                    size={13}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
                  />
                </div>
              </div>

              {/* Option 2: Columns */}
              <div className="p-3.5 rounded-xl bg-[#2b2c32] flex items-center justify-between border border-white/[0.04]">
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="text-xs font-semibold text-white">Columns</span>
                  <span className="text-[11px] text-neutral-400">
                    Number of columns in the folder popover
                  </span>
                </div>
                <div className="relative shrink-0">
                  <select
                    value={columns}
                    onChange={(e) => setColumns(Number(e.target.value))}
                    className="appearance-none bg-[#373840] text-white text-xs font-medium py-1.5 pl-3 pr-7 rounded-lg border border-white/10 focus:outline-none focus:border-white/40 cursor-default"
                  >
                    <option value={3}>3 Columns</option>
                    <option value={4}>4 Columns</option>
                    <option value={5}>5 Columns</option>
                    <option value={6}>6 Columns</option>
                  </select>
                  <ChevronDown
                    size={13}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
                  />
                </div>
              </div>

              {/* Option 3: Layout */}
              <div className="p-3.5 rounded-xl bg-[#2b2c32] flex items-center justify-between border border-white/[0.04]">
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="text-xs font-semibold text-white">Layout</span>
                  <span className="text-[11px] text-neutral-400">
                    Content area background style
                  </span>
                </div>
                <div className="relative shrink-0">
                  <select
                    value={layout}
                    onChange={(e) => setLayout(e.target.value)}
                    className="appearance-none bg-[#373840] text-white text-xs font-medium py-1.5 pl-3 pr-7 rounded-lg border border-white/10 focus:outline-none focus:border-white/40 cursor-default"
                  >
                    <option value="Default">Default</option>
                    <option value="Acrylic">Acrylic</option>
                    <option value="Solid">Solid</option>
                    <option value="Minimal">Minimal</option>
                  </select>
                  <ChevronDown
                    size={13}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
                  />
                </div>
              </div>

              {/* Option 4: Header */}
              <div className="p-3.5 rounded-xl bg-[#2b2c32] flex items-center justify-between border border-white/[0.04]">
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="text-xs font-semibold text-white">Header</span>
                  <span className="text-[11px] text-neutral-400">
                    Show group name header
                  </span>
                </div>
                <ToggleSwitch checked={showHeader} onChange={setShowHeader} />
              </div>

              {/* Option 5: Labels */}
              <div className="p-3.5 rounded-xl bg-[#2b2c32] flex items-center justify-between border border-white/[0.04]">
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="text-xs font-semibold text-white">Labels</span>
                  <span className="text-[11px] text-neutral-400">
                    Show or Hide program labels
                  </span>
                </div>
                <ToggleSwitch checked={showLabels} onChange={setShowLabels} />
              </div>

              {/* Option 6: App Sorting (U8) */}
              <div className="p-3.5 rounded-xl bg-[#2b2c32] flex items-center justify-between border border-white/[0.04]">
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="text-xs font-semibold text-white">App Sorting</span>
                  <span className="text-[11px] text-neutral-400">
                    How apps are ordered in the popover
                  </span>
                </div>
                <div className="relative shrink-0">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as "custom" | "mru" | "alphabetical")}
                    className="appearance-none bg-[#373840] text-white text-xs font-medium py-1.5 pl-3 pr-7 rounded-lg border border-white/10 focus:outline-none focus:border-white/40 cursor-default"
                  >
                    <option value="custom">Manual (Custom Order)</option>
                    <option value="mru">Recently Launched (MRU)</option>
                    <option value="alphabetical">Alphabetical (A to Z)</option>
                  </select>
                  <ChevronDown
                    size={13}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
                  />
                </div>
              </div>
            </div>

            {/* Footer Action */}
            <div className="mt-6 flex justify-end gap-2 items-center">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-2 rounded-lg bg-white text-black font-semibold text-xs tracking-wide shadow-sm hover:bg-neutral-200 active:scale-[0.98] transition-all"
              >
                Save
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ checked, onChange }) => {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-default rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        checked ? "bg-white" : "bg-neutral-700"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full shadow-md transition duration-200 ease-in-out ${
          checked ? "translate-x-4 bg-neutral-900" : "translate-x-0 bg-neutral-400"
        }`}
      />
    </button>
  );
};

export default CustomizeModal;
