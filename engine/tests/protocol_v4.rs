use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use lumen_engine::esex::build_esex;
use rusqlite::Connection;
use serde_json::{json, Value};

const REAL_ACTIVITY: &str = "../content/activities/c.strings.count-lowercase-01";
const CONTENT_FILES: [&str; 4] = [
    "statement.md",
    "starter/main.c",
    "tests/io-cases.json",
    "hints/hints.es.json",
];
const CORRECT_SOURCE: &str = r#"#include <stdio.h>
int main(void) {
    char line[1024];
    if (fgets(line, sizeof line, stdin) == NULL) { puts("0"); return 0; }
    int count = 0;
    for (int i = 0; line[i] != '\0'; ++i) {
        if (line[i] >= 'a' && line[i] <= 'z') ++count;
    }
    printf("%d\n", count);
    return 0;
}
"#;
const WRONG_SOURCE: &str = r#"#include <stdio.h>
int main(void) { puts("999"); return 0; }
"#;
const INVALID_SOURCE: &str = "int main(void) { return 0 }\n";
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
            "lumen-protocol-v4-{label}-{}-{timestamp}-{counter}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("test directory should be created");
        Self { path }
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
        stdin.flush().expect("request should flush");
        let mut response = String::new();
        self.stdout
            .read_line(&mut response)
            .expect("response should be read");
        assert!(!response.is_empty(), "engine exited without response");
        serde_json::from_str(&response).expect("response should be JSON")
    }

    fn shutdown(&mut self) {
        self.stdin.take();
        let status = self.child.wait().expect("engine should stop after EOF");
        assert!(status.success());
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
    match Command::new("gcc").arg("--version").output() {
        Ok(output) if output.status.success() => true,
        _ => {
            eprintln!("skipping {test_name}: gcc is not available");
            false
        }
    }
}

fn real_activity_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join(REAL_ACTIVITY)
}

fn package(work: &TestDirectory, label: &str) -> PathBuf {
    let activity_dir = work.path.join(format!("activity-{label}"));
    for relative in CONTENT_FILES {
        let destination = activity_dir.join(relative);
        fs::create_dir_all(destination.parent().expect("content should have parent"))
            .expect("content parent should be created");
        fs::copy(real_activity_dir().join(relative), destination).expect("content should copy");
    }
    fs::copy(
        real_activity_dir().join("manifest.json"),
        activity_dir.join("manifest.json"),
    )
    .expect("manifest should copy");
    let package_path = work.path.join(format!("{label}.esex"));
    build_esex(&activity_dir, &package_path).expect("package should build");
    package_path
}

fn install_active(engine: &mut RunningEngine, package_path: &Path) -> PathBuf {
    let imported = engine.request(json!({
        "id": "import",
        "method": "exercise.import",
        "params": { "esexPath": package_path }
    }));
    assert_eq!(imported["ok"], true);
    let saved = engine.request(json!({
        "id": "activate",
        "method": "session.saveLastState",
        "params": {
            "lastMode": "route",
            "lastExerciseId": "c.strings.count-lowercase-01"
        }
    }));
    assert_eq!(saved["ok"], true);
    PathBuf::from(
        imported["result"]["installPath"]
            .as_str()
            .expect("installPath should be a string"),
    )
}

fn run_tests(engine: &mut RunningEngine, id: &str) -> Value {
    engine.request(json!({
        "id": id,
        "method": "exercise.runTests",
        "params": {}
    }))
}

#[test]
fn passed_runs_are_persisted_once_as_progress_and_failed_runs_do_not_regress() {
    if !require_gcc("passed_runs_are_persisted_once_as_progress_and_failed_runs_do_not_regress") {
        return;
    }
    let work = TestDirectory::new("progress");
    let package_path = package(&work, "progress");
    let mut engine = RunningEngine::start(&work.data_dir());

    let health = engine.request(json!({ "id": "health", "method": "engine.healthCheck" }));
    assert_eq!(health["result"]["protocolVersion"], 6);
    let install_path = install_active(&mut engine, &package_path);
    let source_path = install_path.join("starter/main.c");
    fs::write(&source_path, CORRECT_SOURCE).expect("correct solution should write");

    let first = run_tests(&mut engine, "first");
    assert_eq!(first["ok"], true);
    assert_eq!(first["result"]["status"], "passed");
    assert_eq!(
        first["result"]["casesPassed"],
        first["result"]["casesTotal"]
    );
    assert_eq!(first["result"]["completed"], true);
    assert_eq!(first["result"]["newlyCompleted"], true);
    assert_eq!(first["result"]["groups"][0]["phase"], "public");
    assert!(first["result"]["groups"][0]["cases"][0]["expected"].is_string());
    assert!(first["result"]["groups"][0]["cases"][0]["observed"].is_string());

    let second = run_tests(&mut engine, "second");
    assert_eq!(second["result"]["status"], "passed");
    assert_eq!(second["result"]["completed"], true);
    assert_eq!(second["result"]["newlyCompleted"], false);

    fs::write(&source_path, WRONG_SOURCE).expect("wrong solution should write");
    let failed = run_tests(&mut engine, "failed");
    assert_eq!(failed["result"]["status"], "failed");
    assert_eq!(failed["result"]["completed"], true);
    assert_eq!(failed["result"]["newlyCompleted"], false);
    let public_case = &failed["result"]["groups"][0]["cases"][0];
    assert!(public_case.get("stdinPreview").is_some());
    assert!(public_case.get("expected").is_some());
    assert!(public_case.get("observed").is_some());
    let private_case = &failed["result"]["groups"][1]["cases"][0];
    assert!(private_case.get("stdinPreview").is_none());
    assert!(private_case.get("expected").is_none());
    assert!(private_case.get("observed").is_none());

    let snapshot = engine.request(json!({
        "id": "snapshot",
        "method": "route.getModuleSnapshot",
        "params": { "routeId": "c", "moduleId": "strings" }
    }));
    assert_eq!(
        snapshot["result"]["snapshot"]["activeExerciseId"],
        Value::Null
    );
    assert_eq!(
        snapshot["result"]["snapshot"]["nodes"][0]["status"],
        "completed"
    );
    engine.shutdown();

    let connection = Connection::open(work.data_dir().join("lumen.db")).expect("database");
    let schema_version: i64 = connection
        .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .expect("schema version");
    assert_eq!(schema_version, 5);
    let attempts: Vec<String> = connection
        .prepare("SELECT status FROM exercise_attempts ORDER BY id")
        .expect("attempt query")
        .query_map([], |row| row.get(0))
        .expect("attempt rows")
        .collect::<Result<_, _>>()
        .expect("attempt statuses");
    assert_eq!(attempts, vec!["passed", "passed", "failed"]);
    let progress: (String, i64) = connection
        .query_row(
            "SELECT completed_version, attempts_before_completion
             FROM exercise_progress WHERE activity_id = 'c.strings.count-lowercase-01'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("progress row");
    assert_eq!(progress, ("1.0.0".to_owned(), 1));
}

#[test]
fn compile_errors_are_results_and_are_recorded() {
    if !require_gcc("compile_errors_are_results_and_are_recorded") {
        return;
    }
    let work = TestDirectory::new("compile-error");
    let package_path = package(&work, "compile-error");
    let mut engine = RunningEngine::start(&work.data_dir());
    let install_path = install_active(&mut engine, &package_path);
    fs::write(install_path.join("starter/main.c"), INVALID_SOURCE)
        .expect("invalid source should write");

    let response = run_tests(&mut engine, "compile-error");
    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["status"], "compile_error");
    assert!(response["result"]["diagnostics"].is_array());
    assert!(response["result"]["rawOutput"].is_string());
    assert!(response["result"]["durationMs"].is_u64());
    assert!(response["result"].get("toolchain").is_none());
    assert!(response["result"].get("executablePath").is_none());
    engine.shutdown();

    let connection = Connection::open(work.data_dir().join("lumen.db")).expect("database");
    let attempt: (String, i64, i64) = connection
        .query_row(
            "SELECT status, cases_passed, cases_total FROM exercise_attempts",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .expect("compile attempt");
    assert_eq!(attempt, ("compile_error".to_owned(), 0, 0));
}

#[test]
fn no_active_exercise_and_non_empty_params_are_rejected() {
    let work = TestDirectory::new("params");
    let mut engine = RunningEngine::start(&work.data_dir());
    let none = run_tests(&mut engine, "none");
    assert_eq!(none["ok"], false);
    assert_eq!(none["error"]["code"], "NO_ACTIVE_EXERCISE");

    let saved = engine.request(json!({
        "id": "missing-state",
        "method": "session.saveLastState",
        "params": { "lastExerciseId": "c.missing-01" }
    }));
    assert_eq!(saved["ok"], true);
    let missing = run_tests(&mut engine, "missing");
    assert_eq!(missing["error"]["code"], "NO_ACTIVE_EXERCISE");
    assert_eq!(missing["error"]["details"][0]["path"], "c.missing-01");

    let invalid = engine.request(json!({
        "id": "invalid",
        "method": "exercise.runTests",
        "params": { "extra": true }
    }));
    assert_eq!(invalid["ok"], false);
    assert_eq!(invalid["error"]["code"], "INVALID_PARAMS");
    engine.shutdown();
}

#[test]
fn corrupt_io_cases_return_structured_tests_invalid() {
    if !require_gcc("corrupt_io_cases_return_structured_tests_invalid") {
        return;
    }
    let work = TestDirectory::new("invalid-tests");
    let package_path = package(&work, "invalid-tests");
    let mut engine = RunningEngine::start(&work.data_dir());
    let install_path = install_active(&mut engine, &package_path);
    fs::write(install_path.join("starter/main.c"), CORRECT_SOURCE)
        .expect("correct source should write");
    fs::write(install_path.join("tests/io-cases.json"), "{not-json")
        .expect("corrupt cases should write");

    let response = run_tests(&mut engine, "invalid-tests");
    assert_eq!(response["ok"], false);
    assert_eq!(response["error"]["code"], "TESTS_INVALID");
    assert_eq!(response["error"]["details"][0]["code"], "INVALID_JSON");
    assert!(response["error"]["details"][0]["path"].is_string());
    assert!(response["error"]["details"][0]["message"].is_string());
    engine.shutdown();
}
