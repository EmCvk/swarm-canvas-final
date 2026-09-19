use std::fs;
use std::path::PathBuf;
use tauri::{Manager, AppHandle};

fn civitai_dir<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Could not resolve app data directory: {e}"))?
        .join("civitai");
    fs::create_dir_all(&dir).map_err(|e| format!("Could not create Civitai cache directory: {e}"))?;
    Ok(dir)
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn civitai_cache_read(app: AppHandle) -> Result<Option<String>, String> {
    let path = civitai_dir(&app)?.join("library.json");
    match fs::read_to_string(path) {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Could not read Civitai library: {error}")),
    }
}

#[tauri::command]
fn civitai_cache_write(app: AppHandle, payload: String) -> Result<(), String> {
    let dir = civitai_dir(&app)?;
    let temp = dir.join("library.json.tmp");
    let target = dir.join("library.json");
    fs::write(&temp, payload).map_err(|e| format!("Could not write Civitai library: {e}"))?;
    if target.exists() { let _ = fs::remove_file(&target); }
    fs::rename(&temp, &target).map_err(|e| format!("Could not finalize Civitai library: {e}"))?;
    Ok(())
}

fn safe_preview_filename(key: &str) -> String {
    key.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect::<String>()
        .chars()
        .take(96)
        .collect()
}

#[tauri::command]
fn civitai_preview_read(app: AppHandle, key: String) -> Result<Option<String>, String> {
    let path = civitai_dir(&app)?.join("previews").join(format!("{}.txt", safe_preview_filename(&key)));
    match fs::read_to_string(path) {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Could not read cached preview: {error}")),
    }
}

#[tauri::command]
fn civitai_preview_write(app: AppHandle, key: String, data: String) -> Result<(), String> {
    let dir = civitai_dir(&app)?.join("previews");
    fs::create_dir_all(&dir).map_err(|e| format!("Could not create preview cache: {e}"))?;
    let filename = format!("{}.txt", safe_preview_filename(&key));
    let temp = dir.join(format!("{}.tmp", filename));
    let target = dir.join(filename);
    fs::write(&temp, data).map_err(|e| format!("Could not write cached preview: {e}"))?;
    if target.exists() { let _ = fs::remove_file(&target); }
    fs::rename(&temp, &target).map_err(|e| format!("Could not finalize cached preview: {e}"))?;
    Ok(())
}

#[tauri::command]
fn civitai_preview_delete(app: AppHandle, key: String) -> Result<(), String> {
    let path = civitai_dir(&app)?.join("previews").join(format!("{}.txt", safe_preview_filename(&key)));
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Could not delete cached preview: {error}")),
    }
}


#[tauri::command]
fn civitai_cache_location(app: AppHandle) -> Result<String, String> {
    Ok(civitai_dir(&app)?.to_string_lossy().to_string())
}

#[tauri::command]
fn civitai_cache_clear(app: AppHandle) -> Result<(), String> {
    let dir = civitai_dir(&app)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("Could not clear Civitai cache: {e}"))?;
    }
    fs::create_dir_all(&dir).map_err(|e| format!("Could not recreate Civitai cache directory: {e}"))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            civitai_cache_read,
            civitai_cache_write,
            civitai_preview_read,
            civitai_preview_write,
            civitai_preview_delete,
            civitai_cache_location,
            civitai_cache_clear
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
