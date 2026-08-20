// ============================================================
// DeskFolder — App Root
// ============================================================

import React, { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import Dashboard from "./components/Dashboard";
import Overlay from "./components/Overlay";
import { useFolderStore } from "./lib/store";
import { isTauri, overlayReady, onOpenOverlayFolder, onOpenDesktopContextMenu } from "./lib/tauri";
import type { AppMode } from "./lib/types";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[DeskFolder ErrorBoundary caught error]:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center p-6 bg-[#18191c] text-white select-none">
          <div className="w-full max-w-md p-6 rounded-2xl bg-[#232428] border border-red-500/30 shadow-2xl text-center flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
              ⚠️
            </div>
            <h2 className="text-base font-bold text-white">Something went wrong</h2>
            <p className="text-xs text-neutral-400 font-mono bg-black/40 p-3 rounded-lg w-full text-left break-all max-h-32 overflow-y-auto">
              {this.state.error?.message || "An unexpected rendering error occurred"}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 px-5 py-2 rounded-lg bg-white text-black text-xs font-semibold hover:bg-neutral-200 transition-all active:scale-[0.98]"
            >
              Reload DeskFolder
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function readQuery(): AppMode {
  const params = new URLSearchParams(window.location.search);
  return (params.get("mode") as AppMode) ?? "dashboard";
}

export default function App() {
  const [mode] = useState(readQuery);
  const hydrate = useFolderStore((s) => s.hydrate);
  const setActiveOverlayFolder = useFolderStore((s) => s.setActiveOverlayFolder);
  const setDesktopContextMenuFolder = useFolderStore((s) => s.setDesktopContextMenuFolder);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    document.body.classList.remove("mode-dashboard", "mode-overlay");
    document.body.classList.add(`mode-${mode}`);
  }, [mode]);

  useEffect(() => {
    if (mode === "overlay") {
      let isMounted = true;
      let unlistenFolder: (() => void) | null = null;
      let unlistenMenu: (() => void) | null = null;

      // Subscribe to open folder events from Rust first
      Promise.all([
        onOpenOverlayFolder((payload) => {
          if (isMounted) {
            setActiveOverlayFolder(payload.folder);
          }
        }),
        onOpenDesktopContextMenu((payload) => {
          if (isMounted) {
            setDesktopContextMenuFolder(payload.folder);
          }
        }),
      ])
        .then(([unsubFolder, unsubMenu]) => {
          if (!isMounted) {
            unsubFolder();
            unsubMenu();
            return;
          }
          unlistenFolder = unsubFolder;
          unlistenMenu = unsubMenu;
          // Signal to Rust only AFTER listener is active
          overlayReady().catch(() => {});
        })
        .catch((err) => {
          console.warn("Failed to attach overlay listener:", err);
        });

      return () => {
        isMounted = false;
        if (unlistenFolder) unlistenFolder();
        if (unlistenMenu) unlistenMenu();
      };
    }
  }, [mode, setActiveOverlayFolder, setDesktopContextMenuFolder]);

  return (
    <ErrorBoundary>
      {mode === "overlay" ? (
        <Overlay devBackdrop={!isTauri()} />
      ) : (
        <Dashboard devMode={!isTauri()} />
      )}
    </ErrorBoundary>
  );
}
