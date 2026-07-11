use std::collections::{HashMap, HashSet};
use std::io::{self, Read, Write};
use std::path::Path;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, Instant};

use jsonschema::{Draft, JSONSchema};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use wait_timeout::ChildExt;

const IO_CASES_SCHEMA_JSON: &str = include_str!("../../contracts/io-test-cases.v1.schema.json");

const SCHEMA_VIOLATION: &str = "SCHEMA_VIOLATION";
const INVALID_JSON: &str = "INVALID_JSON";
const DUPLICATE_CASE_ID: &str = "DUPLICATE_CASE_ID";
const UNKNOWN_TEST_GROUP: &str = "UNKNOWN_TEST_GROUP";
const EMPTY_TEST_GROUP: &str = "EMPTY_TEST_GROUP";
const TIMEOUT_EXCEEDS_LIMIT: &str = "TIMEOUT_EXCEEDS_LIMIT";

static IO_CASES_SCHEMA: OnceLock<Result<JSONSchema, String>> = OnceLock::new();

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TestingError {
    pub code: String,
    pub path: String,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IoCases {
    pub format_version: u64,
    pub cases: Vec<IoCase>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IoCase {
    pub id: String,
    pub group: String,
    pub stdin: String,
    pub expected_stdout: String,
    pub timeout_ms: Option<u64>,
    pub weight: Option<f64>,
}

#[derive(Debug, Clone)]
pub struct RunOptions {
    pub normalization: Vec<String>,
    pub default_timeout_ms: u64,
    pub output_limit_kb: usize,
    pub expected_exit_code: Option<i64>,
}

impl Default for RunOptions {
    fn default() -> Self {
        Self {
            normalization: Vec::new(),
            default_timeout_ms: 2_000,
            output_limit_kb: 256,
            expected_exit_code: Some(0),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum IoCaseStatus {
    Passed,
    Failed,
    Timeout,
    RuntimeError,
    Inconclusive,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IoCaseResult {
    pub id: String,
    pub group: String,
    pub status: IoCaseStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected_stdout_normalized: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual_stdout_normalized: Option<String>,
    pub exit_code: Option<i64>,
    pub duration_ms: u64,
    pub output_truncated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IoGroupResult {
    pub id: String,
    pub total: usize,
    pub passed: usize,
    pub all_passed: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IoTestRun {
    pub results: Vec<IoCaseResult>,
    pub passed_count: usize,
    pub failed_count: usize,
    pub group_results: Vec<IoGroupResult>,
    pub overall_passed: bool,
}

pub fn validate_io_cases(cases_json: &str, manifest: &Value) -> Result<IoCases, Vec<TestingError>> {
    let value: Value = match serde_json::from_str(cases_json) {
        Ok(value) => value,
        Err(error) => {
            return Err(vec![TestingError::new(
                INVALID_JSON,
                "",
                format!("El archivo de casos no contiene JSON válido: {error}"),
            )]);
        }
    };

    let mut errors = Vec::new();
    validate_schema(&value, &mut errors);
    if !errors.is_empty() {
        return Err(errors);
    }

    let cases: IoCases = match serde_json::from_value(value) {
        Ok(cases) => cases,
        Err(error) => {
            return Err(vec![TestingError::new(
                SCHEMA_VIOLATION,
                "",
                format!("No se pudo interpretar el archivo de casos: {error}"),
            )]);
        }
    };

    validate_invariants(&cases, manifest, &mut errors);
    if errors.is_empty() {
        Ok(cases)
    } else {
        Err(errors)
    }
}

pub fn run_io_tests(binary: &Path, cases: &IoCases, options: &RunOptions) -> IoTestRun {
    let results: Vec<_> = cases
        .cases
        .iter()
        .map(|case| run_io_case(binary, case, options))
        .collect();
    let passed_count = results
        .iter()
        .filter(|result| result.status == IoCaseStatus::Passed)
        .count();
    let failed_count = results.len().saturating_sub(passed_count);
    let group_results = summarize_groups(&results);

    IoTestRun {
        overall_passed: passed_count == results.len(),
        results,
        passed_count,
        failed_count,
        group_results,
    }
}

impl TestingError {
    fn new(code: &str, path: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.to_owned(),
            path: path.into(),
            message: message.into(),
        }
    }
}

fn validate_schema(value: &Value, errors: &mut Vec<TestingError>) {
    match compiled_schema() {
        Ok(schema) => {
            if let Err(schema_errors) = schema.validate(value) {
                for error in schema_errors {
                    errors.push(TestingError::new(
                        SCHEMA_VIOLATION,
                        error.instance_path.to_string(),
                        format!("El archivo de casos no cumple el schema: {error}"),
                    ));
                }
            }
        }
        Err(message) => errors.push(TestingError::new(
            SCHEMA_VIOLATION,
            "",
            format!("No se pudo cargar el schema de casos IO: {message}"),
        )),
    }
}

fn compiled_schema() -> Result<&'static JSONSchema, String> {
    match IO_CASES_SCHEMA.get_or_init(|| {
        let schema: Value = serde_json::from_str(IO_CASES_SCHEMA_JSON)
            .map_err(|error| format!("JSON de schema inválido: {error}"))?;
        JSONSchema::options()
            .with_draft(Draft::Draft202012)
            .compile(&schema)
            .map_err(|error| error.to_string())
    }) {
        Ok(schema) => Ok(schema),
        Err(message) => Err(message.clone()),
    }
}

fn validate_invariants(cases: &IoCases, manifest: &Value, errors: &mut Vec<TestingError>) {
    let mut seen_ids = HashSet::new();
    for (index, case) in cases.cases.iter().enumerate() {
        if !seen_ids.insert(case.id.as_str()) {
            errors.push(TestingError::new(
                DUPLICATE_CASE_ID,
                format!("/cases/{index}/id"),
                format!("El id de caso '{}' está repetido.", case.id),
            ));
        }
    }

    let manifest_groups = manifest
        .pointer("/testContract/testGroups")
        .and_then(Value::as_array);
    let known_groups: HashSet<&str> = manifest_groups
        .into_iter()
        .flatten()
        .filter_map(|group| group.get("id").and_then(Value::as_str))
        .collect();

    for (index, case) in cases.cases.iter().enumerate() {
        if !known_groups.contains(case.group.as_str()) {
            errors.push(TestingError::new(
                UNKNOWN_TEST_GROUP,
                format!("/cases/{index}/group"),
                format!(
                    "El grupo '{}' no existe en testContract.testGroups.",
                    case.group
                ),
            ));
        }
    }

    if let Some(groups) = manifest_groups {
        for (index, group) in groups.iter().enumerate() {
            let phase = group.get("phase").and_then(Value::as_str);
            let id = group.get("id").and_then(Value::as_str);
            let required_group = match (phase, id) {
                (Some("public" | "local-private"), Some(id)) => Some(id),
                _ => None,
            };
            if let Some(id) = required_group {
                if !cases.cases.iter().any(|case| case.group == id) {
                    errors.push(TestingError::new(
                        EMPTY_TEST_GROUP,
                        format!("/testContract/testGroups/{index}"),
                        format!("El grupo '{id}' debe tener al menos un caso."),
                    ));
                }
            }
        }
    }

    if let Some(limit) = manifest
        .pointer("/testContract/limits/timeLimitMs")
        .and_then(Value::as_u64)
    {
        for (index, case) in cases.cases.iter().enumerate() {
            if case.timeout_ms.is_some_and(|timeout| timeout > limit) {
                errors.push(TestingError::new(
                    TIMEOUT_EXCEEDS_LIMIT,
                    format!("/cases/{index}/timeoutMs"),
                    format!("El timeout del caso no puede superar el límite de {limit} ms."),
                ));
            }
        }
    }
}

fn run_io_case(binary: &Path, case: &IoCase, options: &RunOptions) -> IoCaseResult {
    if let Some(normalization) = options
        .normalization
        .iter()
        .find(|name| !is_supported_normalization(name))
    {
        return IoCaseResult {
            id: case.id.clone(),
            group: case.group.clone(),
            status: IoCaseStatus::Inconclusive,
            expected_stdout_normalized: None,
            actual_stdout_normalized: None,
            exit_code: None,
            duration_ms: 0,
            output_truncated: false,
            message: Some(format!(
                "La normalización '{normalization}' no está soportada."
            )),
        };
    }

    let expected_normalized =
        apply_normalizations(case.expected_stdout.clone(), &options.normalization);

    let started_at = Instant::now();
    let mut command = Command::new(binary);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(directory) = binary.parent().filter(|path| !path.as_os_str().is_empty()) {
        command.current_dir(directory);
    }

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            return runtime_error_result(
                case,
                elapsed_millis(started_at),
                None,
                false,
                None,
                expected_normalized.clone(),
                format!("No se pudo iniciar el programa: {error}"),
            );
        }
    };

    let stdin = child.stdin.take();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let (Some(mut stdin), Some(stdout), Some(stderr)) = (stdin, stdout, stderr) else {
        terminate_and_wait(&mut child);
        return runtime_error_result(
            case,
            elapsed_millis(started_at),
            None,
            false,
            None,
            expected_normalized.clone(),
            "No se pudieron preparar los canales de entrada y salida.".to_owned(),
        );
    };

    let input = case.stdin.as_bytes().to_vec();
    let stdin_writer = thread::spawn(move || stdin.write_all(&input));
    let output_limit = options.output_limit_kb.saturating_mul(1024);
    let stdout_reader = thread::spawn(move || read_limited(stdout, output_limit));
    let stderr_reader = thread::spawn(move || read_limited(stderr, output_limit));

    let timeout = Duration::from_millis(case.timeout_ms.unwrap_or(options.default_timeout_ms));
    let wait_outcome = wait_for_case(&mut child, timeout);
    let duration_ms = elapsed_millis(started_at);

    let _stdin_result = stdin_writer.join();
    let stdout_capture = join_capture(stdout_reader);
    let stderr_capture = join_capture(stderr_reader);

    let (stdout_capture, stderr_capture) = match (stdout_capture, stderr_capture) {
        (Ok(stdout_capture), Ok(stderr_capture)) => (stdout_capture, stderr_capture),
        (stdout_result, stderr_result) => {
            let message = stdout_result
                .err()
                .or_else(|| stderr_result.err())
                .unwrap_or_else(|| "No se pudo capturar la salida del programa.".to_owned());
            return runtime_error_result(
                case,
                duration_ms,
                wait_outcome.exit_code(),
                false,
                None,
                expected_normalized.clone(),
                message,
            );
        }
    };

    let actual = String::from_utf8_lossy(&stdout_capture.bytes).into_owned();
    let stderr = String::from_utf8_lossy(&stderr_capture.bytes);
    let actual_normalized = apply_normalizations(actual, &options.normalization);

    match wait_outcome {
        WaitOutcome::TimedOut => IoCaseResult {
            id: case.id.clone(),
            group: case.group.clone(),
            status: IoCaseStatus::Timeout,
            expected_stdout_normalized: Some(expected_normalized),
            actual_stdout_normalized: Some(actual_normalized),
            exit_code: None,
            duration_ms,
            output_truncated: stdout_capture.truncated,
            message: Some("El programa superó el tiempo límite y fue detenido.".to_owned()),
        },
        WaitOutcome::WaitFailed(message) => runtime_error_result(
            case,
            duration_ms,
            None,
            stdout_capture.truncated,
            Some(actual_normalized),
            expected_normalized,
            message,
        ),
        WaitOutcome::Exited(status) if is_crash_status(&status) => {
            let detail = if stderr.is_empty() {
                "El programa terminó de forma anómala.".to_owned()
            } else {
                format!("El programa terminó de forma anómala: {stderr}")
            };
            runtime_error_result(
                case,
                duration_ms,
                status.code().map(i64::from),
                stdout_capture.truncated,
                Some(actual_normalized),
                expected_normalized,
                detail,
            )
        }
        WaitOutcome::Exited(status) => {
            let exit_code = status.code().map(i64::from);
            let exit_matches = match options.expected_exit_code {
                Some(expected) => exit_code == Some(expected),
                None => true,
            };
            let passed = !stdout_capture.truncated
                && exit_matches
                && actual_normalized == expected_normalized;

            IoCaseResult {
                id: case.id.clone(),
                group: case.group.clone(),
                status: if passed {
                    IoCaseStatus::Passed
                } else {
                    IoCaseStatus::Failed
                },
                expected_stdout_normalized: Some(expected_normalized),
                actual_stdout_normalized: Some(actual_normalized),
                exit_code,
                duration_ms,
                output_truncated: stdout_capture.truncated,
                message: None,
            }
        }
    }
}

fn runtime_error_result(
    case: &IoCase,
    duration_ms: u64,
    exit_code: Option<i64>,
    output_truncated: bool,
    actual_stdout_normalized: Option<String>,
    expected_stdout_normalized: String,
    message: String,
) -> IoCaseResult {
    IoCaseResult {
        id: case.id.clone(),
        group: case.group.clone(),
        status: IoCaseStatus::RuntimeError,
        expected_stdout_normalized: Some(expected_stdout_normalized),
        actual_stdout_normalized,
        exit_code,
        duration_ms,
        output_truncated,
        message: Some(message),
    }
}

fn summarize_groups(results: &[IoCaseResult]) -> Vec<IoGroupResult> {
    let mut indexes = HashMap::new();
    let mut groups: Vec<IoGroupResult> = Vec::new();

    for result in results {
        let index = match indexes.get(&result.group) {
            Some(index) => *index,
            None => {
                let index = groups.len();
                indexes.insert(result.group.clone(), index);
                groups.push(IoGroupResult {
                    id: result.group.clone(),
                    total: 0,
                    passed: 0,
                    all_passed: true,
                });
                index
            }
        };
        if let Some(group) = groups.get_mut(index) {
            group.total += 1;
            if result.status == IoCaseStatus::Passed {
                group.passed += 1;
            } else {
                group.all_passed = false;
            }
        }
    }

    groups
}

fn is_supported_normalization(name: &str) -> bool {
    matches!(name, "crlf-to-lf" | "trim-final-newline")
}

fn apply_normalizations(mut text: String, normalizations: &[String]) -> String {
    for normalization in normalizations {
        match normalization.as_str() {
            "crlf-to-lf" => text = text.replace("\r\n", "\n"),
            "trim-final-newline" => {
                if text.ends_with('\n') {
                    text.pop();
                }
            }
            _ => {}
        }
    }
    text
}

struct CapturedOutput {
    bytes: Vec<u8>,
    truncated: bool,
}

fn read_limited(mut reader: impl Read, limit: usize) -> io::Result<CapturedOutput> {
    let mut bytes = Vec::with_capacity(limit.min(8 * 1024));
    let mut truncated = false;
    let mut buffer = [0_u8; 8 * 1024];

    loop {
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        let remaining = limit.saturating_sub(bytes.len());
        let retained = remaining.min(read);
        bytes.extend_from_slice(&buffer[..retained]);
        truncated |= retained < read;
    }

    Ok(CapturedOutput { bytes, truncated })
}

fn join_capture(
    reader: thread::JoinHandle<io::Result<CapturedOutput>>,
) -> Result<CapturedOutput, String> {
    match reader.join() {
        Ok(Ok(capture)) => Ok(capture),
        Ok(Err(error)) => Err(format!("No se pudo leer la salida del programa: {error}")),
        Err(_) => Err("Falló el lector de salida del programa.".to_owned()),
    }
}

enum WaitOutcome {
    Exited(ExitStatus),
    TimedOut,
    WaitFailed(String),
}

impl WaitOutcome {
    fn exit_code(&self) -> Option<i64> {
        match self {
            Self::Exited(status) => status.code().map(i64::from),
            Self::TimedOut | Self::WaitFailed(_) => None,
        }
    }
}

fn wait_for_case(child: &mut Child, timeout: Duration) -> WaitOutcome {
    match child.wait_timeout(timeout) {
        Ok(Some(status)) => WaitOutcome::Exited(status),
        Ok(None) => {
            terminate_and_wait(child);
            WaitOutcome::TimedOut
        }
        Err(error) => {
            terminate_and_wait(child);
            WaitOutcome::WaitFailed(format!(
                "No se pudo esperar la finalización del programa: {error}"
            ))
        }
    }
}

fn terminate_and_wait(child: &mut Child) {
    let _kill_result = child.kill();
    let _wait_result = child.wait();
}

fn is_crash_status(status: &ExitStatus) -> bool {
    match status.code() {
        None => true,
        Some(code) => is_windows_crash_code(code),
    }
}

#[cfg(windows)]
fn is_windows_crash_code(code: i32) -> bool {
    (code as u32) >= 0xC000_0000
}

#[cfg(not(windows))]
fn is_windows_crash_code(_code: i32) -> bool {
    false
}

fn elapsed_millis(started_at: Instant) -> u64 {
    u64::try_from(started_at.elapsed().as_millis()).unwrap_or(u64::MAX)
}
