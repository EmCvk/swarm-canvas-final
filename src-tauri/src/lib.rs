use std::fs;
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const SWARM_CANVAS_META_MARKER: &[u8] = b"SwarmCanvasMetadata\0";
const SUPPORTED_IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "avif"];
const LOCAL_PROJECT_WRITE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp"];

fn civitai_dir<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Could not resolve app data directory: {e}"))?
        .join("civitai");
    fs::create_dir_all(&dir).map_err(|e| format!("Could not create Civitai cache directory: {e}"))?;
    Ok(dir)
}

fn default_local_project_dir<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    // During source development, prefer a real folder inside the SwarmCanvas project
    // itself. Packaged builds fall back to per-user application data.
    if let Some(candidate) = std::env::current_dir()
        .ok()
        .filter(|dir| dir.join("package.json").is_file() && dir.join("src-tauri").is_dir())
        .map(|dir| dir.join(".swarmcanvas-project"))
    {
        return Ok(candidate);
    }

    Ok(app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Could not resolve app local data directory: {e}"))?
        .join("SwarmCanvas")
        .join("LocalProject"))
}

fn local_project_dir<R: tauri::Runtime>(app: &AppHandle<R>, configured_path: Option<&str>) -> Result<PathBuf, String> {
    let path = configured_path
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or(default_local_project_dir(app)?);

    if path.as_os_str().is_empty() {
        return Err("Local Project folder cannot be empty.".to_string());
    }
    if !path.is_absolute() {
        return Err("Local Project folder must be an absolute filesystem path.".to_string());
    }

    fs::create_dir_all(&path).map_err(|e| format!("Could not create Local Project directory: {e}"))?;

    // The asset protocol needs permission to display images from an arbitrary user-selected
    // directory. Tauri's runtime scope is shared by the asset protocol, so this allows the
    // chosen folder without broadening the compile-time scope to the whole filesystem.
    app.asset_protocol_scope()
        .allow_directory(&path, true)
        .map_err(|e| format!("Could not authorize Local Project folder for image previews: {e}"))?;

    Ok(path)
}

fn normalize_relative_path(value: &str) -> Result<PathBuf, String> {
    let normalized = value.replace('\\', "/");
    let path = PathBuf::from(normalized);
    if path.is_absolute() {
        return Err("Local Project path must be relative to the Local Project folder.".to_string());
    }
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err("Local Project path contains an unsafe path component.".to_string());
            }
            Component::Normal(_) => {}
        }
    }
    if path.as_os_str().is_empty() {
        return Err("Local Project path cannot be empty.".to_string());
    }
    Ok(path)
}

fn supported_image_path(path: &Path) -> bool {
    path.extension()
        .and_then(|v| v.to_str())
        .map(|ext| SUPPORTED_IMAGE_EXTENSIONS.iter().any(|candidate| candidate.eq_ignore_ascii_case(ext)))
        .unwrap_or(false)
}

fn extension_lower(path: &Path) -> String {
    path.extension().and_then(|v| v.to_str()).unwrap_or("").to_ascii_lowercase()
}

fn unix_millis(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalProjectImage {
    filename: String,
    path: String,
    size: u64,
    modified_at: u64,
    metadata: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalProjectScan {
    root: String,
    images: Vec<LocalProjectImage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OutputImage {
    path: String,
    relative_path: String,
    name: String,
    size: u64,
    modified_at: u64,
    metadata: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OutputScan {
    root: String,
    images: Vec<OutputImage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OutputCount {
    root: String,
    total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OutputPageScan {
    root: String,
    total: usize,
    start_page: usize,
    page_count: usize,
    page_size: usize,
    images: Vec<OutputImage>,
}

#[derive(Debug, Clone)]
struct OutputIndexEntry {
    path: PathBuf,
    relative_path: String,
    name: String,
    size: u64,
    modified_at: u64,
}

static OUTPUT_INDEX_CACHE: OnceLock<Mutex<HashMap<String, Vec<OutputIndexEntry>>>> = OnceLock::new();

fn output_index_cache() -> &'static Mutex<HashMap<String, Vec<OutputIndexEntry>>> {
    OUTPUT_INDEX_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn output_cache_key(root: &Path) -> String {
    root.to_string_lossy().replace('/', "\\").to_ascii_lowercase()
}

fn build_output_index(root: &Path) -> Result<Vec<OutputIndexEntry>, String> {
    let mut entries = Vec::new();
    recurse_files(root, &mut |file, metadata| {
        let relative_path = file.strip_prefix(root).unwrap_or(file).to_string_lossy().replace('\\', "/");
        let name = file.file_name().and_then(|v| v.to_str()).unwrap_or_default().to_string();
        entries.push(OutputIndexEntry {
            path: file.to_path_buf(),
            relative_path,
            name,
            size: metadata.len(),
            modified_at: unix_millis(metadata),
        });
    }).map_err(|e| format!("Could not index output folder: {e}"))?;
    entries.sort_by(|a, b| b.modified_at.cmp(&a.modified_at).then_with(|| a.relative_path.cmp(&b.relative_path)));
    Ok(entries)
}

fn with_output_index<T>(root: &Path, refresh: bool, f: impl FnOnce(&[OutputIndexEntry]) -> T) -> Result<T, String> {
    let key = output_cache_key(root);
    let mut cache = output_index_cache().lock().map_err(|_| "Output index cache is unavailable.".to_string())?;
    if refresh || !cache.contains_key(&key) {
        let index = build_output_index(root)?;
        cache.insert(key.clone(), index);
    }
    let index = cache.get(&key).ok_or_else(|| "Output index was not created.".to_string())?;
    Ok(f(index))
}

fn current_default_output_roots() -> Vec<PathBuf> {
    vec![
        PathBuf::from(r"C:\SM\Data\Images"),
        PathBuf::from(r"C:\SM\Data\Packages\SwarmUI\output"),
        PathBuf::from(r"C:\SM\Data\Packages\ComfyUI\output"),
    ]
}

fn resolve_output_root(requested: Option<String>) -> Result<PathBuf, String> {
    if let Some(value) = requested {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            let path = PathBuf::from(trimmed);
            if !path.is_dir() {
                return Err(format!("Output folder does not exist or is not a directory: {}", path.display()));
            }
            return Ok(path);
        }
    }

    if let Some(path) = current_default_output_roots().into_iter().find(|path| path.is_dir()) {
        return Ok(path);
    }

    Err("Could not auto-detect Stability Matrix output folder. Expected C:\\SM\\Data\\Images or a SwarmUI output directory.".to_string())
}

fn resolve_output_image_source(requested_root: Option<String>, image_reference: &str) -> Result<(PathBuf, PathBuf), String> {
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Some(value) = requested_root.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
        let requested = PathBuf::from(value);
        if requested.is_dir() { roots.push(requested); }
    }
    for root in current_default_output_roots().into_iter().filter(|path| path.is_dir()) {
        if !roots.iter().any(|existing| existing == &root) { roots.push(root); }
    }

    for root in roots {
        if let Some(source) = output_image_candidate(&root, image_reference) {
            return Ok((root, source));
        }
    }

    Err(format!(
        "Could not resolve generated output on disk: {}. Checked the configured output folder and Stability Matrix/SwarmUI defaults (C:\\SM\\Data\\Images, SwarmUI output, ComfyUI output).",
        image_reference
    ))
}

fn recurse_files(dir: &Path, callback: &mut impl FnMut(&Path, &fs::Metadata)) -> io::Result<()> {
    let entries = fs::read_dir(dir)?;
    for entry in entries.flatten() {
        let path = entry.path();
        let file_type = match entry.file_type() {
            Ok(value) => value,
            Err(_) => continue,
        };
        if file_type.is_dir() {
            // A single inaccessible/temporary directory must not prevent All Outputs from
            // returning every accessible image elsewhere in the Stability Matrix tree.
            let _ = recurse_files(&path, callback);
            continue;
        }
        if !file_type.is_file() || !supported_image_path(&path) {
            continue;
        }
        if let Ok(metadata) = entry.metadata() {
            callback(&path, &metadata);
        }
    }
    Ok(())
}

fn read_exact_slice<'a>(bytes: &'a [u8], start: usize, len: usize) -> Option<&'a [u8]> {
    bytes.get(start..start.checked_add(len)?)
}

fn looks_like_json_metadata(text: &str) -> bool {
    let trimmed = text.trim();
    if !(trimmed.starts_with('{') && trimmed.ends_with('}')) {
        return false;
    }
    let value: serde_json::Value = match serde_json::from_str(trimmed) {
        Ok(value) => value,
        Err(_) => return false,
    };
    let obj = match value.as_object() {
        Some(obj) => obj,
        None => return false,
    };
    obj.contains_key("prompt")
        || obj.contains_key("params")
        || obj.contains_key("sui_image_params")
        || obj.contains_key("sui_extra_data")
        || obj.contains_key("id")
}

fn read_jpeg_metadata(bytes: &[u8]) -> Option<String> {
    if bytes.len() < 2 || bytes[0] != 0xFF || bytes[1] != 0xD8 {
        return None;
    }
    let mut cursor = 2usize;
    while cursor + 3 < bytes.len() {
        if bytes[cursor] != 0xFF {
            cursor += 1;
            continue;
        }
        while cursor < bytes.len() && bytes[cursor] == 0xFF { cursor += 1; }
        if cursor >= bytes.len() { break; }
        let marker = bytes[cursor];
        cursor += 1;
        if marker == 0xDA || marker == 0xD9 { break; }
        if marker == 0x01 || (0xD0..=0xD7).contains(&marker) { continue; }
        if cursor + 2 > bytes.len() { break; }
        let segment_len = u16::from_be_bytes([bytes[cursor], bytes[cursor + 1]]) as usize;
        if segment_len < 2 || cursor + segment_len > bytes.len() { break; }
        let payload = &bytes[cursor + 2..cursor + segment_len];
        if marker == 0xE1 {
            if payload.starts_with(SWARM_CANVAS_META_MARKER) {
                let json = &payload[SWARM_CANVAS_META_MARKER.len()..];
                if let Ok(text) = String::from_utf8(json.to_vec()) {
                    return Some(text);
                }
            } else if let Ok(text) = String::from_utf8(payload.to_vec()) {
                let trimmed = text.trim_matches(char::from(0)).trim();
                if looks_like_json_metadata(trimmed) {
                    return Some(trimmed.to_string());
                }
            }
        }
        cursor += segment_len;
    }
    None
}

fn png_chunk_type(bytes: &[u8], cursor: usize) -> Option<&[u8]> {
    read_exact_slice(bytes, cursor + 4, 4)
}

fn read_png_metadata(bytes: &[u8]) -> Option<String> {
    const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";
    if !bytes.starts_with(PNG_SIGNATURE) { return None; }
    let mut cursor = 8usize;
    while cursor + 12 <= bytes.len() {
        let len = u32::from_be_bytes(bytes[cursor..cursor + 4].try_into().ok()?) as usize;
        if cursor.checked_add(12)?.checked_add(len)? > bytes.len() { break; }
        let ctype = png_chunk_type(bytes, cursor)?;
        let data = &bytes[cursor + 8..cursor + 8 + len];
        if ctype == b"iTXt" {
            if let Some(keyword_end) = data.iter().position(|v| *v == 0) {
                let keyword = String::from_utf8_lossy(&data[..keyword_end]);
                let mut rest = keyword_end + 1;
                if rest + 2 <= data.len() {
                    let compression_flag = data[rest];
                    rest += 1;
                    let _compression_method = data[rest];
                    rest += 1;
                    if let Some(lang_end_rel) = data[rest..].iter().position(|v| *v == 0) {
                        rest += lang_end_rel + 1;
                        if let Some(translated_end_rel) = data[rest..].iter().position(|v| *v == 0) {
                            rest += translated_end_rel + 1;
                            if compression_flag == 0 && keyword.eq_ignore_ascii_case("SwarmCanvas") {
                                if let Ok(text) = String::from_utf8(data[rest..].to_vec()) {
                                    return Some(text);
                                }
                            }
                        }
                    }
                }
            }
        } else if ctype == b"tEXt" {
            if let Some(keyword_end) = data.iter().position(|v| *v == 0) {
                let keyword = String::from_utf8_lossy(&data[..keyword_end]);
                let text = String::from_utf8_lossy(&data[keyword_end + 1..]).to_string();
                if keyword.eq_ignore_ascii_case("SwarmCanvas") || looks_like_json_metadata(&text) {
                    if looks_like_json_metadata(&text) || keyword.eq_ignore_ascii_case("SwarmCanvas") {
                        return Some(text);
                    }
                }
            }
        }
        cursor += 12 + len;
        if ctype == b"IEND" { break; }
    }
    None
}

fn read_webp_metadata(bytes: &[u8]) -> Option<String> {
    if bytes.len() < 12 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WEBP" { return None; }
    let mut cursor = 12usize;
    while cursor + 8 <= bytes.len() {
        let chunk_type = &bytes[cursor..cursor + 4];
        let len = u32::from_le_bytes(bytes[cursor + 4..cursor + 8].try_into().ok()?) as usize;
        let end = cursor.checked_add(8)?.checked_add(len)?;
        if end > bytes.len() { break; }
        let payload = &bytes[cursor + 8..end];
        if chunk_type == b"SCMD" {
            if let Ok(text) = String::from_utf8(payload.to_vec()) { return Some(text); }
        }
        cursor = end + (len & 1);
    }
    None
}

fn read_embedded_metadata(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    match extension_lower(path).as_str() {
        "jpg" | "jpeg" => read_jpeg_metadata(&bytes),
        "png" => read_png_metadata(&bytes),
        "webp" => read_webp_metadata(&bytes),
        _ => None,
    }
}

fn jpeg_insert_metadata(image: &[u8], metadata: &[u8]) -> Result<Vec<u8>, String> {
    if image.len() < 2 || image[0] != 0xFF || image[1] != 0xD8 {
        return Err("The target image is not a valid JPEG.".to_string());
    }
    let payload_len = SWARM_CANVAS_META_MARKER.len() + metadata.len();
    let segment_len = payload_len + 2;
    if segment_len > u16::MAX as usize {
        return Err("Generation metadata is too large for the JPEG metadata segment.".to_string());
    }

    let mut out = Vec::with_capacity(image.len() + payload_len + 4);
    out.extend_from_slice(&image[0..2]);
    out.extend_from_slice(&[0xFF, 0xE1]);
    out.extend_from_slice(&(segment_len as u16).to_be_bytes());
    out.extend_from_slice(SWARM_CANVAS_META_MARKER);
    out.extend_from_slice(metadata);

    // Preserve existing JPEG segments, removing only previous SwarmCanvas metadata.
    let mut cursor = 2usize;
    while cursor + 3 < image.len() {
        if image[cursor] != 0xFF {
            out.extend_from_slice(&image[cursor..]);
            return Ok(out);
        }
        let segment_start = cursor;
        while cursor < image.len() && image[cursor] == 0xFF { cursor += 1; }
        if cursor >= image.len() { out.extend_from_slice(&image[segment_start..]); break; }
        let marker = image[cursor];
        cursor += 1;
        if marker == 0xDA || marker == 0xD9 {
            out.extend_from_slice(&image[segment_start..]);
            break;
        }
        if marker == 0x01 || (0xD0..=0xD7).contains(&marker) {
            out.extend_from_slice(&image[segment_start..cursor]);
            continue;
        }
        if cursor + 2 > image.len() { out.extend_from_slice(&image[segment_start..]); break; }
        let len = u16::from_be_bytes([image[cursor], image[cursor + 1]]) as usize;
        if len < 2 || cursor + len > image.len() { out.extend_from_slice(&image[segment_start..]); break; }
        let payload = &image[cursor + 2..cursor + len];
        if !(marker == 0xE1 && payload.starts_with(SWARM_CANVAS_META_MARKER)) {
            out.extend_from_slice(&image[segment_start..cursor + len]);
        }
        cursor += len;
    }
    Ok(out)
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for byte in bytes {
        crc ^= *byte as u32;
        for _ in 0..8 {
            crc = if (crc & 1) != 0 { (crc >> 1) ^ 0xEDB8_8320 } else { crc >> 1 };
        }
    }
    !crc
}

fn png_make_itxt(metadata: &[u8]) -> Vec<u8> {
    let mut data = Vec::with_capacity(SWARM_CANVAS_META_MARKER.len() + metadata.len() + 8);
    data.extend_from_slice(b"SwarmCanvas\0");
    data.extend_from_slice(&[0, 0]); // compression flag + compression method
    data.push(0); // language tag terminator
    data.push(0); // translated keyword terminator
    data.extend_from_slice(metadata);

    let mut chunk = Vec::with_capacity(data.len() + 12);
    chunk.extend_from_slice(&(data.len() as u32).to_be_bytes());
    chunk.extend_from_slice(b"iTXt");
    chunk.extend_from_slice(&data);
    let mut crc_input = Vec::with_capacity(4 + data.len());
    crc_input.extend_from_slice(b"iTXt");
    crc_input.extend_from_slice(&data);
    chunk.extend_from_slice(&crc32(&crc_input).to_be_bytes());
    chunk
}

fn png_chunk_keyword(data: &[u8]) -> Option<&[u8]> {
    let end = data.iter().position(|v| *v == 0)?;
    Some(&data[..end])
}

fn png_insert_metadata(image: &[u8], metadata: &[u8]) -> Result<Vec<u8>, String> {
    const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";
    if !image.starts_with(PNG_SIGNATURE) { return Err("The target image is not a valid PNG.".to_string()); }

    let mut out = Vec::with_capacity(image.len() + metadata.len() + 64);
    out.extend_from_slice(PNG_SIGNATURE);
    let mut cursor = 8usize;
    let mut inserted = false;

    while cursor + 12 <= image.len() {
        let len = u32::from_be_bytes(image[cursor..cursor + 4].try_into().unwrap()) as usize;
        let end = cursor.checked_add(12).and_then(|v| v.checked_add(len)).ok_or("PNG is too large.")?;
        if end > image.len() { return Err("The target PNG is truncated.".to_string()); }
        let ctype = &image[cursor + 4..cursor + 8];
        let data = &image[cursor + 8..cursor + 8 + len];

        let is_custom_metadata = (ctype == b"iTXt" || ctype == b"tEXt")
            && png_chunk_keyword(data).map(|k| k.eq_ignore_ascii_case(b"SwarmCanvas")).unwrap_or(false);

        if !is_custom_metadata {
            out.extend_from_slice(&image[cursor..end]);
        }
        cursor = end;

        if !inserted && ctype == b"IHDR" {
            out.extend_from_slice(&png_make_itxt(metadata));
            inserted = true;
        }
    }

    if !inserted { return Err("The target PNG did not contain an IHDR chunk.".to_string()); }
    if cursor < image.len() { out.extend_from_slice(&image[cursor..]); }
    Ok(out)
}

fn webp_insert_metadata(image: &[u8], metadata: &[u8]) -> Result<Vec<u8>, String> {
    if image.len() < 12 || &image[0..4] != b"RIFF" || &image[8..12] != b"WEBP" {
        return Err("The target image is not a valid WebP.".to_string());
    }

    let mut payload = Vec::with_capacity(metadata.len() + 8);
    payload.extend_from_slice(metadata);
    let chunk_size = payload.len() as u32;
    let mut out = Vec::with_capacity(image.len() + payload.len() + 16);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&[0, 0, 0, 0]);
    out.extend_from_slice(b"WEBP");

    let mut cursor = 12usize;
    while cursor + 8 <= image.len() {
        let chunk_len = u32::from_le_bytes(image[cursor + 4..cursor + 8].try_into().unwrap()) as usize;
        let end = cursor.checked_add(8).and_then(|v| v.checked_add(chunk_len)).ok_or("WebP is too large.")?;
        if end > image.len() { return Err("The target WebP is truncated.".to_string()); }
        let ctype = &image[cursor..cursor + 4];
        if ctype != b"SCMD" {
            out.extend_from_slice(&image[cursor..end]);
            if chunk_len & 1 != 0 { out.push(0); }
        }
        cursor = end + (chunk_len & 1);
    }

    out.extend_from_slice(b"SCMD");
    out.extend_from_slice(&chunk_size.to_le_bytes());
    out.extend_from_slice(&payload);
    if payload.len() & 1 != 0 { out.push(0); }

    let riff_size = (out.len() - 8) as u32;
    out[4..8].copy_from_slice(&riff_size.to_le_bytes());
    Ok(out)
}

fn embed_metadata(path: &Path, metadata: &str) -> Result<(), String> {
    let bytes = fs::read(path).map_err(|e| format!("Could not read image for metadata update: {e}"))?;
    let updated = match extension_lower(path).as_str() {
        "jpg" | "jpeg" => jpeg_insert_metadata(&bytes, metadata.as_bytes())?,
        "png" => png_insert_metadata(&bytes, metadata.as_bytes())?,
        "webp" => webp_insert_metadata(&bytes, metadata.as_bytes())?,
        _ => return Err(format!("Unsupported project image format: {}", extension_lower(path))),
    };

    let temp = path.with_extension(format!("{}tmp", extension_lower(path)));
    let result = (|| -> Result<(), String> {
        let mut file = fs::File::create(&temp).map_err(|e| format!("Could not create temporary image: {e}"))?;
        file.write_all(&updated).map_err(|e| format!("Could not write image: {e}"))?;
        file.flush().map_err(|e| format!("Could not flush image: {e}"))?;
        drop(file);
        if path.exists() { fs::remove_file(path).map_err(|e| format!("Could not replace existing image: {e}"))?; }
        fs::rename(&temp, path).map_err(|e| format!("Could not finalize image: {e}"))?;
        Ok(())
    })();
    if result.is_err() { let _ = fs::remove_file(&temp); }
    result
}

fn write_embedded_image(path: &Path, image_bytes: &[u8], metadata: &str) -> Result<(), String> {
    if path.extension().is_none() {
        return Err("Image filename needs an extension.".to_string());
    }
    if !LOCAL_PROJECT_WRITE_EXTENSIONS.iter().any(|candidate| candidate.eq_ignore_ascii_case(&extension_lower(path))) {
        return Err(format!("Unsupported Local Project write format: {}", extension_lower(path)));
    }
    let with_metadata = match extension_lower(path).as_str() {
        "jpg" | "jpeg" => jpeg_insert_metadata(image_bytes, metadata.as_bytes())?,
        "png" => png_insert_metadata(image_bytes, metadata.as_bytes())?,
        "webp" => webp_insert_metadata(image_bytes, metadata.as_bytes())?,
        _ => unreachable!(),
    };

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Could not create Local Project output folder: {e}"))?;
    }
    let temp = path.with_extension(format!("{}tmp", extension_lower(path)));
    let result = (|| -> Result<(), String> {
        let mut file = fs::File::create(&temp).map_err(|e| format!("Could not create temporary project image: {e}"))?;
        file.write_all(&with_metadata).map_err(|e| format!("Could not write project image: {e}"))?;
        file.flush().map_err(|e| format!("Could not flush project image: {e}"))?;
        drop(file);
        if path.exists() { fs::remove_file(path).map_err(|e| format!("Could not replace existing project image: {e}"))?; }
        fs::rename(&temp, path).map_err(|e| format!("Could not finalize project image: {e}"))?;
        Ok(())
    })();
    if result.is_err() { let _ = fs::remove_file(&temp); }
    result
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
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
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
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
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
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
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

fn normalize_server_output_reference(value: &str) -> String {
    let mut clean = value.trim().replace('\\', "/");
    if let Some(index) = clean.find('?') { clean.truncate(index); }
    if let Some(scheme_end) = clean.find("://") {
        let remainder = &clean[(scheme_end + 3)..];
        clean = remainder
            .split_once('/')
            .map(|(_, path)| path.to_string())
            .unwrap_or_default();
    }
    clean = clean
        .trim_start_matches('/')
        .trim_start_matches("View/")
        .trim_start_matches("view/")
        .trim_start_matches("Output/")
        .trim_start_matches("output/")
        .to_string();
    clean
}

fn output_image_candidate(root: &Path, reference: &str) -> Option<PathBuf> {
    let raw = reference.trim().replace('\\', "/");
    if raw.is_empty() { return None; }

    // Generation backends may return an absolute filesystem path instead of a /View/...
    // reference. Preserve that path verbatim rather than treating the drive prefix as a
    // relative server path. This also preserves Unicode Windows paths.
    let absolute_candidate = PathBuf::from(&raw);
    if absolute_candidate.is_absolute() && absolute_candidate.is_file() {
        return Some(absolute_candidate);
    }

    let relative = normalize_server_output_reference(&raw);
    if relative.is_empty() { return None; }
    let relative_path = normalize_relative_path(&relative).ok()?;

    let direct = root.join(&relative_path);
    if direct.is_file() { return Some(direct); }

    // SwarmUI URLs can omit the image-type directory in some response versions.
    // Try the Stability Matrix top-level output categories before giving up.
    const CATEGORIES: &[&str] = &[
        "Text2Img", "Img2Img", "Img2ImgGrids", "Text2ImgGrids",
        "SVD", "Saved", "Extras", "Starred",
    ];
    for category in CATEGORIES {
        let candidate = root.join(category).join(&relative_path);
        if candidate.is_file() { return Some(candidate); }
    }

    // Last-resort lookup by basename. Some backend responses contain only the image name
    // while the actual file is nested under a dated/raw folder. This walk is used only when
    // the cheap direct/category checks above fail.
    let basename = relative_path.file_name()?.to_owned();
    let mut found: Option<PathBuf> = None;
    let mut consider = |path: &Path, _metadata: &fs::Metadata| {
        if found.is_none() && path.file_name().map(|name| name == basename).unwrap_or(false) {
            found = Some(path.to_path_buf());
        }
    };
    let _ = recurse_files(root, &mut consider);
    found
}

#[tauri::command(rename = "swarmcanvas_read_output_image_bytes")]
fn swarmcanvas_read_output_image_bytes(path: Option<String>, image_reference: String) -> Result<Vec<u8>, String> {
    let root = resolve_output_root(path)?;
    let file = output_image_candidate(&root, &image_reference)
        .ok_or_else(|| format!("Could not resolve generated output on disk: {image_reference}"))?;
    fs::read(&file).map_err(|e| format!("Could not read generated output {}: {e}", file.display()))
}

#[tauri::command(rename = "swarmcanvas_resolve_output_image_path")]
fn swarmcanvas_resolve_output_image_path(path: Option<String>, image_reference: String) -> Result<String, String> {
    let root = resolve_output_root(path)?;
    let file = output_image_candidate(&root, &image_reference)
        .ok_or_else(|| format!("Could not resolve generated output on disk: {image_reference}"))?;
    Ok(file.to_string_lossy().to_string())
}

#[tauri::command(rename = "swarmcanvas_local_project_location")]
fn swarmcanvas_local_project_location(app: AppHandle, path: Option<String>) -> Result<String, String> {
    Ok(local_project_dir(&app, path.as_deref())?.to_string_lossy().to_string())
}

#[tauri::command(rename = "swarmcanvas_scan_local_project")]
fn swarmcanvas_scan_local_project(app: AppHandle, path: Option<String>) -> Result<LocalProjectScan, String> {
    let root = local_project_dir(&app, path.as_deref())?;
    let mut images = Vec::new();
    recurse_files(&root, &mut |path, metadata| {
        let relative = path.strip_prefix(&root).unwrap_or(path).to_string_lossy().replace('\\', "/");
        images.push(LocalProjectImage {
            filename: relative,
            path: path.to_string_lossy().to_string(),
            size: metadata.len(),
            modified_at: unix_millis(metadata),
            metadata: read_embedded_metadata(path),
        });
    }).map_err(|e| format!("Could not scan Local Project: {e}"))?;
    images.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(LocalProjectScan { root: root.to_string_lossy().to_string(), images })
}


fn encode_project_output_image(
    image_bytes: &[u8],
    format: &str,
    max_dimension: u32,
    quality_percent: u8,
    background: &str,
) -> Result<Vec<u8>, String> {
    use image::{DynamicImage, ImageFormat, GenericImageView, RgbaImage, Rgba};
    use image::codecs::jpeg::JpegEncoder;
    use std::io::Cursor;

    let fmt = format.trim().to_ascii_lowercase();
    if fmt == "original" {
        return Ok(image_bytes.to_vec());
    }
    let decoded = image::load_from_memory(image_bytes)
        .map_err(|e| format!("Could not decode generated image for Local Project storage: {e}"))?;
    let (src_w, src_h) = decoded.dimensions();
    let max_dim = if max_dimension == 0 { src_w.max(src_h) } else { max_dimension };
    let scale = (max_dim as f32 / src_w.max(src_h) as f32).min(1.0);
    let target_w = ((src_w as f32) * scale).round().max(1.0) as u32;
    let target_h = ((src_h as f32) * scale).round().max(1.0) as u32;
    let resized = if target_w != src_w || target_h != src_h {
        decoded.resize(target_w, target_h, image::imageops::FilterType::Lanczos3)
    } else {
        decoded
    };

    let mut out = Cursor::new(Vec::<u8>::new());
    match fmt.as_str() {
        "jpg" | "jpeg" => {
            let bg = if background.eq_ignore_ascii_case("white") { [255,255,255,255] } else { [0,0,0,255] };
            let rgba = resized.to_rgba8();
            let mut composited = RgbaImage::from_pixel(rgba.width(), rgba.height(), Rgba(bg));
            image::imageops::overlay(&mut composited, &rgba, 0, 0);
            let rgb = DynamicImage::ImageRgba8(composited).to_rgb8();
            let quality = quality_percent.clamp(40, 100);
            let mut encoder = JpegEncoder::new_with_quality(&mut out, quality);
            encoder.encode(&rgb, rgb.width(), rgb.height(), image::ExtendedColorType::Rgb8)
                .map_err(|e| format!("Could not encode JPEG for Local Project storage: {e}"))?;
        }
        "png" => resized.write_to(&mut out, ImageFormat::Png)
            .map_err(|e| format!("Could not encode PNG for Local Project storage: {e}"))?,
        "webp" => resized.write_to(&mut out, ImageFormat::WebP)
            .map_err(|e| format!("Could not encode WebP for Local Project storage: {e}"))?,
        other => return Err(format!("Unsupported Local Project format: {other}")),
    }
    Ok(out.into_inner())
}

#[tauri::command(rename = "swarmcanvas_local_project_store_from_output")]
fn swarmcanvas_local_project_store_from_output(
    app: AppHandle,
    path: Option<String>,
    output_folder: Option<String>,
    image_reference: String,
    filename: String,
    metadata: String,
    format: String,
    max_dimension: u32,
    quality_percent: u8,
    background: String,
) -> Result<LocalProjectWriteResult, String> {
    let root = local_project_dir(&app, path.as_deref())?;
    // SwarmUI can announce generation completion just before the filesystem writer has
    // finished flushing the final image. Retry briefly so Local Project storage doesn't turn
    // a successful generation into a misleading storage error.
    let mut last_source_error = String::new();
    let mut source_and_bytes: Option<(PathBuf, Vec<u8>)> = None;
    for attempt in 0..8u8 {
        match resolve_output_image_source(output_folder.clone(), &image_reference) {
            Ok((_source_root, source)) => match fs::read(&source) {
                Ok(bytes) => { source_and_bytes = Some((source, bytes)); break; }
                Err(error) => last_source_error = format!("Could not read generated output {}: {error}", source.display()),
            },
            Err(error) => last_source_error = error,
        }
        if attempt < 7 { std::thread::sleep(std::time::Duration::from_millis(250)); }
    }
    let (source, source_bytes) = source_and_bytes.ok_or_else(|| {
        if last_source_error.is_empty() { "Could not locate the generated output file.".to_string() } else { last_source_error }
    })?;
    let encoded = encode_project_output_image(&source_bytes, &format, max_dimension, quality_percent, &background)?;
    let mut relative = normalize_relative_path(&filename)?;
    if format.trim().eq_ignore_ascii_case("original") {
        // Preserve the real source extension so an original PNG/JPEG/WebP never gets a
        // misleading .jpg suffix.
        if let Some(source_extension) = source.extension().and_then(|value| value.to_str()) {
            let ext = source_extension.to_ascii_lowercase();
            if matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp") {
                relative.set_extension(ext);
            }
        }
    }
    let target = root.join(&relative);
    write_embedded_image(&target, &encoded, &metadata)?;
    let size = fs::metadata(&target).map_err(|e| format!("Could not stat project image: {e}"))?.len();
    Ok(LocalProjectWriteResult { filename: relative.to_string_lossy().replace('\\', "/"), path: target.to_string_lossy().to_string(), size })
}

#[tauri::command(rename = "swarmcanvas_local_project_write_image")]
fn swarmcanvas_local_project_write_image(
    app: AppHandle,
    path: Option<String>,
    filename: String,
    image_bytes: Vec<u8>,
    metadata: String,
) -> Result<LocalProjectWriteResult, String> {
    let root = local_project_dir(&app, path.as_deref())?;
    let relative = normalize_relative_path(&filename)?;
    let path = root.join(&relative);
    write_embedded_image(&path, &image_bytes, &metadata)?;
    let size = fs::metadata(&path).map_err(|e| format!("Could not stat project image: {e}"))?.len();
    Ok(LocalProjectWriteResult {
        filename: relative.to_string_lossy().replace('\\', "/"),
        path: path.to_string_lossy().to_string(),
        size,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalProjectWriteResult {
    filename: String,
    path: String,
    size: u64,
}

#[tauri::command(rename = "swarmcanvas_local_project_write_metadata")]
fn swarmcanvas_local_project_write_metadata(
    app: AppHandle,
    path: Option<String>,
    filename: String,
    metadata: String,
) -> Result<(), String> {
    let root = local_project_dir(&app, path.as_deref())?;
    let relative = normalize_relative_path(&filename)?;
    let path = root.join(relative);
    if !path.is_file() { return Err(format!("Local Project image not found: {}", path.display())); }
    embed_metadata(&path, &metadata)
}

#[tauri::command(rename = "swarmcanvas_local_project_delete_image")]
fn swarmcanvas_local_project_delete_image(app: AppHandle, path: Option<String>, filename: String) -> Result<(), String> {
    let root = local_project_dir(&app, path.as_deref())?;
    let relative = normalize_relative_path(&filename)?;
    let path = root.join(relative);
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Could not delete Local Project image: {error}")),
    }
}

#[tauri::command(rename = "swarmcanvas_invalidate_output_folder_index")]
fn swarmcanvas_invalidate_output_folder_index(path: Option<String>) -> Result<(), String> {
    let root = resolve_output_root(path)?;
    let key = output_cache_key(&root);
    let mut cache = output_index_cache()
        .lock()
        .map_err(|_| "Output index cache is unavailable.".to_string())?;
    cache.remove(&key);
    Ok(())
}

#[tauri::command(rename = "swarmcanvas_count_output_folder")]
async fn swarmcanvas_count_output_folder(app: AppHandle, path: Option<String>, refresh: Option<bool>) -> Result<OutputCount, String> {
    let root = resolve_output_root(path)?;
    app.asset_protocol_scope()
        .allow_directory(&root, true)
        .map_err(|e| format!("Could not authorize output folder for image previews: {e}"))?;

    let root_for_scan = root.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let total = with_output_index(&root_for_scan, refresh.unwrap_or(false), |index| index.len())?;
        Ok(OutputCount { root: root_for_scan.to_string_lossy().to_string(), total })
    }).await.map_err(|e| format!("Output count task failed: {e}"))?
}

#[tauri::command(rename = "swarmcanvas_scan_output_folder_pages")]
async fn swarmcanvas_scan_output_folder_pages(
    app: AppHandle,
    path: Option<String>,
    start_page: usize,
    page_count: usize,
    page_size: usize,
) -> Result<OutputPageScan, String> {
    let root = resolve_output_root(path)?;
    app.asset_protocol_scope()
        .allow_directory(&root, true)
        .map_err(|e| format!("Could not authorize output folder for image previews: {e}"))?;

    let root_for_scan = root.clone();
    let safe_start = start_page.max(1);
    let safe_page_count = page_count.clamp(1, 20);
    let safe_page_size = page_size.clamp(1, 192);

    tauri::async_runtime::spawn_blocking(move || {
        with_output_index(&root_for_scan, false, |index| {
            let total = index.len();
            let start_offset = (safe_start - 1).saturating_mul(safe_page_size);
            let end_offset = start_offset
                .saturating_add(safe_page_count.saturating_mul(safe_page_size))
                .min(total);
            let mut images = Vec::with_capacity(end_offset.saturating_sub(start_offset));
            if start_offset < total {
                for entry in &index[start_offset..end_offset] {
                    images.push(OutputImage {
                        path: entry.path.to_string_lossy().to_string(),
                        relative_path: entry.relative_path.clone(),
                        name: entry.name.clone(),
                        size: entry.size,
                        modified_at: entry.modified_at,
                        // Metadata is read only for the pages the user actually requests.
                        metadata: read_embedded_metadata(&entry.path),
                    });
                }
            }
            Ok(OutputPageScan {
                root: root_for_scan.to_string_lossy().to_string(),
                total,
                start_page: safe_start,
                page_count: safe_page_count,
                page_size: safe_page_size,
                images,
            })
        })
    }).await.map_err(|e| format!("Output page scan task failed: {e}"))??
}

// Backwards-compatible command for older frontend code. It deliberately returns the
// first page-sized slice rather than the entire output tree, preventing huge scans from
// flooding the WebView.
#[tauri::command(rename = "swarmcanvas_scan_output_folder")]
async fn swarmcanvas_scan_output_folder(app: AppHandle, path: Option<String>) -> Result<OutputScan, String> {
    let scan = swarmcanvas_scan_output_folder_pages(app, path, 1, 1, 96).await?;
    Ok(OutputScan { root: scan.root, images: scan.images })
}

#[tauri::command(rename = "swarmcanvas_choose_local_project_location")]
fn swarmcanvas_choose_local_project_location(default_path: Option<String>) -> Result<Option<String>, String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let mut script = String::from(
            "Add-Type -AssemblyName System.Windows.Forms; $d=New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description='Choose a SwarmCanvas Local Project folder'; $d.ShowNewFolderButton=$true;"
        );
        if let Some(path) = default_path.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
            let escaped = path.replace('\'', "''");
            script.push_str(&format!("$d.SelectedPath='{}';", escaped));
        }
        script.push_str("if($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){ [Console]::Out.Write($d.SelectedPath) }");
        // Force the PowerShell process to emit UTF-8 bytes. This is important for Windows
        // paths such as `Masa\u{00fc}st\u{00fc}`; decoding a legacy console code page as UTF-8 can
        // silently corrupt the selected path and make subsequent filesystem calls fail.
        script = format!(
            "$OutputEncoding = [System.Text.UTF8Encoding]::new($false); [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); {}",
            script
        );
        let output = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Could not open the Windows folder picker: {e}"))?;
        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if error.is_empty() { "Windows folder picker failed.".to_string() } else { error });
        }
        let selected = String::from_utf8(output.stdout)
            .map_err(|e| format!("Windows folder picker returned an invalid UTF-8 path: {e}"))?
            .trim()
            .to_string();
        return Ok((!selected.is_empty()).then_some(selected));
    }

    #[cfg(not(windows))]
    {
        let _ = default_path;
        Err("Local Project folder selection is currently implemented for Windows desktop builds.".to_string())
    }
}

#[tauri::command(rename = "swarmcanvas_local_project_reveal_path")]
fn swarmcanvas_local_project_reveal_path(app: AppHandle, path: Option<String>, filename: String) -> Result<String, String> {
    let root = local_project_dir(&app, path.as_deref())?;
    let relative = normalize_relative_path(&filename)?;
    Ok(root.join(relative).to_string_lossy().to_string())
}

#[tauri::command(rename = "swarmcanvas_reveal_path")]
fn swarmcanvas_reveal_path(path: String) -> Result<(), String> {
    let target = PathBuf::from(path.trim());
    if target.as_os_str().is_empty() {
        return Err("Path cannot be empty.".to_string());
    }
    if !target.exists() {
        return Err(format!("Path does not exist: {}", target.display()));
    }

    #[cfg(windows)]
    {
        if target.is_dir() {
            std::process::Command::new("explorer.exe")
                .arg(target.as_os_str())
                .spawn()
                .map_err(|e| format!("Could not open Explorer: {e}"))?;
        } else {
            // explorer.exe's /select switch opens the containing folder and selects the file.
            std::process::Command::new("explorer.exe")
                .arg(format!("/select,{}", target.display()))
                .spawn()
                .map_err(|e| format!("Could not reveal file in Explorer: {e}"))?;
        }
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        let mut command = std::process::Command::new("open");
        if target.is_file() { command.args(["-R"]); }
        command.arg(target.as_os_str()).spawn().map_err(|e| format!("Could not open Finder: {e}"))?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(if target.is_file() { target.parent().unwrap_or(&target) } else { &target })
            .spawn()
            .map_err(|e| format!("Could not open file manager: {e}"))?;
        Ok(())
    }
}

#[tauri::command(rename = "swarmcanvas_storage_backend_version")]
fn swarmcanvas_storage_backend_version() -> String {
    // Bump this whenever the Tauri-side Local Project / All Outputs command surface changes.
    // The frontend uses it to distinguish a current source tree from an old running binary.
    "6".to_string()
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
            civitai_cache_clear,
            swarmcanvas_read_output_image_bytes,
            swarmcanvas_resolve_output_image_path,
            swarmcanvas_local_project_location,
            swarmcanvas_scan_local_project,
            swarmcanvas_local_project_write_image,
            swarmcanvas_local_project_store_from_output,
            swarmcanvas_local_project_write_metadata,
            swarmcanvas_local_project_delete_image,
            swarmcanvas_scan_output_folder,
            swarmcanvas_count_output_folder,
            swarmcanvas_scan_output_folder_pages,
            swarmcanvas_invalidate_output_folder_index,
            swarmcanvas_choose_local_project_location,
            swarmcanvas_local_project_reveal_path,
            swarmcanvas_reveal_path,
            swarmcanvas_storage_backend_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running SwarmCanvas application");
}
