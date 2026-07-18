use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use lumen_engine::esex::build_esex;
use rusqlite::{params, Connection};
use serde_json::{json, Value};

const LOWERCASE_ACTIVITY: &str = "../content/activities/c.strings.count-lowercase-01";
const VOWELS_ACTIVITY: &str = "../content/activities/c.strings.count-vowels-01";
const LOWERCASE_ID: &str = "c.strings.count-lowercase-01";
const VOWELS_ID: &str = "c.strings.count-vowels-01";
static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

struct TestDirectory(PathBuf);

impl TestDirectory {
    fn new(label: &str) -> Self {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "lumen-protocol-v7-{label}-{}-{timestamp}-{counter}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("test directory should be created");
        Self(path)
    }

    fn data_dir(&self) -> PathBuf {
        self.0.join("data")
    }

    fn install_root(&self) -> PathBuf {
        self.0.join("extension-install")
    }

    fn module_path(&self) -> PathBuf {
        self.install_root()
            .join("content/modules/c/strings/module.json")
    }

    fn write_module(&self, metadata: &Value) {
        let path = self.module_path();
        fs::create_dir_all(path.parent().expect("module path should have parent"))
            .expect("module directory should be created");
        fs::write(
            path,
            serde_json::to_vec_pretty(metadata).expect("metadata should serialize"),
        )
        .expect("module metadata should be written");
    }

    fn write_valid_module(&self) {
        self.write_module(&json!({
            "schemaVersion": 1,
            "routeId": "c",
            "moduleId": "strings",
            "moduleNumber": 2,
            "routeTitle": "Ruta C",
            "title": "Cadenas de caracteres",
            "subtitle": "char, strings y texto"
        }));
    }
}

impl Drop for TestDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

struct RunningEngine {
    child: Child,
    stdin: Option<ChildStdin>,
    stdout: BufReader<ChildStdout>,
}

impl RunningEngine {
    fn start(data_dir: &Path, install_root: &Path) -> Self {
        fs::create_dir_all(install_root).expect("install root should be created");
        let mut child = Command::new(env!("CARGO_BIN_EXE_lumen-engine"))
            .arg("--data-dir")
            .arg(data_dir)
            .current_dir(install_root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("lumen-engine should start");
        let stdin = child.stdin.take().expect("stdin should be piped");
        let stdout = child.stdout.take().expect("stdout should be piped");
        Self {
            child,
            stdin: Some(stdin),
            stdout: BufReader::new(stdout),
        }
    }

    fn request(&mut self, request: Value) -> Value {
        let stdin = self.stdin.as_mut().expect("engine stdin should be open");
        serde_json::to_writer(&mut *stdin, &request).expect("request should serialize");
        stdin.write_all(b"\n").expect("newline should write");
        stdin.flush().expect("request should flush");
        let mut response = String::new();
        self.stdout
            .read_line(&mut response)
            .expect("response should read");
        assert!(!response.is_empty(), "engine exited without response");
        serde_json::from_str(&response).expect("response should be JSON")
    }

    fn shutdown(&mut self) {
        self.stdin.take();
        assert!(self.child.wait().expect("engine should stop").success());
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

fn activity_dir(relative: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join(relative)
}

fn package(work: &TestDirectory, relative: &str, name: &str) -> PathBuf {
    let output = work.0.join(format!("{name}.esex"));
    build_esex(&activity_dir(relative), &output).expect("package should build");
    output
}

fn import(engine: &mut RunningEngine, id: &str, package: &Path) {
    let response = engine.request(json!({
        "id": id,
        "method": "exercise.import",
        "params": { "esexPath": package }
    }));
    assert_eq!(response["ok"], true, "{response:#}");
}

fn snapshot(engine: &mut RunningEngine, id: &str) -> Value {
    engine.request(json!({
        "id": id,
        "method": "route.getModuleSnapshot",
        "params": { "routeId": "c", "moduleId": "strings" }
    }))
}

fn complete(data_dir: &Path, exercise_id: &str) {
    let connection = Connection::open(data_dir.join("lumen.db")).expect("database should open");
    connection
        .execute(
            "INSERT INTO exercise_progress (
                activity_id, completed_version, completed_at, attempts_before_completion
             ) VALUES (?1, '1.0.0', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1)",
            params![exercise_id],
        )
        .expect("progress should be inserted");
}

#[test]
fn snapshot_exposes_authoritative_module_progress_and_next_exercise() {
    let work = TestDirectory::new("snapshot");
    work.write_valid_module();
    let lowercase = package(&work, LOWERCASE_ACTIVITY, "lowercase");
    let vowels = package(&work, VOWELS_ACTIVITY, "vowels");
    let data_dir = work.data_dir();
    let install_root = work.install_root();
    let mut engine = RunningEngine::start(&data_dir, &install_root);

    let health = engine.request(json!({ "id": "health", "method": "engine.healthCheck" }));
    assert_eq!(health["result"]["protocolVersion"], 7);
    import(&mut engine, "import-lowercase", &lowercase);
    import(&mut engine, "import-vowels", &vowels);

    let initial = snapshot(&mut engine, "initial");
    let initial = &initial["result"]["snapshot"];
    assert_eq!(
        initial["module"],
        json!({
            "routeId": "c",
            "moduleId": "strings",
            "moduleNumber": 2,
            "routeTitle": "Ruta C",
            "title": "Cadenas de caracteres",
            "subtitle": "char, strings y texto"
        })
    );
    assert_eq!(initial["progress"], json!({ "completed": 0, "total": 2 }));
    assert_eq!(
        initial["nextExercise"],
        json!({
            "exerciseId": LOWERCASE_ID,
            "title": "Contar minúsculas en una línea"
        })
    );
    assert_eq!(initial["activeExerciseId"], LOWERCASE_ID);
    engine.shutdown();

    complete(&data_dir, LOWERCASE_ID);
    let mut engine = RunningEngine::start(&data_dir, &install_root);
    let advanced = snapshot(&mut engine, "advanced");
    let advanced = &advanced["result"]["snapshot"];
    assert_eq!(advanced["progress"], json!({ "completed": 1, "total": 2 }));
    assert_eq!(
        advanced["nextExercise"],
        json!({
            "exerciseId": VOWELS_ID,
            "title": "Contar vocales minúsculas"
        })
    );
    engine.shutdown();

    complete(&data_dir, VOWELS_ID);
    let mut engine = RunningEngine::start(&data_dir, &install_root);
    let completed = snapshot(&mut engine, "completed");
    let completed = &completed["result"]["snapshot"];
    assert_eq!(completed["progress"], json!({ "completed": 2, "total": 2 }));
    assert_eq!(completed["nextExercise"], Value::Null);
    assert_eq!(completed["activeExerciseId"], Value::Null);
    engine.shutdown();
}

#[test]
fn missing_or_invalid_module_metadata_returns_controlled_content_error() {
    let work = TestDirectory::new("metadata-errors");
    let data_dir = work.data_dir();
    let install_root = work.install_root();
    let mut engine = RunningEngine::start(&data_dir, &install_root);

    let missing = snapshot(&mut engine, "missing");
    assert_eq!(missing["ok"], false);
    assert_eq!(missing["error"]["code"], "CONTENT_ERROR");
    assert_eq!(missing["error"]["recoverable"], true);

    let module_path = work.module_path();
    fs::create_dir_all(
        module_path
            .parent()
            .expect("module path should have parent"),
    )
    .expect("module directory should be created");
    fs::write(&module_path, "{ invalid json").expect("invalid metadata should be written");
    let malformed = snapshot(&mut engine, "malformed");
    assert_eq!(malformed["error"]["code"], "CONTENT_ERROR");

    work.write_module(&json!({
        "schemaVersion": 2,
        "routeId": "c",
        "moduleId": "strings",
        "moduleNumber": 2,
        "routeTitle": "Ruta C",
        "title": "Cadenas de caracteres",
        "subtitle": "char, strings y texto"
    }));
    let wrong_version = snapshot(&mut engine, "wrong-version");
    assert_eq!(wrong_version["error"]["code"], "CONTENT_ERROR");

    work.write_module(&json!({
        "schemaVersion": 1,
        "routeId": "c",
        "moduleId": "pointers",
        "moduleNumber": 2,
        "routeTitle": "Ruta C",
        "title": "Cadenas de caracteres",
        "subtitle": "char, strings y texto"
    }));
    let wrong_identity = snapshot(&mut engine, "wrong-identity");
    assert_eq!(wrong_identity["error"]["code"], "CONTENT_ERROR");

    work.write_valid_module();
    let valid = snapshot(&mut engine, "valid");
    assert_eq!(valid["ok"], true, "{valid:#}");
    assert_eq!(
        valid["result"]["snapshot"]["progress"],
        json!({ "completed": 0, "total": 0 })
    );
    assert_eq!(valid["result"]["snapshot"]["nextExercise"], Value::Null);

    let health = engine.request(json!({ "id": "health", "method": "engine.healthCheck" }));
    assert_eq!(health["ok"], true);
    engine.shutdown();
}
