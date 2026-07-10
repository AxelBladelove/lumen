use std::collections::BTreeSet;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use serde_json::Value;
use sha2::{Digest, Sha256};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::manifest::validate_manifest;
use crate::testing::validate_io_cases;

const MANIFEST_ENTRY: &str = "manifest.json";

const INVALID_PACKAGE: &str = "INVALID_PACKAGE";
const MANIFEST_INVALID: &str = "MANIFEST_INVALID";
const CASES_INVALID: &str = "CASES_INVALID";
const UNSAFE_ENTRY: &str = "UNSAFE_ENTRY";
const UNDECLARED_ENTRY: &str = "UNDECLARED_ENTRY";
const MISSING_CONTENT: &str = "MISSING_CONTENT";
const PACKAGE_TOO_LARGE: &str = "PACKAGE_TOO_LARGE";
const ALREADY_INSTALLED: &str = "ALREADY_INSTALLED";
const IO_ERROR: &str = "IO_ERROR";

static STAGING_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EsexError {
    pub code: String,
    pub path: String,
    pub message: String,
}

impl EsexError {
    fn new(code: &str, path: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.to_owned(),
            path: path.into(),
            message: message.into(),
        }
    }
}

#[derive(Debug)]
pub struct EsexBuildInfo {
    pub package_path: PathBuf,
    pub package_sha256: String,
    pub size_bytes: u64,
    pub entry_count: usize,
}

#[derive(Debug)]
pub struct ImportedActivity {
    pub activity_id: String,
    pub version: String,
    pub package_sha256: String,
    pub install_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct ImportLimits {
    pub max_entries: usize,
    pub max_total_uncompressed_bytes: u64,
    pub max_file_uncompressed_bytes: u64,
}

impl Default for ImportLimits {
    fn default() -> Self {
        Self {
            max_entries: 256,
            max_total_uncompressed_bytes: 32 * 1024 * 1024,
            max_file_uncompressed_bytes: 8 * 1024 * 1024,
        }
    }
}

pub fn build_esex(
    activity_dir: &Path,
    output_path: &Path,
) -> Result<EsexBuildInfo, Vec<EsexError>> {
    let manifest_path = activity_dir.join(MANIFEST_ENTRY);
    let manifest_json = fs::read_to_string(&manifest_path).map_err(|error| {
        vec![EsexError::new(
            IO_ERROR,
            MANIFEST_ENTRY,
            format!("No se pudo leer {}: {error}", manifest_path.display()),
        )]
    })?;

    let manifest = validate_activity(&manifest_json, |relative| {
        fs::read_to_string(activity_dir.join(relative)).ok()
    })?;

    let content_paths = declared_content_paths(&manifest);
    let mut missing = Vec::new();
    for relative in &content_paths {
        if !activity_dir.join(relative).is_file() {
            missing.push(EsexError::new(
                MISSING_CONTENT,
                relative.clone(),
                format!("El archivo declarado en content '{relative}' no existe."),
            ));
        }
    }
    if !missing.is_empty() {
        return Err(missing);
    }

    let file = File::create(output_path).map_err(|error| {
        vec![EsexError::new(
            IO_ERROR,
            output_path.display().to_string(),
            format!("No se pudo crear el paquete: {error}"),
        )]
    })?;
    let mut writer = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .last_modified_time(zip::DateTime::default())
        .unix_permissions(0o644);

    let mut entry_count = 0;
    let mut write_entry = |name: &str, bytes: &[u8]| -> Result<(), Vec<EsexError>> {
        writer
            .start_file(name, options)
            .and_then(|()| writer.write_all(bytes).map_err(zip::result::ZipError::Io))
            .map_err(|error| {
                vec![EsexError::new(
                    IO_ERROR,
                    name,
                    format!("No se pudo escribir la entrada '{name}': {error}"),
                )]
            })
    };

    write_entry(MANIFEST_ENTRY, manifest_json.as_bytes())?;
    entry_count += 1;
    for relative in &content_paths {
        let bytes = fs::read(activity_dir.join(relative)).map_err(|error| {
            vec![EsexError::new(
                IO_ERROR,
                relative.clone(),
                format!("No se pudo leer '{relative}': {error}"),
            )]
        })?;
        write_entry(relative, &bytes)?;
        entry_count += 1;
    }

    writer.finish().map_err(|error| {
        vec![EsexError::new(
            IO_ERROR,
            output_path.display().to_string(),
            format!("No se pudo finalizar el paquete: {error}"),
        )]
    })?;

    let (package_sha256, size_bytes) = hash_file(output_path).map_err(|message| {
        vec![EsexError::new(
            IO_ERROR,
            output_path.display().to_string(),
            message,
        )]
    })?;

    Ok(EsexBuildInfo {
        package_path: output_path.to_path_buf(),
        package_sha256,
        size_bytes,
        entry_count,
    })
}

pub fn import_esex(
    esex_path: &Path,
    install_root: &Path,
) -> Result<ImportedActivity, Vec<EsexError>> {
    import_esex_with_limits(esex_path, install_root, &ImportLimits::default())
}

pub fn import_esex_with_limits(
    esex_path: &Path,
    install_root: &Path,
    limits: &ImportLimits,
) -> Result<ImportedActivity, Vec<EsexError>> {
    let file = File::open(esex_path).map_err(|error| {
        vec![EsexError::new(
            IO_ERROR,
            esex_path.display().to_string(),
            format!("No se pudo abrir el paquete: {error}"),
        )]
    })?;
    let mut archive = ZipArchive::new(file).map_err(|error| {
        vec![EsexError::new(
            INVALID_PACKAGE,
            esex_path.display().to_string(),
            format!("El paquete no es un zip válido: {error}"),
        )]
    })?;

    if archive.len() > limits.max_entries {
        return Err(vec![EsexError::new(
            PACKAGE_TOO_LARGE,
            "",
            format!(
                "El paquete declara {} entradas y el máximo es {}.",
                archive.len(),
                limits.max_entries
            ),
        )]);
    }

    let mut entry_names = BTreeSet::new();
    let mut declared_total: u64 = 0;
    let mut errors = Vec::new();
    for index in 0..archive.len() {
        let entry = match archive.by_index(index) {
            Ok(entry) => entry,
            Err(error) => {
                return Err(vec![EsexError::new(
                    INVALID_PACKAGE,
                    format!("entrada {index}"),
                    format!("No se pudo leer la entrada del paquete: {error}"),
                )]);
            }
        };
        let name = entry.name().to_owned();
        if !entry.is_file() {
            errors.push(EsexError::new(
                UNSAFE_ENTRY,
                name.clone(),
                "El paquete solo puede contener archivos regulares.",
            ));
            continue;
        }
        if let Some(reason) = unsafe_entry_reason(&name) {
            errors.push(EsexError::new(UNSAFE_ENTRY, name.clone(), reason));
            continue;
        }
        if entry.size() > limits.max_file_uncompressed_bytes {
            errors.push(EsexError::new(
                PACKAGE_TOO_LARGE,
                name.clone(),
                format!(
                    "La entrada declara {} bytes y el máximo por archivo es {}.",
                    entry.size(),
                    limits.max_file_uncompressed_bytes
                ),
            ));
            continue;
        }
        declared_total = declared_total.saturating_add(entry.size());
        entry_names.insert(name);
    }
    if !errors.is_empty() {
        return Err(errors);
    }
    if declared_total > limits.max_total_uncompressed_bytes {
        return Err(vec![EsexError::new(
            PACKAGE_TOO_LARGE,
            "",
            format!(
                "El paquete declara {declared_total} bytes descomprimidos y el máximo es {}.",
                limits.max_total_uncompressed_bytes
            ),
        )]);
    }
    if !entry_names.contains(MANIFEST_ENTRY) {
        return Err(vec![EsexError::new(
            INVALID_PACKAGE,
            MANIFEST_ENTRY,
            "El paquete no contiene manifest.json en la raíz.",
        )]);
    }

    let manifest_json = read_entry_string(&mut archive, MANIFEST_ENTRY, limits)?;
    let manifest = validate_activity(&manifest_json, |relative| {
        read_entry_string(&mut archive, relative, limits).ok()
    })?;

    let declared: BTreeSet<String> = declared_content_paths(&manifest).into_iter().collect();
    let mut errors = Vec::new();
    for name in &entry_names {
        if name != MANIFEST_ENTRY && !declared.contains(name) {
            errors.push(EsexError::new(
                UNDECLARED_ENTRY,
                name.clone(),
                format!("La entrada '{name}' no está declarada en el content map."),
            ));
        }
    }
    for relative in &declared {
        if !entry_names.contains(relative) {
            errors.push(EsexError::new(
                MISSING_CONTENT,
                relative.clone(),
                format!("El path declarado '{relative}' no existe en el paquete."),
            ));
        }
    }
    if !errors.is_empty() {
        return Err(errors);
    }

    let activity_id = manifest
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let version = manifest
        .get("version")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();

    let staging = install_root.join(".staging").join(format!(
        "{activity_id}-{version}-{}-{}",
        std::process::id(),
        STAGING_COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    if let Err(error) = fs::create_dir_all(&staging) {
        return Err(vec![EsexError::new(
            IO_ERROR,
            staging.display().to_string(),
            format!("No se pudo crear el staging: {error}"),
        )]);
    }

    let extraction = extract_all(&mut archive, &staging, limits);
    if let Err(errors) = extraction {
        cleanup(&staging);
        return Err(errors);
    }

    let (package_sha256, _) = match hash_file(esex_path) {
        Ok(result) => result,
        Err(message) => {
            cleanup(&staging);
            return Err(vec![EsexError::new(
                IO_ERROR,
                esex_path.display().to_string(),
                message,
            )]);
        }
    };

    let install_path = install_root.join(&activity_id).join(&version);
    if install_path.exists() {
        cleanup(&staging);
        return Err(vec![EsexError::new(
            ALREADY_INSTALLED,
            install_path.display().to_string(),
            format!("La actividad {activity_id}@{version} ya está instalada."),
        )]);
    }
    if let Some(parent) = install_path.parent() {
        if let Err(error) = fs::create_dir_all(parent) {
            cleanup(&staging);
            return Err(vec![EsexError::new(
                IO_ERROR,
                parent.display().to_string(),
                format!("No se pudo preparar el destino: {error}"),
            )]);
        }
    }
    if let Err(error) = fs::rename(&staging, &install_path) {
        cleanup(&staging);
        return Err(vec![EsexError::new(
            IO_ERROR,
            install_path.display().to_string(),
            format!("No se pudo materializar la instalación: {error}"),
        )]);
    }

    Ok(ImportedActivity {
        activity_id,
        version,
        package_sha256,
        install_path,
    })
}

fn validate_activity(
    manifest_json: &str,
    mut read_content_file: impl FnMut(&str) -> Option<String>,
) -> Result<Value, Vec<EsexError>> {
    if let Err(manifest_errors) = validate_manifest(manifest_json) {
        return Err(manifest_errors
            .into_iter()
            .map(|error| {
                EsexError::new(
                    MANIFEST_INVALID,
                    error.path,
                    format!("{}: {}", error.code, error.message),
                )
            })
            .collect());
    }
    let manifest: Value = match serde_json::from_str(manifest_json) {
        Ok(value) => value,
        Err(error) => {
            return Err(vec![EsexError::new(
                MANIFEST_INVALID,
                MANIFEST_ENTRY,
                format!("El manifest no contiene JSON válido: {error}"),
            )]);
        }
    };

    let is_io_mode = manifest
        .pointer("/testContract/mode")
        .and_then(Value::as_str)
        == Some("io");
    if is_io_mode {
        let test_data_paths: Vec<String> = manifest
            .pointer("/content/tests")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter(|item| item.get("role").and_then(Value::as_str) == Some("test-data"))
            .filter_map(|item| item.get("path").and_then(Value::as_str))
            .map(str::to_owned)
            .collect();
        for relative in test_data_paths {
            let Some(cases_json) = read_content_file(&relative) else {
                return Err(vec![EsexError::new(
                    MISSING_CONTENT,
                    relative.clone(),
                    format!("No se pudo leer el archivo de tests '{relative}'."),
                )]);
            };
            if let Err(case_errors) = validate_io_cases(&cases_json, &manifest) {
                return Err(case_errors
                    .into_iter()
                    .map(|error| {
                        EsexError::new(
                            CASES_INVALID,
                            format!("{relative}{}", error.path),
                            format!("{}: {}", error.code, error.message),
                        )
                    })
                    .collect());
            }
        }
    }

    Ok(manifest)
}

fn declared_content_paths(manifest: &Value) -> Vec<String> {
    let mut paths = BTreeSet::new();
    if let Some(content) = manifest.get("content") {
        collect_paths(content, &mut paths);
    }
    paths.into_iter().collect()
}

fn collect_paths(value: &Value, paths: &mut BTreeSet<String>) {
    match value {
        Value::Object(object) => {
            if let Some(path) = object.get("path").and_then(Value::as_str) {
                paths.insert(path.to_owned());
            }
            for child in object.values() {
                collect_paths(child, paths);
            }
        }
        Value::Array(items) => {
            for child in items {
                collect_paths(child, paths);
            }
        }
        _ => {}
    }
}

fn unsafe_entry_reason(name: &str) -> Option<String> {
    if name.is_empty() {
        return Some("Nombre de entrada vacío.".to_owned());
    }
    if name.starts_with('/') || name.starts_with('\\') {
        return Some("Las entradas no pueden usar rutas absolutas.".to_owned());
    }
    if name.contains('\\') {
        return Some("Las entradas no pueden contener backslashes.".to_owned());
    }
    if name.contains(':') {
        return Some("Las entradas no pueden contener ':'.".to_owned());
    }
    for component in name.split('/') {
        if component.is_empty() || component == "." || component == ".." {
            return Some(format!("Componente de ruta inseguro: '{component}'."));
        }
        let stem = component.split('.').next().unwrap_or(component);
        if is_windows_device_name(stem) {
            return Some(format!(
                "El componente '{component}' usa un nombre de dispositivo de Windows."
            ));
        }
    }
    None
}

fn is_windows_device_name(stem: &str) -> bool {
    let upper = stem.to_ascii_uppercase();
    matches!(upper.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (upper.len() == 4
            && (upper.starts_with("COM") || upper.starts_with("LPT"))
            && upper[3..].chars().all(|c| c.is_ascii_digit() && c != '0'))
}

fn read_entry_string(
    archive: &mut ZipArchive<File>,
    name: &str,
    limits: &ImportLimits,
) -> Result<String, Vec<EsexError>> {
    let mut entry = archive.by_name(name).map_err(|error| {
        vec![EsexError::new(
            INVALID_PACKAGE,
            name,
            format!("No se pudo abrir la entrada '{name}': {error}"),
        )]
    })?;
    let bytes = read_limited_bytes(&mut entry, limits.max_file_uncompressed_bytes)
        .map_err(|message| vec![EsexError::new(PACKAGE_TOO_LARGE, name, message)])?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn extract_all(
    archive: &mut ZipArchive<File>,
    staging: &Path,
    limits: &ImportLimits,
) -> Result<(), Vec<EsexError>> {
    let mut total: u64 = 0;
    for index in 0..archive.len() {
        let mut entry = match archive.by_index(index) {
            Ok(entry) => entry,
            Err(error) => {
                return Err(vec![EsexError::new(
                    INVALID_PACKAGE,
                    format!("entrada {index}"),
                    format!("No se pudo leer la entrada: {error}"),
                )]);
            }
        };
        let name = entry.name().to_owned();
        let bytes = read_limited_bytes(&mut entry, limits.max_file_uncompressed_bytes)
            .map_err(|message| vec![EsexError::new(PACKAGE_TOO_LARGE, name.clone(), message)])?;
        total = total.saturating_add(bytes.len() as u64);
        if total > limits.max_total_uncompressed_bytes {
            return Err(vec![EsexError::new(
                PACKAGE_TOO_LARGE,
                name,
                format!(
                    "El contenido descomprimido supera el máximo de {} bytes.",
                    limits.max_total_uncompressed_bytes
                ),
            )]);
        }

        let destination = staging.join(&name);
        if let Some(parent) = destination.parent() {
            if let Err(error) = fs::create_dir_all(parent) {
                return Err(vec![EsexError::new(
                    IO_ERROR,
                    name,
                    format!("No se pudo crear el directorio de extracción: {error}"),
                )]);
            }
        }
        if let Err(error) = fs::write(&destination, &bytes) {
            return Err(vec![EsexError::new(
                IO_ERROR,
                name,
                format!("No se pudo extraer el archivo: {error}"),
            )]);
        }
    }
    Ok(())
}

fn read_limited_bytes(reader: &mut impl Read, limit: u64) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    let mut taken = reader.take(limit + 1);
    taken
        .read_to_end(&mut bytes)
        .map_err(|error| format!("No se pudo leer la entrada: {error}"))?;
    if bytes.len() as u64 > limit {
        return Err(format!(
            "La entrada supera el máximo de {limit} bytes descomprimidos."
        ));
    }
    Ok(bytes)
}

fn hash_file(path: &Path) -> Result<(String, u64), String> {
    let mut file = File::open(path)
        .map_err(|error| format!("No se pudo abrir el archivo para hashear: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    let mut size: u64 = 0;
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("No se pudo leer el archivo para hashear: {error}"))?;
        if read == 0 {
            break;
        }
        size += read as u64;
        hasher.update(&buffer[..read]);
    }
    let digest = hasher.finalize();
    let hex = digest
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    Ok((hex, size))
}

fn cleanup(staging: &Path) {
    let _ = fs::remove_dir_all(staging);
}
