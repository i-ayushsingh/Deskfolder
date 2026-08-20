// ============================================================
// DeskFolder — Windows Icon Extraction & Caching Engine
// ============================================================
//
// Extracts high-resolution application icons from `.exe` and `.lnk` files,
// caches them as PNG in `%APPDATA%/DeskFolder/icons/`, and returns `file:<path>`
// URLs for rendering in the React frontend.

use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Directory where extracted PNG icons are cached.
pub fn icon_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {}", e))?;
    let cache_dir = app_dir.join("icons");
    fs::create_dir_all(&cache_dir).map_err(|e| format!("create icons dir: {}", e))?;
    Ok(cache_dir)
}

/// Compute cache filename from target path and modification time.
fn cache_key(target_path: &str) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    std::hash::Hash::hash(&target_path, &mut hasher);
    if let Ok(meta) = fs::metadata(target_path) {
        if let Ok(mtime) = meta.modified() {
            std::hash::Hash::hash(&mtime, &mut hasher);
        }
    }
    use std::hash::Hasher;
    format!("icon_{:016x}.png", hasher.finish())
}

/// Extract icon from target executable or shortcut and return as base64 PNG data URL.
pub fn extract_icon(app: &AppHandle, target_path: &str) -> Result<String, String> {
    let target = Path::new(target_path);
    if !target.exists() {
        return Err("Target file does not exist".to_string());
    }

    // Check disk cache first (store raw PNG bytes, return as base64)
    let cache_dir = icon_cache_dir(app)?;
    let key = cache_key(target_path);
    let output_file = cache_dir.join(&key);

    if output_file.exists() {
        let bytes = fs::read(&output_file).map_err(|e| format!("read cache: {}", e))?;
        let b64 = base64_encode(&bytes);
        return Ok(format!("data:image/png;base64,{}", b64));
    }

    #[cfg(windows)]
    {
        extract_windows_icon(target, &output_file)?;
        let bytes = fs::read(&output_file).map_err(|e| format!("read icon: {}", e))?;
        let b64 = base64_encode(&bytes);
        Ok(format!("data:image/png;base64,{}", b64))
    }

    #[cfg(not(windows))]
    {
        Err("Icon extraction is only supported on Windows".to_string())
    }
}

/// Simple base64 encoder (no external dep needed — alphabet is standard).
fn base64_encode(input: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((input.len() + 2) / 3 * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 { chunk[1] as usize } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as usize } else { 0 };
        out.push(ALPHABET[b0 >> 2] as char);
        out.push(ALPHABET[((b0 & 3) << 4) | (b1 >> 4)] as char);
        if chunk.len() > 1 {
            out.push(ALPHABET[((b1 & 0xf) << 2) | (b2 >> 6)] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(ALPHABET[b2 & 0x3f] as char);
        } else {
            out.push('=');
        }
    }
    out
}

/// Decode base64 string into bytes.
fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    let clean = input.trim();
    let mut out = Vec::with_capacity(clean.len() * 3 / 4);
    let mut buffer: u32 = 0;
    let mut bits: u32 = 0;

    for byte in clean.bytes() {
        let val = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' | b'\r' | b'\n' | b' ' => continue,
            _ => return Err("Invalid base64 character".to_string()),
        } as u32;

        buffer = (buffer << 6) | val;
        bits += 6;

        if bits >= 8 {
            bits -= 8;
            out.push((buffer >> bits) as u8);
            buffer &= (1 << bits) - 1;
        }
    }

    Ok(out)
}

/// Load image from app_entry (supports base64 data URLs, local files, and EXE extraction).
fn load_or_extract_app_image(app: &AppHandle, app_entry: &crate::models::AppEntry) -> Option<image::RgbaImage> {
    // 1. If app_entry.icon is a base64 data URL (e.g. data:image/png;base64,...)
    if let Some(b64_data) = app_entry.icon.strip_prefix("data:image/png;base64,")
        .or_else(|| app_entry.icon.strip_prefix("data:image/jpeg;base64,"))
        .or_else(|| app_entry.icon.strip_prefix("data:image/webp;base64,"))
        .or_else(|| app_entry.icon.strip_prefix("data:image/ico;base64,"))
    {
        if let Ok(bytes) = base64_decode(b64_data) {
            if let Ok(dyn_img) = image::load_from_memory(&bytes) {
                return Some(dyn_img.to_rgba8());
            }
        }
    }

    // 2. If app_entry.icon is a local file path
    if app_entry.icon.starts_with("file:") {
        let path = app_entry.icon.trim_start_matches("file:");
        if let Ok(dyn_img) = image::open(path) {
            return Some(dyn_img.to_rgba8());
        }
    }

    // 3. If app_entry.path points to an executable, lnk, or ico
    let target = Path::new(&app_entry.path);
    if target.exists() {
        if let Ok(img) = load_or_extract_image(app, &app_entry.path) {
            return Some(img);
        }
    }

    None
}

/// Generate a Windows .ico file for a folder containing a 2x2 grid (or custom icon).
pub fn generate_folder_icon_ico(
    app: &AppHandle,
    folder: &crate::models::Folder,
) -> Result<PathBuf, String> {
    let cache_dir = icon_cache_dir(app)?;

    // Compute unique content hash for this folder's visual composition
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    std::hash::Hash::hash(&folder.id, &mut hasher);
    std::hash::Hash::hash(&folder.grid_preview, &mut hasher);
    for app in &folder.apps {
        std::hash::Hash::hash(&app.id, &mut hasher);
        std::hash::Hash::hash(&app.icon, &mut hasher);
        std::hash::Hash::hash(&app.path, &mut hasher);
    }
    use std::hash::Hasher;
    let icon_filename = format!("folder_{}_{:08x}.ico", folder.id, hasher.finish());
    let output_ico = cache_dir.join(&icon_filename);

    if output_ico.exists() {
        return Ok(output_ico);
    }

    // Create 256x256 composite grid icon with dark squircle folder background
    let mut base_img = image::RgbaImage::new(256, 256);

    let radius = 48.0f32;
    let min_x = 12.0f32;
    let min_y = 12.0f32;
    let max_x = 244.0f32;
    let max_y = 244.0f32;

    for y in 0..256 {
        for x in 0..256 {
            let fx = x as f32;
            let fy = y as f32;

            let dx = if fx < min_x + radius {
                min_x + radius - fx
            } else if fx > max_x - radius {
                fx - (max_x - radius)
            } else {
                0.0
            };

            let dy = if fy < min_y + radius {
                min_y + radius - fy
            } else if fy > max_y - radius {
                fy - (max_y - radius)
            } else {
                0.0
            };

            let dist = (dx * dx + dy * dy).sqrt();

            if fx >= min_x && fx <= max_x && fy >= min_y && fy <= max_y && dist <= radius {
                // Subtle top-to-bottom dark gradient #2a2b30 -> #1e1f23
                let t = fy / 256.0;
                let r = (42.0 * (1.0 - t) + 30.0 * t) as u8;
                let g = (43.0 * (1.0 - t) + 31.0 * t) as u8;
                let b = (48.0 * (1.0 - t) + 35.0 * t) as u8;
                base_img.put_pixel(x, y, image::Rgba([r, g, b, 255]));
            }
        }
    }

    let is_3x3 = folder.grid_preview.as_deref() == Some("3x3");

    if is_3x3 {
        // 3x3 Grid: Render up to 9 apps
        let apps_to_render: Vec<&crate::models::AppEntry> = folder.apps.iter().take(9).collect();

        if apps_to_render.len() == 1 {
            if let Some(app_img) = load_or_extract_app_image(app, apps_to_render[0]) {
                let resized = image::imageops::resize(&app_img, 150, 150, image::imageops::FilterType::Lanczos3);
                image::imageops::overlay(&mut base_img, &resized, 53, 53);
            }
        } else if !apps_to_render.is_empty() {
            // 3x3 grid positions (60x60 icons with 18px gaps)
            let positions = [
                (20i64, 20i64), (98i64, 20i64), (176i64, 20i64),
                (20i64, 98i64), (98i64, 98i64), (176i64, 98i64),
                (20i64, 176i64), (98i64, 176i64), (176i64, 176i64),
            ];
            for (i, app_entry) in apps_to_render.iter().enumerate() {
                if i >= positions.len() { break; }
                if let Some(app_img) = load_or_extract_app_image(app, app_entry) {
                    let resized = image::imageops::resize(&app_img, 60, 60, image::imageops::FilterType::Lanczos3);
                    image::imageops::overlay(&mut base_img, &resized, positions[i].0, positions[i].1);
                }
            }
        }
    } else {
        // 2x2 Grid (Default): Render up to 4 apps
        let apps_to_render: Vec<&crate::models::AppEntry> = folder.apps.iter().take(4).collect();

        if apps_to_render.len() == 1 {
            // Single app: scale to 150x150 and center
            if let Some(app_img) = load_or_extract_app_image(app, apps_to_render[0]) {
                let resized = image::imageops::resize(&app_img, 150, 150, image::imageops::FilterType::Lanczos3);
                image::imageops::overlay(&mut base_img, &resized, 53, 53);
            }
        } else if !apps_to_render.is_empty() {
            // 2x2 grid positions: (24, 24), (136, 24), (24, 136), (136, 136)
            let positions = [(24i64, 24i64), (136i64, 24i64), (24i64, 136i64), (136i64, 136i64)];
            for (i, app_entry) in apps_to_render.iter().enumerate() {
                if i >= positions.len() { break; }
                if let Some(app_img) = load_or_extract_app_image(app, app_entry) {
                    let resized = image::imageops::resize(&app_img, 96, 96, image::imageops::FilterType::Lanczos3);
                    image::imageops::overlay(&mut base_img, &resized, positions[i].0, positions[i].1);
                }
            }
        }
    }

    base_img
        .save_with_format(&output_ico, image::ImageFormat::Ico)
        .map_err(|e| format!("Failed to save folder ico: {}", e))?;

    Ok(output_ico)
}

/// Helper to load cached icon or extract from exe.
fn load_or_extract_image(app: &AppHandle, target_path: &str) -> Result<image::RgbaImage, String> {
    let cache_dir = icon_cache_dir(app)?;
    let key = cache_key(target_path);
    let output_file = cache_dir.join(&key);

    if !output_file.exists() {
        #[cfg(windows)]
        extract_windows_icon(Path::new(target_path), &output_file)?;
    }

    if output_file.exists() {
        let dyn_img = image::open(&output_file).map_err(|e| format!("open png: {}", e))?;
        Ok(dyn_img.to_rgba8())
    } else {
        Err("Icon file not found".to_string())
    }
}

#[cfg(windows)]
pub fn resolve_shortcut_target(lnk_path: &Path) -> Option<PathBuf> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, IPersistFile, STGM,
    };
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};
    use windows::core::Interface;

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        if let Ok(shell_link) = CoCreateInstance::<_, IShellLinkW>(&ShellLink, None, CLSCTX_INPROC_SERVER) {
            if let Ok(persist_file) = shell_link.cast::<IPersistFile>() {
                let wide_null: Vec<u16> = lnk_path.as_os_str().encode_wide().chain(Some(0)).collect();
                if persist_file.Load(PCWSTR::from_raw(wide_null.as_ptr()), STGM(0)).is_ok() {
                    let mut path_buf = [0u16; 512];
                    let mut find_data = std::mem::zeroed();
                    if shell_link.GetPath(&mut path_buf, &mut find_data, 0).is_ok() {
                        let len = path_buf.iter().position(|&c| c == 0).unwrap_or(path_buf.len());
                        let target_str = String::from_utf16_lossy(&path_buf[..len]);
                        let p = PathBuf::from(target_str);
                        if p.exists() {
                            return Some(p);
                        }
                    }
                }
            }
        }
    }
    None
}

#[cfg(windows)]
fn extract_windows_icon(target: &Path, output_png: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, SelectObject,
        BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HDC, HGDIOBJ,
    };
    use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
    use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, PrivateExtractIconsW, HICON, ICONINFO};

    let resolved_target = if target.extension().and_then(|e| e.to_str()).map(|s| s.eq_ignore_ascii_case("lnk")).unwrap_or(false) {
        resolve_shortcut_target(target).unwrap_or_else(|| target.to_path_buf())
    } else {
        target.to_path_buf()
    };

    let wide_vec: Vec<u16> = resolved_target.as_os_str().encode_wide().collect();
    let wide_null: Vec<u16> = resolved_target.as_os_str().encode_wide().chain(Some(0)).collect();

    unsafe {
        let mut wide_buf = [0u16; 260];
        let len = wide_vec.len().min(259);
        wide_buf[..len].copy_from_slice(&wide_vec[..len]);

        let mut hicons = [HICON::default(); 1];
        let mut icon_ids = [0u32; 1];

        // 1. Try extracting ultra-high-resolution 256x256 icon first
        let mut extracted = PrivateExtractIconsW(
            &wide_buf,
            0,
            256,
            256,
            Some(&mut hicons[..]),
            Some(icon_ids.as_mut_ptr()),
            0,
        );

        // 2. Fallback to 128x128
        if extracted == 0 || hicons[0].is_invalid() {
            extracted = PrivateExtractIconsW(
                &wide_buf,
                0,
                128,
                128,
                Some(&mut hicons[..]),
                Some(icon_ids.as_mut_ptr()),
                0,
            );
        }

        // 3. Fallback to 64x64
        if extracted == 0 || hicons[0].is_invalid() {
            extracted = PrivateExtractIconsW(
                &wide_buf,
                0,
                64,
                64,
                Some(&mut hicons[..]),
                Some(icon_ids.as_mut_ptr()),
                0,
            );
        }

        let hicon: HICON = if extracted > 0 && !hicons[0].is_invalid() {
            hicons[0]
        } else {
            let mut sfi = SHFILEINFOW::default();
            let res = SHGetFileInfoW(
                PCWSTR::from_raw(wide_null.as_ptr()),
                windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES(0),
                Some(&mut sfi),
                std::mem::size_of::<SHFILEINFOW>() as u32,
                SHGFI_ICON | SHGFI_LARGEICON,
            );

            if res == 0 || sfi.hIcon.is_invalid() {
                return Err("Failed to extract icon from target".to_string());
            }
            sfi.hIcon
        };

        let mut icon_info = ICONINFO::default();
        if GetIconInfo(hicon, &mut icon_info).is_err() {
            let _ = DestroyIcon(hicon);
            return Err("GetIconInfo failed".to_string());
        }

        let hbm_color = icon_info.hbmColor;
        let hbm_mask = icon_info.hbmMask;

        if hbm_color.is_invalid() {
            if !hbm_mask.is_invalid() {
                let _ = DeleteObject(HGDIOBJ(hbm_mask.0));
            }
            let _ = DestroyIcon(hicon);
            return Err("Icon has no color bitmap".to_string());
        }

        let mut bm = BITMAP::default();
        let get_obj_res = GetObjectW(
            HGDIOBJ(hbm_color.0),
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut bm as *mut _ as *mut _),
        );

        if get_obj_res == 0 {
            let _ = DeleteObject(HGDIOBJ(hbm_color.0));
            if !hbm_mask.is_invalid() {
                let _ = DeleteObject(HGDIOBJ(hbm_mask.0));
            }
            let _ = DestroyIcon(hicon);
            return Err("GetObjectW failed on color bitmap".to_string());
        }

        let width = bm.bmWidth;
        let height = bm.bmHeight;

        if width <= 0 || height <= 0 {
            let _ = DeleteObject(HGDIOBJ(hbm_color.0));
            if !hbm_mask.is_invalid() {
                let _ = DeleteObject(HGDIOBJ(hbm_mask.0));
            }
            let _ = DestroyIcon(hicon);
            return Err("Invalid icon dimensions".to_string());
        }

        let hdc_screen = HDC(std::ptr::null_mut());
        let hdc_mem = CreateCompatibleDC(hdc_screen);
        if hdc_mem.is_invalid() {
            let _ = DeleteObject(HGDIOBJ(hbm_color.0));
            if !hbm_mask.is_invalid() {
                let _ = DeleteObject(HGDIOBJ(hbm_mask.0));
            }
            let _ = DestroyIcon(hicon);
            return Err("CreateCompatibleDC failed".to_string());
        }

        let old_obj = SelectObject(hdc_mem, HGDIOBJ(hbm_color.0));
        if old_obj.is_invalid() {
            let _ = DeleteDC(hdc_mem);
            let _ = DeleteObject(HGDIOBJ(hbm_color.0));
            if !hbm_mask.is_invalid() {
                let _ = DeleteObject(HGDIOBJ(hbm_mask.0));
            }
            let _ = DestroyIcon(hicon);
            return Err("SelectObject failed on memory DC".to_string());
        }

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height, // top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut raw_pixels: Vec<u8> = vec![0; (width * height * 4) as usize];
        let get_di_res = GetDIBits(
            hdc_mem,
            hbm_color,
            0,
            height as u32,
            Some(raw_pixels.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        if get_di_res == 0 {
            SelectObject(hdc_mem, old_obj);
            let _ = DeleteDC(hdc_mem);
            let _ = DeleteObject(HGDIOBJ(hbm_color.0));
            if !hbm_mask.is_invalid() {
                let _ = DeleteObject(HGDIOBJ(hbm_mask.0));
            }
            let _ = DestroyIcon(hicon);
            return Err("GetDIBits failed to read pixel data".to_string());
        }

        // Convert BGRA to RGBA
        let mut rgba_pixels: Vec<u8> = vec![0; (width * height * 4) as usize];
        let mut has_alpha = false;
        for i in (0..raw_pixels.len()).step_by(4) {
            let b = raw_pixels[i];
            let g = raw_pixels[i + 1];
            let r = raw_pixels[i + 2];
            let a = raw_pixels[i + 3];

            if a > 0 {
                has_alpha = true;
            }

            rgba_pixels[i] = r;
            rgba_pixels[i + 1] = g;
            rgba_pixels[i + 2] = b;
            rgba_pixels[i + 3] = a;
        }

        // If alpha channel is all zeros, use 1-bit mask to compute transparency
        if !has_alpha {
            if !hbm_mask.is_invalid() {
                let mut mask_bmi = BITMAPINFO {
                    bmiHeader: BITMAPINFOHEADER {
                        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                        biWidth: width,
                        biHeight: -height,
                        biPlanes: 1,
                        biBitCount: 1,
                        biCompression: BI_RGB.0,
                        ..Default::default()
                    },
                    ..Default::default()
                };
                let mask_row_bytes = ((width + 31) / 32) * 4;
                let mut mask_pixels = vec![0u8; (mask_row_bytes * height) as usize];
                let mask_res = GetDIBits(
                    hdc_mem,
                    hbm_mask,
                    0,
                    height as u32,
                    Some(mask_pixels.as_mut_ptr() as *mut _),
                    &mut mask_bmi,
                    DIB_RGB_COLORS,
                );
                if mask_res > 0 {
                    for y in 0..height {
                        for x in 0..width {
                            let mask_byte_idx = (y * mask_row_bytes + x / 8) as usize;
                            let bit_idx = 7 - (x % 8);
                            let is_transparent = ((mask_pixels[mask_byte_idx] >> bit_idx) & 1) == 1;
                            let px_idx = ((y * width + x) * 4) as usize;
                            rgba_pixels[px_idx + 3] = if is_transparent { 0 } else { 255 };
                        }
                    }
                } else {
                    for i in (0..rgba_pixels.len()).step_by(4) {
                        rgba_pixels[i + 3] = 255;
                    }
                }
            } else {
                for i in (0..rgba_pixels.len()).step_by(4) {
                    rgba_pixels[i + 3] = 255;
                }
            }
        }

        // Cleanup Win32 objects
        SelectObject(hdc_mem, old_obj);
        let _ = DeleteDC(hdc_mem);
        let _ = DeleteObject(HGDIOBJ(hbm_color.0));
        if !hbm_mask.is_invalid() {
            let _ = DeleteObject(HGDIOBJ(hbm_mask.0));
        }
        let _ = DestroyIcon(hicon);

        // Save as PNG
        let img = image::RgbaImage::from_raw(width as u32, height as u32, rgba_pixels)
            .ok_or_else(|| "Failed to construct RGBA image buffer".to_string())?;

        img.save_with_format(output_png, image::ImageFormat::Png)
            .map_err(|e| format!("Failed to save icon PNG: {}", e))?;

        Ok(())
    }
}
