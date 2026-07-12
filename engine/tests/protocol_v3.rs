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
            "lumen-protocol-v3-{label}-{}-{timestamp}-{counter}",
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

fn real_activity_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join(REAL_ACTIVITY)
}

fn package(
    work: &TestDirectory,
    label: &str,
    activity_id: &str,
    version: &str,
    order: Option<i64>,
) -> PathBuf {
    let activity_dir = work.path.join(format!("activity-{label}"));
    for relative in CONTENT_FILES {
        let destination = activity_dir.join(relative);
        fs::create_dir_all(destination.parent().expect("content should have parent"))
            .expect("content parent should be created");
        fs::copy(real_activity_dir().join(relative), destination).expect("content should copy");
    }
    let mut manifest: Value = serde_json::from_str(
        &fs::read_to_string(real_activity_dir().join("manifest.json")).expect("real manifest"),
    )
    .expect("real manifest should parse");
    manifest["id"] = json!(activity_id);
    manifest["version"] = json!(version);
    manifest["title"] = json!(format!("Actividad {activity_id}"));
    manifest["route"]["routeId"] = json!("c");
    manifest["route"]["moduleId"] = json!("strings");
    if let Some(order) = order {
        manifest["route"]["orderInModule"] = Value::from(order);
    } else {
        manifest["route"]
            .as_object_mut()
            .expect("route should be an object")
            .remove("orderInModule");
    }
    manifest["route"]["nodeType"] = json!("lesson");
    fs::write(
        activity_dir.join("manifest.json"),
        serde_json::to_vec_pretty(&manifest).expect("manifest should serialize"),
    )
    .expect("manifest should be written");
    let package_path = work.path.join(format!("{label}.esex"));
    build_esex(&activity_dir, &package_path).expect("package should build");
    package_path
}

fn import_request(id: &str, package_path: &Path) -> Value {
    json!({
        "id": id,
        "method": "exercise.import",
        "params": { "esexPath": package_path }
    })
}

fn save_active(engine: &mut RunningEngine, exercise_id: Option<&str>) {
    let response = engine.request(json!({
        "id": "save-active",
        "method": "session.saveLastState",
        "params": { "lastExerciseId": exercise_id }
    }));
    assert_eq!(response["ok"], true);
}

#[test]
fn migration_three_health_and_import_register_the_activity() {
    let work = TestDirectory::new("import");
    let package_path = package(&work, "happy", "c.strings.happy-01", "1.2.0", Some(4));
    let mut engine = RunningEngine::start(&work.data_dir());

    let health = engine.request(json!({ "id": "health", "method": "engine.healthCheck" }));
    assert_eq!(health["result"]["protocolVersion"], 6);
    assert_eq!(health["result"]["dbStatus"], "ready");

    let imported = engine.request(import_request("import", &package_path));
    assert_eq!(imported["ok"], true);
    assert_eq!(imported["result"]["activityId"], "c.strings.happy-01");
    assert_eq!(imported["result"]["version"], "1.2.0");
    assert_eq!(imported["result"]["alreadyInstalled"], false);
    assert_eq!(imported["result"]["activity"]["routeId"], "c");
    assert_eq!(imported["result"]["activity"]["moduleId"], "strings");
    assert_eq!(imported["result"]["activity"]["orderInModule"], 4);
    assert!(Path::new(
        imported["result"]["installPath"]
            .as_str()
            .expect("installPath should be a string")
    )
    .is_absolute());

    let repeated = engine.request(import_request("repeat", &package_path));
    assert_eq!(repeated["ok"], true);
    assert_eq!(repeated["result"]["alreadyInstalled"], true);
    assert_eq!(
        repeated["result"]["packageSha256"],
        imported["result"]["packageSha256"]
    );
    engine.shutdown();

    let connection = Connection::open(work.data_dir().join("lumen.db")).expect("database");
    let max_version: i64 = connection
        .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .expect("schema version");
    assert_eq!(max_version, 5);
    let row: (String, String, String, String, String, i64, String) = connection
        .query_row(
            "SELECT title, entrypoint, route_id, module_id, primary_topics,
                    order_in_module, manifest_json
             FROM installed_activities WHERE activity_id = 'c.strings.happy-01'",
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
        .expect("installed row");
    assert_eq!(row.1, "starter/main.c");
    assert_eq!(row.2, "c");
    assert_eq!(row.3, "strings");
    assert_eq!(row.4, r#"["strings"]"#);
    assert_eq!(row.5, 4);
    assert!(row.6.contains("c.strings.happy-01"));
}

#[test]
fn reimport_auto_repairs_a_missing_row() {
    let work = TestDirectory::new("repair");
    let package_path = package(&work, "repair", "c.strings.repair-01", "1.0.0", Some(1));
    let mut engine = RunningEngine::start(&work.data_dir());
    assert_eq!(
        engine.request(import_request("first", &package_path))["ok"],
        true
    );
    engine.shutdown();
    let connection = Connection::open(work.data_dir().join("lumen.db")).expect("database");
    connection
        .execute(
            "DELETE FROM installed_activities WHERE activity_id = 'c.strings.repair-01'",
            [],
        )
        .expect("row should delete");
    drop(connection);
    fs::remove_file(
        work.data_dir()
            .join("activities/c.strings.repair-01/1.0.0/.package-sha256"),
    )
    .expect("legacy installation should not have a sha marker");

    let mut engine = RunningEngine::start(&work.data_dir());
    let repaired = engine.request(import_request("repair", &package_path));
    assert_eq!(repaired["ok"], true);
    assert_eq!(repaired["result"]["alreadyInstalled"], true);
    engine.shutdown();
}

#[test]
fn conflicting_sha_is_rejected_without_overwriting() {
    let work = TestDirectory::new("conflict");
    let first = package(&work, "first", "c.strings.conflict-01", "1.0.0", Some(2));
    let second = package(&work, "second", "c.strings.conflict-01", "1.0.0", Some(3));
    let mut engine = RunningEngine::start(&work.data_dir());
    assert_eq!(engine.request(import_request("first", &first))["ok"], true);
    let conflict = engine.request(import_request("second", &second));
    assert_eq!(conflict["ok"], false);
    assert_eq!(conflict["error"]["code"], "IMPORT_CONFLICT");
    engine.shutdown();
}

#[test]
fn conflict_is_preserved_when_only_the_row_or_only_the_folder_exists() {
    let work = TestDirectory::new("partial-conflict");
    let first = package(
        &work,
        "partial-first",
        "c.strings.partial-01",
        "1.0.0",
        Some(2),
    );
    let second = package(
        &work,
        "partial-second",
        "c.strings.partial-01",
        "1.0.0",
        Some(3),
    );
    let install_path = work
        .data_dir()
        .join("activities/c.strings.partial-01/1.0.0");
    let mut engine = RunningEngine::start(&work.data_dir());
    assert_eq!(engine.request(import_request("first", &first))["ok"], true);
    engine.shutdown();

    fs::remove_dir_all(&install_path).expect("installed folder should delete");
    let mut engine = RunningEngine::start(&work.data_dir());
    let row_only = engine.request(import_request("row-only", &second));
    assert_eq!(row_only["error"]["code"], "IMPORT_CONFLICT");
    assert!(
        !install_path.exists(),
        "conflicting package should be rolled back"
    );
    engine.shutdown();

    let connection = Connection::open(work.data_dir().join("lumen.db")).expect("database");
    connection
        .execute(
            "DELETE FROM installed_activities WHERE activity_id = 'c.strings.partial-01'",
            [],
        )
        .expect("row should delete");
    drop(connection);
    lumen_engine::esex::import_esex(&first, &work.data_dir().join("activities"))
        .expect("legacy package should install directly");

    let mut engine = RunningEngine::start(&work.data_dir());
    let folder_only = engine.request(import_request("folder-only", &second));
    assert_eq!(folder_only["error"]["code"], "IMPORT_CONFLICT");
    let installed_manifest: Value = serde_json::from_str(
        &fs::read_to_string(install_path.join("manifest.json")).expect("installed manifest"),
    )
    .expect("installed manifest should parse");
    assert_eq!(installed_manifest["route"]["orderInModule"], 2);
    engine.shutdown();
}

#[test]
fn invalid_package_returns_structured_import_details() {
    let work = TestDirectory::new("invalid");
    let invalid = work.path.join("invalid.esex");
    fs::write(&invalid, "not a zip").expect("invalid package should write");
    let mut engine = RunningEngine::start(&work.data_dir());
    let response = engine.request(import_request("invalid", &invalid));
    assert_eq!(response["ok"], false);
    assert_eq!(response["error"]["code"], "IMPORT_FAILED");
    let details = response["error"]["details"]
        .as_array()
        .expect("details should be an array");
    assert!(!details.is_empty());
    assert!(details.iter().all(|detail| {
        detail["code"].is_string() && detail["path"].is_string() && detail["message"].is_string()
    }));
    engine.shutdown();
}

#[test]
fn get_active_returns_none_missing_and_ready() {
    let work = TestDirectory::new("active");
    let package_path = package(&work, "active", "c.strings.active-01", "1.0.0", Some(4));
    let mut engine = RunningEngine::start(&work.data_dir());
    let none = engine.request(json!({
        "id": "none", "method": "exercise.getActive", "params": {}
    }));
    assert_eq!(none["result"], json!({ "status": "none" }));

    save_active(&mut engine, Some("c.strings.not-installed-01"));
    let missing = engine.request(json!({
        "id": "missing", "method": "exercise.getActive", "params": {}
    }));
    assert_eq!(
        missing["result"],
        json!({ "status": "missing", "exerciseId": "c.strings.not-installed-01" })
    );

    let imported = engine.request(import_request("import-active", &package_path));
    save_active(&mut engine, Some("c.strings.active-01"));
    let ready = engine.request(json!({
        "id": "ready", "method": "exercise.getActive", "params": {}
    }));
    assert_eq!(ready["result"]["status"], "ready");
    assert_eq!(
        ready["result"]["active"]["exerciseId"],
        "c.strings.active-01"
    );
    assert!(Path::new(
        ready["result"]["active"]["entrypointPath"]
            .as_str()
            .expect("entrypointPath")
    )
    .is_file());

    let install_path = PathBuf::from(imported["result"]["installPath"].as_str().expect("path"));
    fs::remove_file(install_path.join("starter/main.c")).expect("entrypoint should delete");
    let deleted = engine.request(json!({
        "id": "deleted", "method": "exercise.getActive", "params": {}
    }));
    assert_eq!(
        deleted["result"],
        json!({ "status": "missing", "exerciseId": "c.strings.active-01" })
    );
    engine.shutdown();
}

#[test]
fn module_snapshot_orders_nodes_and_marks_first_incomplete_active() {
    let work = TestDirectory::new("snapshot");
    let late = package(&work, "late", "c.strings.zeta-01", "1.0.0", None);
    let second = package(&work, "second", "c.strings.beta-01", "1.0.0", Some(2));
    let first = package(&work, "first", "c.strings.alpha-01", "1.0.0", Some(2));
    let mut engine = RunningEngine::start(&work.data_dir());
    for (id, path) in [("late", late), ("second", second), ("first", first)] {
        assert_eq!(engine.request(import_request(id, &path))["ok"], true);
    }
    save_active(&mut engine, Some("c.strings.beta-01"));
    let response = engine.request(json!({
        "id": "snapshot",
        "method": "route.getModuleSnapshot",
        "params": { "routeId": "c", "moduleId": "strings" }
    }));
    let snapshot = &response["result"]["snapshot"];
    assert_eq!(snapshot["activeExerciseId"], "c.strings.alpha-01");
    assert_eq!(
        snapshot["nodes"]
            .as_array()
            .expect("nodes")
            .iter()
            .map(|node| node["exerciseId"].as_str().expect("exercise id"))
            .collect::<Vec<_>>(),
        vec![
            "c.strings.alpha-01",
            "c.strings.beta-01",
            "c.strings.zeta-01"
        ]
    );
    assert_eq!(snapshot["nodes"][0]["status"], "active");
    assert_eq!(snapshot["nodes"][1]["status"], "locked");
    assert_eq!(snapshot["nodes"][2]["orderInModule"], Value::Null);
    assert_eq!(snapshot["nodes"][1]["primaryTopics"], json!(["strings"]));

    let empty = engine.request(json!({
        "id": "empty",
        "method": "route.getModuleSnapshot",
        "params": { "routeId": "c", "moduleId": "empty" }
    }));
    assert_eq!(empty["result"]["snapshot"]["nodes"], json!([]));
    assert_eq!(empty["result"]["snapshot"]["activeExerciseId"], Value::Null);
    engine.shutdown();
}

#[test]
fn v3_methods_reject_invalid_params() {
    let work = TestDirectory::new("params");
    let mut engine = RunningEngine::start(&work.data_dir());
    let cases = [
        ("exercise.import", json!({})),
        ("exercise.import", json!({ "esexPath": "relative.esex" })),
        (
            "exercise.import",
            json!({ "esexPath": work.path, "extra": true }),
        ),
        ("exercise.getActive", json!({ "extra": true })),
        ("route.getModuleSnapshot", json!({})),
        (
            "route.getModuleSnapshot",
            json!({ "routeId": "c", "moduleId": "" }),
        ),
        (
            "route.getModuleSnapshot",
            json!({ "routeId": "c", "moduleId": "m", "extra": 1 }),
        ),
    ];
    for (index, (method, params)) in cases.into_iter().enumerate() {
        let response = engine.request(json!({
            "id": format!("invalid-{index}"), "method": method, "params": params
        }));
        assert_eq!(response["ok"], false);
        assert_eq!(response["error"]["code"], "INVALID_PARAMS");
    }
    engine.shutdown();
}

#[test]
fn build_esex_subcommand_prints_the_sha() {
    let work = TestDirectory::new("cli");
    let output = work.path.join("cli.esex");
    let command = Command::new(env!("CARGO_BIN_EXE_lumen-engine"))
        .arg("build-esex")
        .arg(real_activity_dir())
        .arg(&output)
        .output()
        .expect("build-esex should run");
    assert!(command.status.success());
    assert!(command.stderr.is_empty());
    let sha = String::from_utf8(command.stdout).expect("stdout should be utf8");
    assert_eq!(sha.trim().len(), 64);
    assert!(sha
        .trim()
        .chars()
        .all(|character| character.is_ascii_hexdigit()));
    assert!(output.is_file());
}
