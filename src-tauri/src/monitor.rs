// ============================================================
// DeskFolder — Monitor Work Area, DPI & Layout Positioning Engine
// ============================================================
//
// Calculates deterministic popup geometry clamped within the active
// monitor's work area, accounting for:
//   - Multi-monitor setups with negative virtual screen coordinates.
//   - Taskbars positioned on Left, Top, Right, or Bottom.
//   - Per-monitor DPI scaling.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct LayoutDimensions {
    pub cols: usize,
    pub rows: usize,
    pub card_width: f64,
    pub card_height: f64,
    pub width: f64,
    pub height: f64,
}

/// Compute outer window width and height from the number of apps in a folder,
/// accounting for grid gaps, dynamic search bar, header, and shadow buffer.
pub fn compute_layout(app_count: usize) -> LayoutDimensions {
    let slots = app_count + 1; // +1 for the Add App tile

    let cols = if slots <= 9 {
        3
    } else if slots <= 12 {
        4
    } else if slots <= 20 {
        5
    } else {
        6
    };

    let rows = (slots + cols - 1) / cols;

    const CELL_W: f64 = 88.0;
    const CELL_H: f64 = 96.0;
    const GAP_X: f64 = 12.0;
    const GAP_Y: f64 = 16.0;
    const CARD_PAD_X: f64 = 40.0; // px-5 (20px * 2)
    const HEADER_H: f64 = 52.0;
    const SEARCH_H: f64 = 44.0;
    const CARD_PAD_B: f64 = 20.0; // pb-5
    const SHADOW_PAD: f64 = 40.0; // 20px transparent buffer on all sides for drop shadow

    let search_bar_h = if app_count >= 5 { SEARCH_H } else { 0.0 };

    let card_width = ((cols as f64) * CELL_W) + (((cols - 1) as f64) * GAP_X) + CARD_PAD_X;
    let card_height = HEADER_H + search_bar_h + ((rows as f64) * CELL_H) + (((rows.saturating_sub(1)) as f64) * GAP_Y) + CARD_PAD_B;

    let width = card_width + SHADOW_PAD;
    let height = card_height + SHADOW_PAD;

    LayoutDimensions {
        cols,
        rows,
        card_width,
        card_height,
        width,
        height,
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

#[cfg(test)]
impl Rect {
    pub fn width(&self) -> i32 {
        self.right - self.left
    }

    pub fn height(&self) -> i32 {
        self.bottom - self.top
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MonitorInfo {
    pub monitor_rect: Rect,
    pub work_area: Rect,
    pub dpi_scale: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct OverlayBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}


/// Get the global cursor position in physical screen coordinates.
#[cfg(windows)]
pub fn get_cursor_pos() -> Result<(i32, i32), String> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

    let mut point = POINT { x: 0, y: 0 };
    unsafe {
        let ok = GetCursorPos(&mut point);
        if ok.is_err() {
            return Err("GetCursorPos failed".into());
        }
    }
    Ok((point.x, point.y))
}

#[cfg(not(windows))]
pub fn get_cursor_pos() -> Result<(i32, i32), String> {
    Ok((500, 500))
}

/// Query the monitor and work area containing the given screen point.
#[cfg(windows)]
pub fn get_monitor_at_point(x: i32, y: i32) -> Result<MonitorInfo, String> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};

    let pt = POINT { x, y };
    unsafe {
        let hmonitor = MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST);
        if hmonitor.is_invalid() {
            return Err("MonitorFromPoint returned null".into());
        }

        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };

        if !GetMonitorInfoW(hmonitor, &mut mi).as_bool() {
            return Err("GetMonitorInfoW failed".into());
        }

        let mut dpi_x: u32 = 96;
        let mut dpi_y: u32 = 96;
        let _ = GetDpiForMonitor(hmonitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y);
        let dpi_scale = (dpi_x as f64) / 96.0;

        Ok(MonitorInfo {
            monitor_rect: Rect {
                left: mi.rcMonitor.left,
                top: mi.rcMonitor.top,
                right: mi.rcMonitor.right,
                bottom: mi.rcMonitor.bottom,
            },
            work_area: Rect {
                left: mi.rcWork.left,
                top: mi.rcWork.top,
                right: mi.rcWork.right,
                bottom: mi.rcWork.bottom,
            },
            dpi_scale: if dpi_scale > 0.0 { dpi_scale } else { 1.0 },
        })
    }
}

#[cfg(not(windows))]
pub fn get_monitor_at_point(_x: i32, _y: i32) -> Result<MonitorInfo, String> {
    Ok(MonitorInfo {
        monitor_rect: Rect {
            left: 0,
            top: 0,
            right: 1920,
            bottom: 1080,
        },
        work_area: Rect {
            left: 0,
            top: 0,
            right: 1920,
            bottom: 1040,
        },
        dpi_scale: 1.0,
    })
}

/// Calculate clamped popup bounds for a given cursor position and monitor work area.
pub fn calculate_clamped_bounds(
    cursor_x: i32,
    cursor_y: i32,
    layout: LayoutDimensions,
    monitor: MonitorInfo,
) -> OverlayBounds {
    let scale = monitor.dpi_scale;
    // Scale logical layout to physical pixels
    let physical_width = ((layout.width * scale).round() as i32).max(1);
    let physical_height = ((layout.height * scale).round() as i32).max(1);

    let margin = (12.0 * scale).round() as i32;
    let work = monitor.work_area;

    // Open just below the folder icon (desktop icons are ~48-75px, cursor is near center)
    let icon_offset_y = (32.0 * scale).round() as i32;
    let mut desired_y = cursor_y + icon_offset_y;

    // If opening below would push past bottom margin, open above the icon instead
    if desired_y + physical_height > work.bottom - margin {
        desired_y = cursor_y - physical_height - (32.0 * scale).round() as i32;
    }

    // Center horizontally over cursor/icon
    let desired_x = cursor_x - physical_width / 2;

    // Calculate maximum allowable x and y
    let min_x = work.left + margin;
    let max_x = (work.right - physical_width - margin).max(min_x);

    let min_y = work.top + margin;
    let max_y = (work.bottom - physical_height - margin).max(min_y);

    let clamped_x = desired_x.clamp(min_x, max_x);
    let clamped_y = desired_y.clamp(min_y, max_y);

    OverlayBounds {
        x: clamped_x,
        y: clamped_y,
        width: physical_width as u32,
        height: physical_height as u32,
    }
}

/// Helper: compute full target overlay bounds from cursor and app count.
pub fn compute_target_overlay_bounds(app_count: usize) -> Result<OverlayBounds, String> {
    let (cx, cy) = get_cursor_pos()?;
    let monitor = get_monitor_at_point(cx, cy)?;
    let layout = compute_layout(app_count);
    Ok(calculate_clamped_bounds(cx, cy, layout, monitor))
}
