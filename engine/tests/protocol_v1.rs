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
            "lumen-engine-{label}-{}-{timestamp}-{counter}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("test data-dir should be created");
        Self { path }
    }

    fn path(&self) -> &Path {
        &self.path
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

    fn request(&mut self, request: &str) -> Value {
        let stdin = self.stdin.as_mut().expect("engine stdin should be open");
        stdin
            .write_all(request.as_bytes())
            .expect("request should be written");
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

#[test]
fn initial_migration_creates_the_v1_schema() {
    let data_dir = TestDirectory::new("migration");
    let mut engine = RunningEngine::start(data_dir.path());

    let health = engine.request(r#"{"id":"health","method":"engine.healthCheck"}"#);
    assert_eq!(health["result"]["dbStatus"], "ready");
    engine.shutdown();

    let connection =
        Connection::open(data_dir.path().join("lumen.db")).expect("migrated database should open");
    let mut statement = connection
        .prepare(
            "SELECT name FROM sqlite_master
             WHERE type = 'table' AND name IN ('schema_migrations', 'user_state', 'settings')
             ORDER BY name",
        )
        .expect("schema query should prepare");
    let tables: Vec<String> = statement
        .query_map([], |row| row.get(0))
        .expect("schema query should run")
        .collect::<Result<_, _>>()
        .expect("table names should decode");
    assert_eq!(tables, vec!["schema_migrations", "settings", "user_state"]);

    let version: i64 = connection
        .query_row("SELECT version FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .expect("migration version should exist");
    assert_eq!(version, 1);

    let mut columns = connection
        .prepare("PRAGMA table_info(user_state)")
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
            "last_mode",
            "last_route_id",
            "last_module_id",
            "last_exercise_id",
            "updated_at"
        ]
    );
}

#[test]
fn empty_database_returns_null_state() {
    let data_dir = TestDirectory::new("empty-state");
    let mut engine = RunningEngine::start(data_dir.path());

    let response = engine.request(r#"{"id":"get-1","method":"session.getLastState"}"#);
    assert_eq!(
        response,
        json!({
            "id": "get-1",
            "ok": true,
            "result": { "state": null }
        })
    );
    engine.shutdown();
}

#[test]
fn save_merges_absent_fields_and_clears_explicit_nulls() {
    let data_dir = TestDirectory::new("merge");
    let mut engine = RunningEngine::start(data_dir.path());

    let first = engine.request(
        r#"{"id":"save-1","method":"session.saveLastState","params":{"lastMode":"route","lastRouteId":"ruta-c","lastModuleId":"modulo-2-cadenas","lastExerciseId":"punteros-01"}}"#,
    );
    assert_eq!(first["result"]["state"]["lastMode"], "route");
    assert_eq!(first["result"]["state"]["lastRouteId"], "ruta-c");
    assert!(first["result"]["state"]["updatedAt"]
        .as_str()
        .is_some_and(|value| value.ends_with('Z')));

    let second = engine.request(
        r#"{"id":"save-2","method":"session.saveLastState","params":{"lastMode":"free","lastRouteId":null}}"#,
    );
    let state = &second["result"]["state"];
    assert_eq!(state["lastMode"], "free");
    assert_eq!(state["lastRouteId"], Value::Null);
    assert_eq!(state["lastModuleId"], "modulo-2-cadenas");
    assert_eq!(state["lastExerciseId"], "punteros-01");

    let get = engine.request(r#"{"id":"get-2","method":"session.getLastState","params":{}}"#);
    assert_eq!(get["result"]["state"], second["result"]["state"]);
    engine.shutdown();
}

#[test]
fn healthy_database_reports_ready_and_protocol_version_four() {
    let data_dir = TestDirectory::new("health");
    let mut engine = RunningEngine::start(data_dir.path());

    let response = engine.request(r#"{"id":"health-1","method":"engine.healthCheck","params":{}}"#);
    assert_eq!(response["id"], "health-1");
    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["protocolVersion"], 4);
    assert_eq!(response["result"]["engineVersion"], "0.1.0");
    assert_eq!(response["result"]["dbStatus"], "ready");
    assert_eq!(
        response["result"]["dbPath"],
        json!(data_dir.path().join("lumen.db").to_string_lossy())
    );
    assert!(response["result"].get("dbError").is_none());
    engine.shutdown();
}

#[test]
fn invalid_and_unknown_requests_do_not_stop_the_process() {
    let data_dir = TestDirectory::new("errors");
    let mut engine = RunningEngine::start(data_dir.path());

    let invalid = engine.request("this is not json");
    assert_eq!(invalid["id"], Value::Null);
    assert_eq!(invalid["ok"], false);
    assert_eq!(invalid["error"]["code"], "INVALID_REQUEST");

    let unknown = engine.request(r#"{"id":"unknown-1","method":"does.notExist"}"#);
    assert_eq!(unknown["id"], "unknown-1");
    assert_eq!(unknown["error"]["code"], "UNKNOWN_METHOD");

    let invalid_params = engine
        .request(r#"{"id":"params-1","method":"session.saveLastState","params":{"lastMode":42}}"#);
    assert_eq!(invalid_params["id"], "params-1");
    assert_eq!(invalid_params["error"]["code"], "INVALID_PARAMS");

    let health = engine.request(r#"{"id":"still-alive","method":"engine.healthCheck"}"#);
    assert_eq!(health["id"], "still-alive");
    assert_eq!(health["ok"], true);
    engine.shutdown();
}

#[test]
fn database_startup_failure_is_reported_without_stopping_the_engine() {
    let parent = TestDirectory::new("db-error");
    let data_dir_file = parent.path().join("not-a-directory");
    fs::write(&data_dir_file, b"file").expect("blocking file should be created");
    let mut engine = RunningEngine::start(&data_dir_file);

    let health = engine.request(r#"{"id":"health-error","method":"engine.healthCheck"}"#);
    assert_eq!(health["ok"], true);
    assert_eq!(health["result"]["dbStatus"], "error");
    assert!(health["result"]["dbError"].is_string());

    let get = engine.request(r#"{"id":"get-error","method":"session.getLastState"}"#);
    assert_eq!(get["id"], "get-error");
    assert_eq!(get["error"]["code"], "DATABASE_ERROR");

    let second_health = engine.request(r#"{"id":"still-running","method":"engine.healthCheck"}"#);
    assert_eq!(second_health["id"], "still-running");
    assert_eq!(second_health["result"]["dbStatus"], "error");
    engine.shutdown();
}
