// ============================================================
// DeskFolder — Desktop Icon Grid Preview Selector Modal
// ============================================================

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, LayoutGrid, Grid3X3, Check } from "lucide-react";

interface GridIconModalProps {
  open: boolean;
  currentPreview?: "2x2" | "3x3";
  onClose: () => void;
  onSelectPreview: (preview: "2x2" | "3x3") => void;
}

export const GridIconModal: React.FC<GridIconModalProps> = ({
  open,
  currentPreview = "2x2",
  onClose,
  onSelectPreview,
}) => {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-sm rounded-2xl bg-[#24252a] border border-white/[0.08] p-5 shadow-2xl text-neutral-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">Desktop Icon Preview</h3>
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Selection Cards */}
            <div className="flex flex-col gap-2.5">
              {/* Option 1: 2x2 Grid (Default) */}
              <button
                onClick={() => {
                  onSelectPreview("2x2");
                  onClose();
                }}
                className={`w-full flex items-center gap-3.5 p-3.5 rounded-xl border transition-all text-left group ${
                  currentPreview === "2x2"
                    ? "bg-[#2f3037] border-white/20"
                    : "bg-[#2b2c32] hover:bg-[#32333a] border-white/[0.05] hover:border-white/10"
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-white/[0.06] flex items-center justify-center text-neutral-300 group-hover:text-white shrink-0">
                  <LayoutGrid size={22} strokeWidth={1.75} />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                    2x2 Grid (Default)
                  </span>
                  <span className="text-xs text-neutral-400">
                    4-app preview on desktop icon
                  </span>
                </div>
                {currentPreview === "2x2" && (
                  <Check size={16} className="text-white shrink-0" />
                )}
              </button>

              {/* Option 2: 3x3 Grid */}
              <button
                onClick={() => {
                  onSelectPreview("3x3");
                  onClose();
                }}
                className={`w-full flex items-center gap-3.5 p-3.5 rounded-xl border transition-all text-left group ${
                  currentPreview === "3x3"
                    ? "bg-[#2f3037] border-white/20"
                    : "bg-[#2b2c32] hover:bg-[#32333a] border-white/[0.05] hover:border-white/10"
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-white/[0.06] flex items-center justify-center text-neutral-300 group-hover:text-white shrink-0">
                  <Grid3X3 size={22} strokeWidth={1.75} />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                    3x3 Grid
                  </span>
                  <span className="text-xs text-neutral-400">
                    9-app preview on desktop icon
                  </span>
                </div>
                {currentPreview === "3x3" && (
                  <Check size={16} className="text-white shrink-0" />
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default GridIconModal;
