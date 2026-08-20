# Contributing to DeskFolder

Thank you for your interest in contributing to **DeskFolder**! 🚀

DeskFolder is an open-source project bringing mobile-style app folders to the Windows desktop, built with **Tauri v2**, **React**, **TypeScript**, and **Rust**.

---

## 🛠️ Development Setup

### Prerequisites

1. **Rust**: (1.77.2+) via [rustup.rs](https://rustup.rs/)
2. **Node.js**: (20+ LTS) via [nodejs.org](https://nodejs.org/)
3. **C++ Build Tools**: Microsoft Visual Studio C++ Build Tools (with "Desktop development with C++" workload)
4. **WebView2 Runtime**: Included on Windows 10/11 by default

### Getting Started

```powershell
# 1. Clone your fork
git clone https://github.com/<your-username>/Deskfolder.git
cd Deskfolder

# 2. Install dependencies
npm install

# 3. Start development server with hot-reloading
npm run tauri:dev
```

### Running Tests

```powershell
# Run backend Rust unit & integration tests
cd src-tauri
cargo test
cd ..

# Run frontend typecheck and build validation
npm run build
```

---

## 📋 Pull Request Guidelines

1. Fork the repository and create your branch from `master`.
2. Ensure `npm run build` and `cargo test` pass with 0 errors.
3. Follow the Windows 11 Fluent Design principles for UI components.
4. Open a pull request with a descriptive summary of your changes.

---

## 📜 Code of Conduct

Please be respectful, constructive, and helpful to fellow contributors and community members.
