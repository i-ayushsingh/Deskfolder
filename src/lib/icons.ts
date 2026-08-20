// ============================================================
// DeskFolder — Icon library
// ============================================================
//
// Curated set of icons users can pick from when adding an app.
// Real .exe icon extraction (Phase 5) runs via Rust `extract_icon`,
// but we ship a human-friendly fallback picker so the UI looks good
// even when extraction isn't available or fails.

import type { LucideIcon } from "lucide-react";
import {
  Code,
  Terminal,
  FileText,
  MessageCircle,
  Music,
  Globe,
  Gamepad2,
  MonitorPlay,
  Mail,
  Calendar,
  Camera,
  Image as ImageIcon,
  Video,
  Folder,
  Archive,
  Settings,
  Cpu,
  Database,
  Cloud,
  ShoppingCart,
  CreditCard,
  Map as MapIcon,
  Compass,
  BookOpen,
  Pencil,
  Palette,
  Bug,
  GitBranch,
  Github,
  Figma,
  Chrome,
  Twitch,
  MessageSquare,
  Headphones,
  Hash,
  StickyNote,
  Calculator,
  Clock,
  Globe2,
} from "lucide-react";

export interface IconOption {
  /** icon source string stored on AppEntry.icon */
  value: string;
  /** label shown in the picker */
  label: string;
  /** lucide component to render */
  Component: LucideIcon;
  /** tailwind text-color class for tinting */
  tint: string;
}

// Curated default set. Users can also pick raw emojis.
export const ICON_LIBRARY: IconOption[] = [
  { value: "icon:code",       label: "Code",        Component: Code,        tint: "text-sky-400" },
  { value: "icon:terminal",   label: "Terminal",    Component: Terminal,    tint: "text-slate-200" },
  { value: "icon:filetext",   label: "Documents",   Component: FileText,    tint: "text-blue-400" },
  { value: "icon:chat",       label: "Chat",        Component: MessageCircle, tint: "text-indigo-400" },
  { value: "icon:music",      label: "Music",       Component: Music,       tint: "text-emerald-400" },
  { value: "icon:browser",    label: "Browser",     Component: Globe,       tint: "text-yellow-400" },
  { value: "icon:game",       label: "Games",       Component: Gamepad2,    tint: "text-fuchsia-400" },
  { value: "icon:video",      label: "Video",       Component: MonitorPlay, tint: "text-rose-400" },
  { value: "icon:mail",       label: "Mail",        Component: Mail,        tint: "text-blue-300" },
  { value: "icon:calendar",   label: "Calendar",    Component: Calendar,    tint: "text-red-400" },
  { value: "icon:camera",     label: "Camera",      Component: Camera,      tint: "text-gray-300" },
  { value: "icon:image",      label: "Photos",      Component: ImageIcon,   tint: "text-pink-400" },
  { value: "icon:folder",     label: "Folder",      Component: Folder,      tint: "text-amber-300" },
  { value: "icon:archive",    label: "Archive",     Component: Archive,     tint: "text-amber-400" },
  { value: "icon:settings",   label: "Settings",    Component: Settings,    tint: "text-slate-300" },
  { value: "icon:cpu",        label: "System",      Component: Cpu,         tint: "text-cyan-400" },
  { value: "icon:database",   label: "Database",    Component: Database,    tint: "text-orange-400" },
  { value: "icon:cloud",      label: "Cloud",       Component: Cloud,       tint: "text-sky-300" },
  { value: "icon:cart",       label: "Shopping",    Component: ShoppingCart, tint: "text-green-400" },
  { value: "icon:card",       label: "Finance",     Component: CreditCard,  tint: "text-emerald-300" },
  { value: "icon:map",        label: "Maps",        Component: MapIcon,     tint: "text-lime-400" },
  { value: "icon:compass",    label: "Compass",     Component: Compass,     tint: "text-teal-400" },
  { value: "icon:book",       label: "Reader",      Component: BookOpen,    tint: "text-yellow-300" },
  { value: "icon:pencil",     label: "Notes",       Component: Pencil,      tint: "text-amber-200" },
  { value: "icon:palette",    label: "Design",      Component: Palette,     tint: "text-pink-300" },
  { value: "icon:bug",        label: "Debug",       Component: Bug,         tint: "text-red-300" },
  { value: "icon:git",        label: "Git",         Component: GitBranch,   tint: "text-orange-300" },
  { value: "icon:github",     label: "GitHub",      Component: Github,      tint: "text-slate-200" },
  { value: "icon:figma",      label: "Figma",       Component: Figma,       tint: "text-pink-400" },
  { value: "icon:chrome",     label: "Chrome",      Component: Chrome,      tint: "text-yellow-400" },
  { value: "icon:firefox",    label: "Firefox",     Component: Globe2,      tint: "text-orange-400" },
  { value: "icon:steam",      label: "Steam",       Component: Twitch,      tint: "text-slate-300" },
  { value: "icon:discord",    label: "Discord",     Component: MessageSquare, tint: "text-indigo-400" },
  { value: "icon:spotify",    label: "Spotify",     Component: Headphones,  tint: "text-green-400" },
  { value: "icon:slack",      label: "Slack",       Component: Hash,        tint: "text-purple-400" },
  { value: "icon:notepad",    label: "Notepad",     Component: StickyNote,  tint: "text-yellow-200" },
  { value: "icon:calc",       label: "Calculator",  Component: Calculator,  tint: "text-cyan-300" },
  { value: "icon:clock",      label: "Clock",       Component: Clock,       tint: "text-slate-300" },
  { value: "icon:network",    label: "Network",     Component: Globe2,      tint: "text-teal-300" },
];

// Popular emojis for users who prefer the iOS-style emoji look.
export const EMOJI_LIBRARY: string[] = [
  "🎮","💬","🎵","🌐","📁","📂","⚙️","🛠️","📝","📚",
  "🎨","🎬","📷","🖼️","🕹️","🚀","💡","🔧","🔨","💻",
  "🖥️","⌨️","🖱️","💾","📦","🔒","🔑","🔔","📅","📊",
  "📈","📉","🧮","🧪","🧠","🤖","👾","🏆","💎","🔥",
];

// Quick lookup map for icon: values
const ICON_MAP = new Map<string, IconOption>(
  ICON_LIBRARY.map((o) => [o.value, o])
);

export function resolveIcon(value: string): IconOption | null {
  return ICON_MAP.get(value) ?? null;
}

/**
 * Render decision for an AppEntry.icon string.
 * Returns one of:
 *   { kind: "emoji",  emoji }      → render emoji text
 *   { kind: "icon",   option }     → render lucide icon
 *   { kind: "file",   src }        → render <img src=…>
 *   { kind: "fallback" }           → render generic icon
 */
export type IconRender =
  | { kind: "emoji"; emoji: string }
  | { kind: "icon"; option: IconOption }
  | { kind: "file"; src: string }
  | { kind: "asset"; src: string }
  | { kind: "fallback" };

export function parseIcon(value: string | undefined): IconRender {
  if (!value) return { kind: "fallback" };
  if (value.startsWith("emoji:")) {
    return { kind: "emoji", emoji: value.slice("emoji:".length) };
  }
  if (value.startsWith("icon:")) {
    const opt = resolveIcon(value);
    if (opt) return { kind: "icon", option: opt };
    return { kind: "fallback" };
  }
  if (
    value.startsWith("asset:") ||
    value.startsWith("https://") ||
    value.startsWith("http://") ||
    value.startsWith("data:image/")
  ) {
    return { kind: "asset", src: value };
  }
  if (value.startsWith("file:")) {
    return { kind: "file", src: value.slice("file:".length) };
  }
  if (value.includes("/") || value.includes("\\")) {
    return { kind: "file", src: value };
  }
  return { kind: "fallback" };
}
