import type { LayoutDimensions } from "./types";

export function computeGridLayout(appCount: number): LayoutDimensions {
  const slots = appCount + 1; // +1 for the Add App tile

  const cols = slots <= 9 ? 3 : slots <= 12 ? 4 : slots <= 20 ? 5 : 6;
  const rows = Math.ceil(slots / cols);

  const CELL_W = 88;
  const CELL_H = 96;
  const GAP_X = 12;
  const GAP_Y = 16;
  const CARD_PAD_X = 40;
  const HEADER_H = 52;
  const SEARCH_H = 44;
  const CARD_PAD_B = 20;
  const SHADOW_PAD = 40;

  const search_bar_h = appCount >= 5 ? SEARCH_H : 0;
  const card_width = cols * CELL_W + (cols - 1) * GAP_X + CARD_PAD_X;
  const card_height = HEADER_H + search_bar_h + rows * CELL_H + Math.max(0, rows - 1) * GAP_Y + CARD_PAD_B;

  return {
    cols,
    rows,
    card_width,
    card_height,
    width: card_width + SHADOW_PAD,
    height: card_height + SHADOW_PAD,
  };
}

/** Inline style for gridTemplateColumns. */
export function gridTemplate(cols: number): string {
  return `repeat(${cols}, minmax(0, 1fr))`;
}

