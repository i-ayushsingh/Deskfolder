# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0-beta] - 2026-08-21

### 🚀 Highlights
- **Mobile-Style Floating Desktop Popovers**: Modern acrylic app groups that open natively right beneath desktop shortcuts or cursor coordinates without opening File Explorer.
- **Single-Click & Double-Click Launching**: Low-level Win32 hook (`hook.rs`) provides instant, single-click toggle behavior while intercepting desktop right-clicks to prevent unwanted Explorer shell context menus.
- **4 App Addition Methods**:
  1. *Installed Apps Scanner*: Scans Start Menu folders, caches installed apps with real icons, and provides search-as-you-type with 1-click rescan.
  2. *Drag & Drop from Explorer*: Drag `.exe` or `.lnk` files directly onto dialogs, cards, or popovers.
  3. *Clipboard Path Paste*: Fast paste with auto-fill of app names and extracted icons (`Ctrl+V` / button).
  4. *Group-to-Group Copy*: Duplicate applications across folders with one click.
- **2x2 & 3x3 Live Desktop Icon Previews**: Grid icon previews rendered with high-res extracted icons; traditional single-icon mode deprecated in favor of dynamic 4-app or 9-app live previews.
- **Smart Sorting Modes**: Manual custom drag-and-drop order, Recently Launched (MRU) sorting with timestamp tracking, and Alphabetical (A to Z) ordering.
- **Built-in Search**: Live search input embedded in large popovers ($\ge 5$ apps) for fast keyboard navigation, as well as in the Dashboard and Group Editor.
- **Dashboard Usability**: Drag-to-reorder group cards with persistent synchronization, "Reveal in Explorer" context menu action, and bottom-right Windows 11 style toast notifications.
- **Native Browser URL Launcher**: Rust command using Windows `cmd /c start ""` with `CREATE_NO_WINDOW` to open documentation and external links directly in the user's default browser.
- **Branded NSIS Installer & Uninstaller**: Full NSIS setup package (`DeskFolder_0.1.0_x64-setup.exe`) and MSI installer featuring the DeskFolder logo in Windows Installed Apps & Control Panel.
- **Automated CI/CD**: GitHub Actions release pipeline (`release.yml`) for automated building and attachment of NSIS setup bundles to GitHub Releases.

### 🛡️ Core Reliability & Performance
- **Deterministic ID-Keyed Shortcuts**: Unique `DeskFolder_<uuid>.lnk` filenames eliminate name collisions and broken desktop links.
- **Multi-Monitor DPI Clamping**: Clamps popups safely within the visible work area of the active monitor, respecting taskbars and negative display coordinates.
- **Atomic Persistence & Backup**: Atomic file swaps for `folders.json` with automatic `.bak` recovery.
- **High-Resolution Icon Extraction**: Win32 `SHGetFileInfoW` extraction cached with 32-bit RGBA PNG quality.
- **Global Error Boundary**: React error boundary safeguarding against UI exceptions.
- **Automated Unit Testing**: 15 backend tests verifying argument parsing, layout heuristics, monitor clamping, and atomic storage recovery.

---

## [0.0.1] - 2026-08-14
- Initial project prototype and proof-of-concept architecture.
