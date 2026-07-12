use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use lumen_engine::esex::build_esex;
use rusqlite::Connection;
use serde_json::{json, Value};

const LOWERCASE_ACTIVITY: &str = "../content/activities/c.strings.count-lowercase-01";
const VOWELS_ACTIVITY: &str = "../content/activities/c.strings.count-vowels-01";
const LOWERCASE_ID: &str = "c.strings.count-lowercase-01";
const VOWELS_ID: &str = "c.strings.count-vowels-01";
const CORRECT_LOWERCASE: &str = r#"#include <stdio.h>
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
static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

struct TestDirectory(PathBuf);

impl TestDirectory {
    fn new() -> Self {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "lumen-protocol-v5-{}-{timestamp}-{counter}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("test directory should be created");
        Self(path)
    }

    fn data_dir(&self) -> PathBuf {
        self.0.join("data")
    }

    fn workspace_root(&self) -> PathBuf {
        self.0.join("lumen-workspace")
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
    fn start(data_dir: &Path) -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_lumen-engine"))
            .arg("--data-dir")
            .arg(data_dir)
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

fn activate(
    engine: &mut RunningEngine,
    id: &str,
    exercise_id: &str,
    workspace_root: &Path,
) -> Value {
    engine.request(json!({
        "id": id,
        "method": "exercise.activate",
        "params": {
            "exerciseId": exercise_id,
            "mode": "route",
            "workspaceRoot": workspace_root,
        }
    }))
}

#[test]
fn activation_materializes_without_overwrite_and_completion_unlocks_next() {
    if Command::new("gcc").arg("--version").output().is_err() {
        eprintln!("skipping protocol v5 route loop: gcc unavailable");
        return;
    }
    let work = TestDirectory::new();
    let lowercase_package = package(&work, LOWERCASE_ACTIVITY, "lowercase");
    let vowels_package = package(&work, VOWELS_ACTIVITY, "vowels");
    let mut engine = RunningEngine::start(&work.data_dir());

    let health = engine.request(json!({ "id": "health", "method": "engine.healthCheck" }));
    assert_eq!(health["result"]["protocolVersion"], 5);
    import(&mut engine, "import-lowercase", &lowercase_package);
    import(&mut engine, "import-vowels", &vowels_package);

    let snapshot = engine.request(json!({
        "id": "snapshot-initial",
        "method": "route.getModuleSnapshot",
        "params": { "routeId": "c", "moduleId": "strings" }
    }));
    assert_eq!(
        snapshot["result"]["snapshot"]["activeExerciseId"],
        LOWERCASE_ID
    );
    assert_eq!(
        snapshot["result"]["snapshot"]["nodes"][0]["status"],
        "active"
    );
    assert_eq!(
        snapshot["result"]["snapshot"]["nodes"][1]["status"],
        "locked"
    );

    let locked = activate(&mut engine, "locked", VOWELS_ID, &work.workspace_root());
    assert_eq!(locked["error"]["code"], "ACTIVITY_LOCKED");

    let first = activate(
        &mut engine,
        "activate-lowercase",
        LOWERCASE_ID,
        &work.workspace_root(),
    );
    assert_eq!(first["ok"], true, "{first:#}");
    assert_eq!(first["result"]["created"], true);
    let entrypoint = PathBuf::from(
        first["result"]["active"]["entrypointPath"]
            .as_str()
            .unwrap(),
    );
    let install_path = PathBuf::from(first["result"]["active"]["installPath"].as_str().unwrap());
    assert!(entrypoint.starts_with(work.workspace_root()));
    fs::write(&entrypoint, CORRECT_LOWERCASE).expect("working source should be editable");
    assert_ne!(
        fs::read_to_string(&entrypoint).unwrap(),
        fs::read_to_string(install_path.join("starter/main.c")).unwrap(),
        "editing the workspace must not mutate installed content"
    );

    let tests = engine.request(json!({
        "id": "tests",
        "method": "exercise.runTests",
        "params": {}
    }));
    assert_eq!(tests["result"]["status"], "passed", "{tests:#}");
    assert_eq!(tests["result"]["newlyCompleted"], true);

    let advanced = engine.request(json!({
        "id": "snapshot-advanced",
        "method": "route.getModuleSnapshot",
        "params": { "routeId": "c", "moduleId": "strings" }
    }));
    assert_eq!(
        advanced["result"]["snapshot"]["activeExerciseId"],
        VOWELS_ID
    );
    assert_eq!(
        advanced["result"]["snapshot"]["nodes"][0]["status"],
        "completed"
    );
    assert_eq!(
        advanced["result"]["snapshot"]["nodes"][1]["status"],
        "active"
    );

    let second = activate(
        &mut engine,
        "activate-vowels",
        VOWELS_ID,
        &work.workspace_root(),
    );
    assert_eq!(second["ok"], true, "{second:#}");
    let second_entrypoint = PathBuf::from(
        second["result"]["active"]["entrypointPath"]
            .as_str()
            .unwrap(),
    );
    fs::write(&second_entrypoint, "student work\n").expect("student work should write");
    let reopened = activate(
        &mut engine,
        "reopen-vowels",
        VOWELS_ID,
        &work.workspace_root(),
    );
    assert_eq!(reopened["result"]["created"], false);
    assert_eq!(
        fs::read_to_string(&second_entrypoint).unwrap(),
        "student work\n"
    );

    engine.shutdown();
    let connection = Connection::open(work.data_dir().join("lumen.db")).unwrap();
    let schema: i64 = connection
        .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(schema, 5);
}
