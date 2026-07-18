use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use lumen_engine::esex::build_esex;
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
const INCORRECT_LOWERCASE: &str = r#"#include <stdio.h>
int main(void) {
    puts("0");
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
            "lumen-protocol-v6-{}-{timestamp}-{counter}",
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

fn package(work: &TestDirectory, activity: &Path, name: &str) -> PathBuf {
    let output = work.0.join(format!("{name}.esex"));
    build_esex(activity, &output).expect("package should build");
    output
}

fn package_fixture(work: &TestDirectory, relative: &str, name: &str) -> PathBuf {
    package(work, &activity_dir(relative), name)
}

fn copy_directory(source: &Path, destination: &Path) {
    fs::create_dir_all(destination).expect("fixture directory should be created");
    for entry in fs::read_dir(source).expect("fixture directory should be readable") {
        let entry = entry.expect("fixture entry should be readable");
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        if entry
            .file_type()
            .expect("fixture entry type should be readable")
            .is_dir()
        {
            copy_directory(&source_path, &destination_path);
        } else {
            fs::copy(&source_path, &destination_path).expect("fixture file should be copied");
        }
    }
}

fn mutable_fixture(work: &TestDirectory, name: &str) -> PathBuf {
    let destination = work.0.join(name);
    copy_directory(&activity_dir(LOWERCASE_ACTIVITY), &destination);
    destination
}

fn import(engine: &mut RunningEngine, id: &str, package: &Path) -> Value {
    engine.request(json!({
        "id": id,
        "method": "exercise.import",
        "params": { "esexPath": package }
    }))
}

fn activate(engine: &mut RunningEngine, id: &str, workspace_root: &Path) -> Value {
    engine.request(json!({
        "id": id,
        "method": "exercise.activate",
        "params": {
            "exerciseId": LOWERCASE_ID,
            "mode": "route",
            "workspaceRoot": workspace_root,
        }
    }))
}

fn detail(engine: &mut RunningEngine, id: &str, exercise_id: &str) -> Value {
    engine.request(json!({
        "id": id,
        "method": "exercise.getDetail",
        "params": { "exerciseId": exercise_id }
    }))
}

fn get_active(engine: &mut RunningEngine, id: &str) -> Value {
    engine.request(json!({
        "id": id,
        "method": "exercise.getActive",
        "params": {}
    }))
}

fn file_count(root: &Path) -> usize {
    if !root.exists() {
        return 0;
    }
    fs::read_dir(root)
        .expect("workspace should be readable")
        .map(|entry| entry.expect("workspace entry should be readable"))
        .map(|entry| {
            if entry
                .file_type()
                .expect("workspace entry type should be readable")
                .is_dir()
            {
                file_count(&entry.path())
            } else {
                1
            }
        })
        .sum()
}

#[test]
fn health_check_reports_protocol_version_seven() {
    let work = TestDirectory::new();
    let mut engine = RunningEngine::start(&work.data_dir());

    let response = engine.request(json!({ "id": "health", "method": "engine.healthCheck" }));
    assert_eq!(response["ok"], true, "{response:#}");
    assert_eq!(response["result"]["protocolVersion"], 7);

    engine.shutdown();
}

#[test]
fn active_detail_reads_installed_content_and_is_read_only() {
    let work = TestDirectory::new();
    let lowercase_package = package_fixture(&work, LOWERCASE_ACTIVITY, "lowercase");
    let mut engine = RunningEngine::start(&work.data_dir());
    assert_eq!(
        import(&mut engine, "import", &lowercase_package)["ok"],
        true
    );

    let inactive_before = get_active(&mut engine, "inactive-before");
    assert_eq!(inactive_before["result"]["status"], "none");
    assert!(!work.workspace_root().exists());
    let detail_before_activation = detail(&mut engine, "detail-before-activation", LOWERCASE_ID);
    assert_eq!(
        detail_before_activation["ok"], true,
        "{detail_before_activation:#}"
    );
    assert!(!work.workspace_root().exists());
    assert_eq!(
        get_active(&mut engine, "inactive-after")["result"],
        inactive_before["result"]
    );

    let activation = activate(&mut engine, "activate", &work.workspace_root());
    assert_eq!(activation["ok"], true, "{activation:#}");

    let entrypoint = PathBuf::from(
        activation["result"]["active"]["entrypointPath"]
            .as_str()
            .expect("entrypoint path should be returned"),
    );
    fs::write(&entrypoint, "working copy sentinel\n").expect("working copy should be editable");
    let active_before = get_active(&mut engine, "active-before");
    let files_before = file_count(&work.workspace_root());

    let response = detail(&mut engine, "detail", LOWERCASE_ID);
    assert_eq!(response["ok"], true, "{response:#}");
    let detail = &response["result"]["detail"];
    assert_eq!(detail["exerciseId"], LOWERCASE_ID);
    assert_eq!(detail["version"], "1.0.0");
    assert_eq!(detail["title"], "Contar minúsculas en una línea");
    assert_eq!(
        detail["summary"],
        "Recorre una cadena terminada en null y cuenta sus letras minúsculas."
    );
    let expected_statement =
        fs::read_to_string(activity_dir(LOWERCASE_ACTIVITY).join("statement.md")).unwrap();
    assert_eq!(detail["statementMarkdown"], expected_statement);
    assert_ne!(detail["statementMarkdown"], "working copy sentinel\n");
    assert_eq!(detail["status"], "active");
    assert_eq!(detail["nodeType"], "exercise");
    assert_eq!(detail["primaryTopics"], json!(["strings"]));
    assert_eq!(
        detail["difficulty"],
        json!({ "band": "easy+", "score": 42, "expectedMinutes": 20 })
    );
    assert_eq!(detail["hints"].as_array().unwrap().len(), 4);
    assert_eq!(detail["hints"][0]["order"], 1);
    assert_eq!(
        detail["hints"][0]["text"],
        "Una cadena en C termina en el caracter nulo '\\0'. Tu bucle debe detenerse ahi, no en el tamano del buffer."
    );
    assert_eq!(detail["hints"][3]["order"], 4);
    assert_eq!(detail["progress"]["completed"], false);
    assert_eq!(detail["progress"]["attempts"]["total"], 0);
    assert_eq!(detail["progress"]["attempts"]["passed"], 0);
    assert!(detail["progress"]["attempts"]["lastRunAt"].is_null());

    let active_after = get_active(&mut engine, "active-after");
    assert_eq!(active_after["result"], active_before["result"]);
    assert_eq!(file_count(&work.workspace_root()), files_before);
    assert_eq!(
        fs::read_to_string(entrypoint).unwrap(),
        "working copy sentinel\n"
    );

    engine.shutdown();
}

#[test]
fn completed_detail_reports_attempt_history() {
    if Command::new("gcc").arg("--version").output().is_err() {
        eprintln!("skipping protocol v6 attempts: gcc unavailable");
        return;
    }
    let work = TestDirectory::new();
    let lowercase_package = package_fixture(&work, LOWERCASE_ACTIVITY, "lowercase");
    let mut engine = RunningEngine::start(&work.data_dir());
    assert_eq!(
        import(&mut engine, "import", &lowercase_package)["ok"],
        true
    );
    let activation = activate(&mut engine, "activate", &work.workspace_root());
    assert_eq!(activation["ok"], true, "{activation:#}");
    let entrypoint = PathBuf::from(
        activation["result"]["active"]["entrypointPath"]
            .as_str()
            .expect("entrypoint path should be returned"),
    );

    let initial = detail(&mut engine, "initial", LOWERCASE_ID);
    assert_eq!(
        initial["result"]["detail"]["progress"]["attempts"]["total"],
        0
    );

    fs::write(&entrypoint, INCORRECT_LOWERCASE).expect("incorrect source should write");
    let failed = engine.request(json!({
        "id": "failed",
        "method": "exercise.runTests",
        "params": {}
    }));
    assert_eq!(failed["result"]["status"], "failed", "{failed:#}");

    fs::write(&entrypoint, CORRECT_LOWERCASE).expect("correct source should write");
    let passed = engine.request(json!({
        "id": "passed",
        "method": "exercise.runTests",
        "params": {}
    }));
    assert_eq!(passed["result"]["status"], "passed", "{passed:#}");

    let response = detail(&mut engine, "completed", LOWERCASE_ID);
    assert_eq!(response["ok"], true, "{response:#}");
    let detail = &response["result"]["detail"];
    assert_eq!(detail["status"], "completed");
    assert_eq!(detail["progress"]["completed"], true);
    assert_eq!(detail["progress"]["attempts"]["total"], 2);
    assert_eq!(detail["progress"]["attempts"]["passed"], 1);
    let last_run_at = detail["progress"]["attempts"]["lastRunAt"]
        .as_str()
        .expect("lastRunAt should be populated");
    assert!(last_run_at.ends_with('Z'), "{last_run_at}");
    assert!(last_run_at.contains('T'), "{last_run_at}");

    engine.shutdown();
}

#[test]
fn locked_and_unknown_activities_return_normative_errors() {
    let work = TestDirectory::new();
    let lowercase_package = package_fixture(&work, LOWERCASE_ACTIVITY, "lowercase");
    let vowels_package = package_fixture(&work, VOWELS_ACTIVITY, "vowels");
    let mut engine = RunningEngine::start(&work.data_dir());
    assert_eq!(
        import(&mut engine, "import-lowercase", &lowercase_package)["ok"],
        true
    );
    assert_eq!(
        import(&mut engine, "import-vowels", &vowels_package)["ok"],
        true
    );

    let locked = detail(&mut engine, "locked", VOWELS_ID);
    assert_eq!(locked["ok"], false, "{locked:#}");
    assert_eq!(locked["error"]["code"], "ACTIVITY_LOCKED");

    let unknown = detail(&mut engine, "unknown", "c.unknown.exercise");
    assert_eq!(unknown["ok"], false, "{unknown:#}");
    assert_eq!(unknown["error"]["code"], "ACTIVITY_NOT_FOUND");

    engine.shutdown();
}

#[test]
fn activity_without_declared_hints_returns_empty_list() {
    let work = TestDirectory::new();
    let fixture = mutable_fixture(&work, "without-hints");
    let manifest_path = fixture.join("manifest.json");
    let mut manifest: Value =
        serde_json::from_str(&fs::read_to_string(&manifest_path).unwrap()).unwrap();
    manifest["content"]
        .as_object_mut()
        .expect("content should be an object")
        .remove("hints");
    fs::remove_dir_all(fixture.join("hints")).expect("undeclared hints should be removed");
    fs::write(
        &manifest_path,
        serde_json::to_vec_pretty(&manifest).expect("manifest should serialize"),
    )
    .expect("manifest should write");
    let activity_package = package(&work, &fixture, "without-hints");
    let mut engine = RunningEngine::start(&work.data_dir());
    assert_eq!(import(&mut engine, "import", &activity_package)["ok"], true);

    let response = detail(&mut engine, "detail", LOWERCASE_ID);
    assert_eq!(response["ok"], true, "{response:#}");
    assert_eq!(response["result"]["detail"]["hints"], json!([]));

    engine.shutdown();
}

#[test]
fn malformed_declared_hints_return_content_error() {
    let work = TestDirectory::new();
    let fixture = mutable_fixture(&work, "malformed-hints");
    fs::write(fixture.join("hints/hints.es.json"), "{ not valid json")
        .expect("malformed hints should write");
    let activity_package = package(&work, &fixture, "malformed-hints");
    let mut engine = RunningEngine::start(&work.data_dir());
    assert_eq!(import(&mut engine, "import", &activity_package)["ok"], true);

    let response = detail(&mut engine, "detail", LOWERCASE_ID);
    assert_eq!(response["ok"], false, "{response:#}");
    assert_eq!(response["error"]["code"], "CONTENT_ERROR");

    engine.shutdown();
}
