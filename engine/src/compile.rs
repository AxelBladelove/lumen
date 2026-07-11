use std::env;
use std::fs::{self, OpenOptions};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use wait_timeout::ChildExt;

const COMPILE_TIMEOUT: Duration = Duration::from_secs(30);
const RAW_OUTPUT_LIMIT: usize = 64 * 1024;
static WRITE_PROBE_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug)]
pub(crate) struct CompileFailure {
    pub(crate) code: &'static str,
    pub(crate) message: &'static str,
    pub(crate) recoverable: bool,
}

impl CompileFailure {
    fn source_not_found() -> Self {
        Self {
            code: "SOURCE_NOT_FOUND",
            message: "No se encontro un archivo fuente .c valido.",
            recoverable: true,
        }
    }

    pub(crate) fn toolchain_not_found() -> Self {
        Self {
            code: "TOOLCHAIN_NOT_FOUND",
            message: "No se encontro GCC. Instala MSYS2 UCRT64 y agrega GCC al PATH.",
            recoverable: true,
        }
    }

    fn build_dir_error() -> Self {
        Self {
            code: "BUILD_DIR_ERROR",
            message: "No se pudo crear o escribir la carpeta .lumen-build.",
            recoverable: true,
        }
    }

    fn compiler_failed(message: &'static str) -> Self {
        Self {
            code: "COMPILER_FAILED",
            message,
            recoverable: true,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CompileResult {
    pub(crate) status: CompileStatus,
    pub(crate) executable_path: Option<String>,
    pub(crate) diagnostics: Vec<Diagnostic>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) raw_output: Option<String>,
    pub(crate) duration_ms: u64,
    pub(crate) toolchain: Toolchain,
}

impl CompileResult {
    pub(crate) fn error_count(&self) -> usize {
        self.diagnostics
            .iter()
            .filter(|diagnostic| diagnostic.kind == DiagnosticKind::Error)
            .count()
    }

    pub(crate) fn warning_count(&self) -> usize {
        self.diagnostics
            .iter()
            .filter(|diagnostic| diagnostic.kind == DiagnosticKind::Warning)
            .count()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum CompileStatus {
    Success,
    CompileError,
}

impl CompileStatus {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Success => "success",
            Self::CompileError => "compile_error",
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Toolchain {
    compiler_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Diagnostic {
    kind: DiagnosticKind,
    file: Option<String>,
    line: Option<u64>,
    column: Option<u64>,
    message: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum DiagnosticKind {
    Error,
    Warning,
    Note,
}

pub(crate) fn validate_source(source_path: &Path) -> Result<(), CompileFailure> {
    let has_c_extension = source_path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("c"));

    if !has_c_extension || !source_path.is_file() {
        return Err(CompileFailure::source_not_found());
    }

    Ok(())
}

pub(crate) fn discover_gcc(cached_path: Option<&str>) -> Option<PathBuf> {
    // El toolchain fijado de Lumen va primero, incluso sobre el cache: es el
    // que garantiza paridad con el Code::Blocks de la universidad, y un cache
    // viejo apuntando a MSYS2 no debe impedir adoptarlo.
    find_gcc_in_lumen_toolchains()
        .or_else(|| {
            cached_path
                .map(PathBuf::from)
                .filter(|path| path.is_file())
        })
        .or_else(find_gcc_on_path)
        .or_else(find_gcc_in_msys2)
}

#[cfg(windows)]
fn find_gcc_in_lumen_toolchains() -> Option<PathBuf> {
    let local_app_data = env::var_os("LOCALAPPDATA")?;
    let toolchains = PathBuf::from(local_app_data).join("Lumen").join("toolchains");
    let mut candidates: Vec<PathBuf> = fs::read_dir(&toolchains)
        .ok()?
        .flatten()
        .map(|entry| entry.path().join(r"mingw64\bin\gcc.exe"))
        .filter(|candidate| candidate.is_file())
        .collect();
    // Determinista si conviven varios toolchains: gana el ultimo por nombre
    // (los directorios llevan la version en el nombre).
    candidates.sort();
    candidates.pop()
}

#[cfg(not(windows))]
fn find_gcc_in_lumen_toolchains() -> Option<PathBuf> {
    None
}

pub(crate) fn compiler_version(compiler_path: &Path) -> Option<String> {
    let output = Command::new(compiler_path).arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .lines()
        .next()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
}

pub(crate) fn compile_source(
    source_path: &Path,
    compiler_path: &Path,
) -> Result<CompileResult, CompileFailure> {
    let source_dir = source_path
        .parent()
        .ok_or_else(CompileFailure::source_not_found)?;
    let source_name = source_path
        .file_name()
        .ok_or_else(CompileFailure::source_not_found)?;
    let executable_name = source_path
        .file_stem()
        .ok_or_else(CompileFailure::source_not_found)?;
    let build_dir = source_dir.join(".lumen-build");

    prepare_build_dir(&build_dir)?;
    let executable_path = build_dir.join(executable_name).with_extension("exe");

    let started_at = Instant::now();
    // Flags de paridad con Code::Blocks (target Debug tipico de catedra):
    // -Wall -g, sin -Wextra ni -Werror. Los warnings extra que la uni no ve
    // solo generan ruido distinto al del examen.
    let mut child = Command::new(compiler_path)
        .arg("-Wall")
        .arg("-g")
        .arg(source_name)
        .arg("-o")
        .arg(&executable_path)
        .current_dir(source_dir)
        .env("GCC_COLORS", "")
        .env("LC_ALL", "C")
        .env("LANG", "C")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| {
            CompileFailure::compiler_failed("No se pudo iniciar GCC para compilar el archivo.")
        })?;

    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| CompileFailure::compiler_failed("No se pudo capturar la salida de GCC."))?;
    let stderr_reader = thread::spawn(move || read_all(stderr));

    let status = wait_for_compiler(&mut child)?;
    let duration_ms = elapsed_millis(started_at);
    let stderr_bytes = stderr_reader
        .join()
        .map_err(|_| CompileFailure::compiler_failed("No se pudo leer la salida de GCC."))??;

    if status.code().is_none() {
        return Err(CompileFailure::compiler_failed(
            "GCC termino de forma anomala.",
        ));
    }

    let raw_stderr = String::from_utf8_lossy(&stderr_bytes);
    let diagnostics = parse_diagnostics(&raw_stderr, source_dir);
    let compiler_path = compiler_path.to_string_lossy().into_owned();

    if status.success() {
        Ok(CompileResult {
            status: CompileStatus::Success,
            executable_path: Some(executable_path.to_string_lossy().into_owned()),
            diagnostics,
            raw_output: None,
            duration_ms,
            toolchain: Toolchain { compiler_path },
        })
    } else {
        Ok(CompileResult {
            status: CompileStatus::CompileError,
            executable_path: None,
            diagnostics,
            raw_output: Some(truncate_output(&raw_stderr)),
            duration_ms,
            toolchain: Toolchain { compiler_path },
        })
    }
}

fn prepare_build_dir(build_dir: &Path) -> Result<(), CompileFailure> {
    fs::create_dir_all(build_dir).map_err(|_| CompileFailure::build_dir_error())?;

    let probe_id = WRITE_PROBE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let probe_path = build_dir.join(format!(
        ".lumen-write-probe-{}-{probe_id}",
        std::process::id()
    ));
    let probe = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe_path)
        .map_err(|_| CompileFailure::build_dir_error())?;
    drop(probe);
    fs::remove_file(probe_path).map_err(|_| CompileFailure::build_dir_error())
}

fn wait_for_compiler(child: &mut std::process::Child) -> Result<ExitStatus, CompileFailure> {
    match child.wait_timeout(COMPILE_TIMEOUT) {
        Ok(Some(status)) => Ok(status),
        Ok(None) => {
            let _ = child.kill();
            let _ = child.wait();
            Err(CompileFailure::compiler_failed(
                "GCC supero el limite de 30 segundos y fue detenido.",
            ))
        }
        Err(_) => {
            let _ = child.kill();
            let _ = child.wait();
            Err(CompileFailure::compiler_failed(
                "No se pudo esperar la finalizacion de GCC.",
            ))
        }
    }
}

fn read_all(mut file: impl Read) -> Result<Vec<u8>, CompileFailure> {
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)
        .map_err(|_| CompileFailure::compiler_failed("No se pudo leer la salida de GCC."))?;
    Ok(bytes)
}

fn elapsed_millis(started_at: Instant) -> u64 {
    u64::try_from(started_at.elapsed().as_millis()).unwrap_or(u64::MAX)
}

fn find_gcc_on_path() -> Option<PathBuf> {
    let path = env::var_os("PATH")?;
    let executable_names: &[&str] = if cfg!(windows) {
        &["gcc.exe", "gcc"]
    } else {
        &["gcc", "gcc.exe"]
    };

    env::split_paths(&path)
        .flat_map(|directory| {
            executable_names
                .iter()
                .map(move |name| directory.join(name))
        })
        .find(|candidate| candidate.is_file())
}

#[cfg(windows)]
fn find_gcc_in_msys2() -> Option<PathBuf> {
    [
        PathBuf::from(r"C:\msys64\ucrt64\bin\gcc.exe"),
        PathBuf::from(r"C:\msys64\mingw64\bin\gcc.exe"),
    ]
    .into_iter()
    .find(|candidate| candidate.is_file())
}

#[cfg(not(windows))]
fn find_gcc_in_msys2() -> Option<PathBuf> {
    None
}

fn parse_diagnostics(stderr: &str, source_dir: &Path) -> Vec<Diagnostic> {
    stderr
        .lines()
        .filter_map(|line| parse_diagnostic(line, source_dir))
        .collect()
}

fn parse_diagnostic(line: &str, source_dir: &Path) -> Option<Diagnostic> {
    const KINDS: [(&str, DiagnosticKind); 4] = [
        (": fatal error: ", DiagnosticKind::Error),
        (": error: ", DiagnosticKind::Error),
        (": warning: ", DiagnosticKind::Warning),
        (": note: ", DiagnosticKind::Note),
    ];

    let (location, message, kind) = KINDS.iter().find_map(|(marker, kind)| {
        line.rsplit_once(*marker)
            .map(|(location, message)| (location, message, *kind))
    })?;
    let message = message.trim();
    if message.is_empty() {
        return None;
    }

    let (file, line_number, column) = parse_location(location)?;
    Some(Diagnostic {
        kind,
        file: Some(relative_file(file, source_dir)),
        line: Some(line_number),
        column,
        message: message.to_owned(),
    })
}

fn parse_location(location: &str) -> Option<(&str, u64, Option<u64>)> {
    let (before_last, last) = location.rsplit_once(':')?;
    let last_number = last.parse::<u64>().ok()?;

    if let Some((file, line)) = before_last.rsplit_once(':') {
        if let Ok(line_number) = line.parse::<u64>() {
            return Some((file, line_number, Some(last_number)));
        }
    }

    Some((before_last, last_number, None))
}

fn relative_file(file: &str, source_dir: &Path) -> String {
    let path = Path::new(file);
    path.strip_prefix(source_dir)
        .unwrap_or(path)
        .to_string_lossy()
        .into_owned()
}

fn truncate_output(output: &str) -> String {
    if output.len() <= RAW_OUTPUT_LIMIT {
        return output.to_owned();
    }

    let mut end = RAW_OUTPUT_LIMIT;
    while !output.is_char_boundary(end) {
        end -= 1;
    }
    output[..end].to_owned()
}

#[cfg(test)]
mod tests {
    use super::{parse_diagnostics, truncate_output, DiagnosticKind, RAW_OUTPUT_LIMIT};
    use std::path::Path;

    #[test]
    fn parses_windows_paths_and_optional_columns() {
        let diagnostics = parse_diagnostics(
            "C:\\work\\main.c:3:7: error: expected expression\nmain.c:8: warning: unused variable",
            Path::new(r"C:\work"),
        );

        assert_eq!(diagnostics.len(), 2);
        assert_eq!(diagnostics[0].kind, DiagnosticKind::Error);
        assert_eq!(diagnostics[0].line, Some(3));
        assert_eq!(diagnostics[0].column, Some(7));
        assert_eq!(diagnostics[1].kind, DiagnosticKind::Warning);
        assert_eq!(diagnostics[1].line, Some(8));
        assert_eq!(diagnostics[1].column, None);
    }

    #[test]
    fn truncates_at_a_utf8_boundary() {
        let output = format!("{}é", "a".repeat(RAW_OUTPUT_LIMIT - 1));
        let truncated = truncate_output(&output);
        assert!(truncated.len() <= RAW_OUTPUT_LIMIT);
        assert!(truncated.is_char_boundary(truncated.len()));
    }
}
