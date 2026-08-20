// ============================================================
// DeskFolder — Global Application Settings Modal
// ============================================================

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Settings, ExternalLink, ShieldCheck, Github, User } from "lucide-react";
import { openExternalUrl } from "../lib/tauri";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
}) => {
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
              <div className="flex items-center gap-2">
                <Settings size={18} className="text-white/80" />
                <h3 className="text-base font-bold text-white">Settings</h3>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="flex flex-col gap-3">
              {/* About Section */}
              <div className="p-3.5 rounded-xl bg-[#2b2c32] border border-white/[0.04]">
                <span className="text-xs font-semibold text-white block mb-1">
                  About DeskFolder
                </span>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Mobile-style floating app folders for Windows desktop. Developed by{" "}
                  <button
                    onClick={() =>
                      openExternalUrl("https://github.com/i-ayushsingh")
                    }
                    className="text-white hover:underline font-medium inline-flex items-center gap-0.5"
                  >
                    i-ayushsingh <ExternalLink size={10} />
                  </button>
                  .
                </p>
              </div>

              {/* Version Status */}
              <div className="p-3.5 rounded-xl bg-[#2b2c32] flex items-center justify-between border border-white/[0.04]">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-white">
                    Version
                  </span>
                  <span className="text-[11px] text-neutral-400">
                    DeskFolder v0.1.0 (Release)
                  </span>
                </div>
                <div className="flex items-center gap-1 text-emerald-400 text-xs font-medium">
                  <ShieldCheck size={14} />
                  <span>Up to date</span>
                </div>
              </div>

              {/* GitHub Repository */}
              <div className="p-3.5 rounded-xl bg-[#2b2c32] flex items-center justify-between border border-white/[0.04]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center text-neutral-300 shrink-0">
                    <Github size={16} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-white truncate">
                      GitHub Repository
                    </span>
                    <span className="text-[11px] text-neutral-400 truncate">
                      i-ayushsingh/Deskfolder
                    </span>
                  </div>
                </div>
                <button
                  onClick={() =>
                    openExternalUrl("https://github.com/i-ayushsingh/Deskfolder")
                  }
                  className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-white transition-colors flex items-center gap-1 shrink-0"
                >
                  <span>Open Repo</span>
                  <ExternalLink size={11} />
                </button>
              </div>

              {/* GitHub Profile */}
              <div className="p-3.5 rounded-xl bg-[#2b2c32] flex items-center justify-between border border-white/[0.04]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center text-neutral-300 shrink-0">
                    <User size={16} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-white truncate">
                      Developer Profile
                    </span>
                    <span className="text-[11px] text-neutral-400 truncate">
                      github.com/i-ayushsingh
                    </span>
                  </div>
                </div>
                <button
                  onClick={() =>
                    openExternalUrl("https://github.com/i-ayushsingh")
                  }
                  className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-white transition-colors flex items-center gap-1 shrink-0"
                >
                  <span>Visit Profile</span>
                  <ExternalLink size={11} />
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={onClose}
                className="px-5 py-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] text-white font-medium text-xs transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SettingsModal;
