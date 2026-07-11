use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;
use serde_json::{json, Value};

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

struct TestDirectory {
    path: PathBuf,
}

impl TestDirectory {
    fn new(label: &str) -> Self {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "lumen-engine-v2-{label}-{}-{timestamp}-{counter}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("test directory should be created");
        Self { path }
    }

    fn path(&self) -> &Path {
        &self.path
    }

    fn source(&self, contents: &str) -> PathBuf {
        let source_path = self.path.join("exercise").join("main.c");
        fs::create_dir_all(source_path.parent().expect("source should have parent"))
            .expect("exercise directory should be created");
        fs::write(&source_path, contents).expect("source should be written");
        source_path
    }

    fn data_dir(&self) -> PathBuf {
        self.path.join("data")
    }
}

impl Drop for TestDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

struct RunningEngine {
    child: Child,
    stdin: Option<ChildStdin>,
    stdout: BufReader<ChildStdout>,
}

impl RunningEngine {
    fn start(data_dir: &Path) -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_lumen-engine"))
            .arg("--data-dir")
            .arg(data_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("lumen-engine should start");
        let stdin = child.stdin.take().expect("child stdin should be piped");
        let stdout = child.stdout.take().expect("child stdout should be piped");

        Self {
            child,
            stdin: Some(stdin),
            stdout: BufReader::new(stdout),
        }
    }

    fn request(&mut self, request: Value) -> Value {
        let stdin = self.stdin.as_mut().expect("engine stdin should be open");
        serde_json::to_writer(&mut *stdin, &request).expect("request should serialize");
        stdin.write_all(b"\n").expect("newline should be written");
        stdin.flush().expect("request should be flushed");

        let mut response = String::new();
        self.stdout
            .read_line(&mut response)
            .expect("response should be read");
        assert!(!response.is_empty(), "engine exited without a response");
        serde_json::from_str(&response).expect("response should be JSON")
    }

    fn shutdown(&mut self) {
        self.stdin.take();
        let status = self.child.wait().expect("engine should exit after EOF");
        assert!(
            status.success(),
            "engine should exit successfully after EOF"
        );
    }
}

impl Drop for RunningEngine {
    fn drop(&mut self) {
        self.stdin.take();
        if let Ok(None) = self.child.try_wait() {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }
    }
}

fn require_gcc(test_name: &str) -> bool {
    let available = Command::new("gcc")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success());

    if !available {
        eprintln!("Skipping {test_name}: GCC is not available on PATH");
    }
    available
}

fn compile_request(id: &str, source_path: &Path) -> Value {
    json!({
        "id": id,
        "method": "exercise.compile",
        "params": { "sourcePath": source_path.to_string_lossy() }
    })
}

#[test]
fn migration_two_creates_compile_attempts() {
    let directory = TestDirectory::new("migration");
    let mut engine = RunningEngine::start(&directory.data_dir());
    let health = engine.request(json!({ "id": "health", "method": "engine.healthCheck" }));
    assert_eq!(health["result"]["protocolVersion"], 3);
    assert_eq!(health["result"]["dbStatus"], "ready");
    engine.shutdown();

    let connection = Connection::open(directory.data_dir().join("lumen.db"))
        .expect("migrated database should open");
    let max_version: i64 = connection
        .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .expect("schema version should exist");
    assert_eq!(max_version, 3);

    let mut columns = connection
        .prepare("PRAGMA table_info(compile_attempts)")
        .expect("table_info should prepare");
    let column_names: Vec<String> = columns
        .query_map([], |row| row.get(1))
        .expect("table_info should run")
        .collect::<Result<_, _>>()
        .expect("column names should decode");
    assert_eq!(
        column_names,
        vec![
            "id",
            "source_path",
            "mode",
            "status",
            "error_count",
            "warning_count",
            "duration_ms",
            "compiler_path",
            "created_at"
        ]
    );
}

#[test]
fn compile_rejects_invalid_source_path_params() {
    let directory = TestDirectory::new("invalid-params");
    let mut engine = RunningEngine::start(&directory.data_dir());
    let invalid_params = [
        json!({}),
        json!({ "sourcePath": null }),
        json!({ "sourcePath": "" }),
        json!({ "sourcePath": "main.c" }),
        json!({ "sourcePath": directory.path(), "extra": true }),
    ];

    for (index, params) in invalid_params.into_iter().enumerate() {
        let response = engine.request(json!({
            "id": format!("invalid-{index}"),
            "method": "exercise.compile",
            "params": params
        }));
        assert_eq!(response["ok"], false);
        assert_eq!(response["error"]["code"], "INVALID_PARAMS");
        assert_eq!(response["error"]["recoverable"], true);
    }
    engine.shutdown();
}

#[test]
fn compile_reports_source_not_found_for_missing_or_non_c_files() {
    let directory = TestDirectory::new("missing-source");
    let text_path = directory.path().join("exercise.txt");
    fs::write(&text_path, "not c").expect("text file should be written");
    let missing_path = directory.path().join("missing.c");
    let mut engine = RunningEngine::start(&directory.data_dir());

    for (id, source_path) in [("missing", missing_path), ("not-c", text_path)] {
        let response = engine.request(compile_request(id, &source_path));
        assert_eq!(response["ok"], false);
        assert_eq!(response["error"]["code"], "SOURCE_NOT_FOUND");
        assert_eq!(response["error"]["recoverable"], true);
    }
    engine.shutdown();
}

#[test]
fn compiles_a_trivial_main() {
    if !require_gcc("compiles_a_trivial_main") {
        return;
    }

    let directory = TestDirectory::new("success");
    let source_path = directory.source("int main(void) { return 0; }\n");
    let mut engine = RunningEngine::start(&directory.data_dir());
    let response = engine.request(compile_request("compile-success", &source_path));

    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["status"], "success");
    assert_eq!(response["result"]["diagnostics"], json!([]));
    assert!(response["result"]["durationMs"].is_u64());
    assert!(response["result"]["toolchain"]["compilerPath"].is_string());
    assert!(response["result"].get("rawOutput").is_none());
    let executable = response["result"]["executablePath"]
        .as_str()
        .expect("success should return executablePath");
    assert!(Path::new(executable).is_file());
    assert_eq!(
        Path::new(executable)
            .extension()
            .and_then(|extension| extension.to_str()),
        Some("exe")
    );
    engine.shutdown();
}

#[test]
fn syntax_errors_are_structured_compile_results() {
    if !require_gcc("syntax_errors_are_structured_compile_results") {
        return;
    }

    let directory = TestDirectory::new("compile-error");
    let source_path = directory.source("int main(void) { return 0 }\n");
    let mut engine = RunningEngine::start(&directory.data_dir());
    let response = engine.request(compile_request("compile-error", &source_path));

    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["status"], "compile_error");
    assert_eq!(response["result"]["executablePath"], Value::Null);
    assert!(response["result"]["rawOutput"]
        .as_str()
        .is_some_and(|output| !output.is_empty() && output.len() <= 64 * 1024));
    let diagnostics = response["result"]["diagnostics"]
        .as_array()
        .expect("diagnostics should be an array");
    let error = diagnostics
        .iter()
        .find(|diagnostic| diagnostic["kind"] == "error")
        .expect("syntax error should be parsed");
    assert_eq!(error["file"], "main.c");
    assert!(error["line"].is_u64());
    assert!(error["column"].is_u64());
    assert!(error["message"]
        .as_str()
        .is_some_and(|message| !message.is_empty()));
    engine.shutdown();
}

#[test]
fn warnings_do_not_block_success() {
    if !require_gcc("warnings_do_not_block_success") {
        return;
    }

    let directory = TestDirectory::new("warning");
    let source_path = directory.source("int main(void) { int unused; return 0; }\n");
    let mut engine = RunningEngine::start(&directory.data_dir());
    let response = engine.request(compile_request("compile-warning", &source_path));

    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["status"], "success");
    assert!(response["result"].get("rawOutput").is_none());
    assert!(response["result"]["diagnostics"]
        .as_array()
        .is_some_and(|diagnostics| diagnostics
            .iter()
            .any(|diagnostic| diagnostic["kind"] == "warning")));
    assert!(response["result"]["executablePath"].is_string());
    engine.shutdown();
}

#[test]
fn compilation_is_recorded_with_the_active_mode() {
    if !require_gcc("compilation_is_recorded_with_the_active_mode") {
        return;
    }

    let directory = TestDirectory::new("attempt");
    let source_path = directory.source("int main(void) { return 0; }\n");
    let mut engine = RunningEngine::start(&directory.data_dir());
    let saved = engine.request(json!({
        "id": "save-mode",
        "method": "session.saveLastState",
        "params": { "lastMode": "route" }
    }));
    assert_eq!(saved["ok"], true);
    let compiled = engine.request(compile_request("record-attempt", &source_path));
    assert_eq!(compiled["result"]["status"], "success");
    engine.shutdown();

    let connection =
        Connection::open(directory.data_dir().join("lumen.db")).expect("database should open");
    let attempt: (String, String, String, i64, i64, i64, Option<String>) = connection
        .query_row(
            "SELECT source_path, mode, status, error_count, warning_count,
                    duration_ms, compiler_path
             FROM compile_attempts",
            [],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                ))
            },
        )
        .expect("compile attempt should be recorded");
    assert_eq!(attempt.0, source_path.to_string_lossy().as_ref());
    assert_eq!(attempt.1, "route");
    assert_eq!(attempt.2, "success");
    assert_eq!(attempt.3, 0);
    assert_eq!(attempt.4, 0);
    assert!(attempt.5 >= 0);
    assert!(attempt.6.is_some_and(|path| !path.is_empty()));
}

#[test]
fn toolchain_check_returns_ready_or_missing_without_an_error() {
    let directory = TestDirectory::new("toolchain-check");
    let mut engine = RunningEngine::start(&directory.data_dir());
    let response = engine.request(json!({
        "id": "toolchain",
        "method": "toolchain.check",
        "params": {}
    }));

    assert_eq!(response["ok"], true);
    match response["result"]["status"].as_str() {
        Some("ready") => {
            assert!(response["result"]["compilerPath"].is_string());
            assert!(response["result"]["compilerVersion"]
                .as_str()
                .is_some_and(|version| !version.is_empty() && !version.contains('\n')));
            assert!(response["result"].get("hint").is_none());
        }
        Some("missing") => {
            assert_eq!(response["result"]["compilerPath"], Value::Null);
            assert_eq!(response["result"]["compilerVersion"], Value::Null);
            assert!(response["result"]["hint"]
                .as_str()
                .is_some_and(|hint| !hint.is_empty()));
        }
        status => panic!("unexpected toolchain status: {status:?}"),
    }
    engine.shutdown();
}
