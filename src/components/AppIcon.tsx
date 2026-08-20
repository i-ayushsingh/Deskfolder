// ============================================================
// DeskFolder — AppIcon Renderer
// ============================================================

import React, { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { parseIcon } from "../lib/icons";
import clsx from "clsx";

interface AppIconProps {
  /** Icon source string (emoji:*, icon:*, file:*, asset:*, auto:*, data:*) */
  value: string;
  /** Size in pixels (default 56) */
  size?: number;
  /** Container shape */
  shape?: "rounded-sm" | "rounded-md" | "rounded-lg" | "rounded-xl" | "rounded-2xl" | "rounded-full" | string;
  /** Missing app status */
  missing?: boolean;
  /** Custom className */
  className?: string;
}

export const AppIcon: React.FC<AppIconProps> = ({
  value,
  size = 56,
  shape = "rounded-2xl",
  missing = false,
  className,
}) => {
  const [imgError, setImgError] = useState(false);
  const render = parseIcon(value);

  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: size * 0.6,
  };

  const isImg = (render.kind === "file" || render.kind === "asset") && !imgError;

  return (
    <div
      style={containerStyle}
      className={clsx(
        shape,
        "relative flex items-center justify-center overflow-hidden shrink-0 select-none",
        !isImg && "border border-white/5 bg-white/[0.05]",
        "transition-all duration-150 ease-fluent",
        missing && "opacity-60 grayscale-[40%]",
        className
      )}
    >
      {render.kind === "emoji" && (
        <span className="leading-none">{render.emoji}</span>
      )}

      {render.kind === "icon" && (
        <render.option.Component
          size={size * 0.55}
          className={render.option.tint}
          strokeWidth={1.75}
        />
      )}

      {isImg && (
        <img
          src={render.src}
          alt=""
          className="w-full h-full object-contain pointer-events-none rounded-[inherit]"
          draggable={false}
          onError={() => setImgError(true)}
        />
      )}

      {(render.kind === "fallback" || ((render.kind === "file" || render.kind === "asset") && imgError)) && (
        <img
          src="/logo.png"
          alt=""
          className="w-full h-full object-contain p-1 opacity-80 pointer-events-none"
          draggable={false}
        />
      )}

      {missing && (
        <div
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500/90 text-black flex items-center justify-center shadow-sm"
          title="Target executable is missing or moved"
        >
          <AlertTriangle size={10} strokeWidth={2.5} />
        </div>
      )}
    </div>
  );
};

export default AppIcon;
