// ============================================================
// DeskFolder — Safe Application Launcher & Validator
// ============================================================
//
// Handles launching executables, batch files, and shortcuts safely without
// vulnerable shell-string concatenation or window freezing.

use std::path::{Path, PathBuf};
use std::process::Command;

/// Check whether the target file exists and is accessible.
pub fn validate_target(path: &str) -> bool {
    let p = Path::new(path);
    p.exists()
}

/// Tokenize an argument string into individual arguments safely.
pub fn parse_arguments(args_str: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut quote_char = '"';

    for ch in args_str.chars() {
        match ch {
            '"' | '\'' if !in_quotes => {
                in_quotes = true;
                quote_char = ch;
            }
            c if in_quotes && c == quote_char => {
                in_quotes = false;
            }
            ' ' | '\t' if !in_quotes => {
                if !current.is_empty() {
                    args.push(current.clone());
                    current.clear();
                }
            }
            _ => {
                current.push(ch);
            }
        }
    }
    if !current.is_empty() {
        args.push(current);
    }
    args
}

/// Resolve appropriate working directory for the application.
pub fn resolve_working_dir(target_path: &Path, explicit_dir: Option<&str>) -> Option<PathBuf> {
    if let Some(d) = explicit_dir {
        let p = PathBuf::from(d);
        if p.exists() {
            return Some(p);
        }
    }
    target_path.parent().map(|p| p.to_path_buf())
}

#[cfg(windows)]
fn resolve_shortcut_target(lnk_path: &Path) -> Option<(PathBuf, Option<String>, Option<PathBuf>)> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::{Interface, PCWSTR};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED, IPersistFile, STGM_READ,
    };
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

        let shell_link: Result<IShellLinkW, _> = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER);
        if let Ok(link) = shell_link {
            if let Ok(persist) = link.cast::<IPersistFile>() {
                let wide_path: Vec<u16> = lnk_path.as_os_str().encode_wide().chain(Some(0)).collect();
                if persist.Load(PCWSTR::from_raw(wide_path.as_ptr()), STGM_READ).is_ok() {
                    let mut path_buf = [0u16; 1024];
                    let mut args_buf = [0u16; 1024];
                    let mut dir_buf = [0u16; 1024];

                    let _ = link.GetPath(&mut path_buf, std::ptr::null_mut(), 0);
                    let _ = link.GetArguments(&mut args_buf);
                    let _ = link.GetWorkingDirectory(&mut dir_buf);

                    let target_str = String::from_utf16_lossy(&path_buf).trim_matches(char::from(0)).to_string();
                    let args_str = String::from_utf16_lossy(&args_buf).trim_matches(char::from(0)).to_string();
                    let dir_str = String::from_utf16_lossy(&dir_buf).trim_matches(char::from(0)).to_string();

                    CoUninitialize();

                    if !target_str.is_empty() {
                        let target_path = PathBuf::from(target_str);
                        let target_args = if args_str.is_empty() { None } else { Some(args_str) };
                        let target_dir = if dir_str.is_empty() { None } else { Some(PathBuf::from(dir_str)) };
                        return Some((target_path, target_args, target_dir));
                    }
                }
            }
        }
        CoUninitialize();
    }
    None
}

/// Launch application detached from the DeskFolder process.
pub fn launch_app(
    path: &str,
    arguments: Option<&str>,
    working_dir: Option<&str>,
) -> Result<(), String> {
    let target = Path::new(path);
    if !target.exists() {
        return Err(format!("Target application does not exist: {}", path));
    }

    let ext = target
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    let work_dir = resolve_working_dir(target, working_dir);
    let parsed_args = arguments.map(parse_arguments).unwrap_or_default();

    #[cfg(windows)]
    {
        match ext.as_str() {
            "lnk" => {
                // If custom arguments are provided, resolve the .lnk target so arguments take effect
                if let Some(custom_args) = arguments.filter(|s| !s.trim().is_empty()) {
                    if let Some((resolved_target, _orig_args, resolved_dir)) = resolve_shortcut_target(target) {
                        let effective_dir = work_dir.as_deref().or(resolved_dir.as_deref());
                        let mut cmd = Command::new(&resolved_target);
                        for arg in parse_arguments(custom_args) {
                            cmd.arg(arg);
                        }
                        if let Some(dir) = effective_dir {
                            cmd.current_dir(dir);
                        }
                        match cmd.spawn() {
                            Ok(_) => return Ok(()),
                            Err(err) if err.raw_os_error() == Some(740) => {
                                // Elevation required
                                use std::os::windows::ffi::OsStrExt;
                                use windows::core::PCWSTR;
                                use windows::Win32::UI::Shell::ShellExecuteW;
                                use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

                                let wide_path: Vec<u16> = resolved_target.as_os_str().encode_wide().chain(Some(0)).collect();
                                let wide_args: Vec<u16> = std::ffi::OsStr::new(custom_args).encode_wide().chain(Some(0)).collect();
                                let wide_dir: Option<Vec<u16>> = effective_dir.map(|d| {
                                    d.as_os_str().encode_wide().chain(Some(0)).collect()
                                });

                                unsafe {
                                    let result = ShellExecuteW(
                                        None,
                                        windows::core::w!("runas"),
                                        PCWSTR::from_raw(wide_path.as_ptr()),
                                        PCWSTR::from_raw(wide_args.as_ptr()),
                                        wide_dir.as_ref().map_or(PCWSTR::null(), |d| PCWSTR::from_raw(d.as_ptr())),
                                        SW_SHOWNORMAL,
                                    );
                                    if (result.0 as usize) <= 32 {
                                        return Err(format!("UAC elevation failed: code {}", result.0 as usize));
                                    }
                                }
                                return Ok(());
                            }
                            Err(err) => return Err(format!("Failed to spawn resolved target: {}", err)),
                        }
                    }
                }

                // Default .lnk launch via ShellExecuteW
                use std::os::windows::ffi::OsStrExt;
                use windows::core::PCWSTR;
                use windows::Win32::UI::Shell::ShellExecuteW;
                use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

                let wide_path: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
                let wide_dir: Option<Vec<u16>> = work_dir.as_ref().map(|d| {
                    d.as_os_str().encode_wide().chain(Some(0)).collect()
                });

                unsafe {
                    let result = ShellExecuteW(
                        None,
                        windows::core::w!("open"),
                        PCWSTR::from_raw(wide_path.as_ptr()),
                        PCWSTR::null(),
                        wide_dir.as_ref().map_or(PCWSTR::null(), |d| PCWSTR::from_raw(d.as_ptr())),
                        SW_SHOWNORMAL,
                    );
                    if (result.0 as usize) <= 32 {
                        return Err(format!("ShellExecuteW failed for shortcut: code {}", result.0 as usize));
                    }
                }
                Ok(())
            }
            "bat" | "cmd" => {
                let mut cmd = Command::new("cmd.exe");
                cmd.arg("/C").arg(target);
                for arg in parsed_args {
                    cmd.arg(arg);
                }
                if let Some(dir) = work_dir {
                    cmd.current_dir(dir);
                }
                cmd.spawn().map_err(|e| format!("Failed to spawn batch script: {}", e))?;
                Ok(())
            }
            _ => {
                // Direct executable spawn without cmd.exe wrapper
                let mut cmd = Command::new(target);
                for arg in &parsed_args {
                    cmd.arg(arg);
                }
                if let Some(ref dir) = work_dir {
                    cmd.current_dir(dir);
                }

                match cmd.spawn() {
                    Ok(_) => Ok(()),
                    Err(err) => {
                        // ONLY fallback to runas if the error is specifically ERROR_ELEVATION_REQUIRED (740)
                        if err.raw_os_error() == Some(740) {
                            use std::os::windows::ffi::OsStrExt;
                            use windows::core::PCWSTR;
                            use windows::Win32::UI::Shell::ShellExecuteW;
                            use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

                            let wide_path: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
                            let wide_args: Option<Vec<u16>> = arguments.filter(|s| !s.trim().is_empty()).map(|a| {
                                std::ffi::OsStr::new(a).encode_wide().chain(Some(0)).collect()
                            });
                            let wide_dir: Option<Vec<u16>> = work_dir.as_ref().map(|d| {
                                d.as_os_str().encode_wide().chain(Some(0)).collect()
                            });

                            unsafe {
                                let runas_result = ShellExecuteW(
                                    None,
                                    windows::core::w!("runas"),
                                    PCWSTR::from_raw(wide_path.as_ptr()),
                                    wide_args.as_ref().map_or(PCWSTR::null(), |a| PCWSTR::from_raw(a.as_ptr())),
                                    wide_dir.as_ref().map_or(PCWSTR::null(), |d| PCWSTR::from_raw(d.as_ptr())),
                                    SW_SHOWNORMAL,
                                );
                                if (runas_result.0 as usize) <= 32 {
                                    return Err(format!("UAC elevation failed (code {})", runas_result.0 as usize));
                                }
                            }
                            Ok(())
                        } else {
                            Err(format!("Failed to spawn executable: {}", err))
                        }
                    }
                }
            }
        }
    }


    #[cfg(not(windows))]
    {
        let mut cmd = Command::new(target);
        for arg in parsed_args {
            cmd.arg(arg);
        }
        if let Some(dir) = work_dir {
            cmd.current_dir(dir);
        }
        cmd.spawn().map_err(|e| format!("Failed to spawn target: {}", e))?;
        Ok(())
    }
}
