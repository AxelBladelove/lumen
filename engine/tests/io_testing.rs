use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use lumen_engine::testing::{
    run_io_tests, validate_io_cases, IoCaseStatus, RunOptions, TestingError,
};
use serde_json::{json, Value};

const REAL_MANIFEST: &str =
    include_str!("../../content/activities/c.strings.count-lowercase-01/manifest.json");
const REAL_CASES: &str =
    include_str!("../../content/activities/c.strings.count-lowercase-01/tests/io-cases.json");

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
        let path = env::temp_dir().join(format!(
            "lumen-io-testing-{label}-{}-{timestamp}-{counter}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("test directory should be created");
        Self { path }
    }

    fn compile(&self, gcc: &Path, source: &str) -> PathBuf {
        let source_path = self.path.join("main.c");
        let binary = self.path.join("main.exe");
        fs::write(&source_path, source).expect("C source should be written");
        let output = Command::new(gcc)
            .arg("-Wall")
            .arg("-Wextra")
            .arg("-g")
            .arg("-std=c17")
            .arg(&source_path)
            .arg("-o")
            .arg(&binary)
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .output()
            .expect("GCC should start");
        assert!(
            output.status.success(),
            "GCC failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        binary
    }
}

impl Drop for TestDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

#[test]
fn correct_solution_passes_all_real_cases() {
    let Some(gcc) = require_gcc("correct_solution_passes_all_real_cases") else {
        return;
    };
    let directory = TestDirectory::new("correct");
    let binary = directory.compile(
        &gcc,
        r#"#include <stdio.h>

int main(void) {
    char line[1024];
    int count = 0;

    if (fgets(line, sizeof line, stdin) != NULL) {
        for (int i = 0; line[i] != '\0'; ++i) {
            if (line[i] >= 'a' && line[i] <= 'z') {
                ++count;
            }
        }
    }

    printf("%d\n", count);
    return 0;
}
"#,
    );
    let manifest: Value = serde_json::from_str(REAL_MANIFEST).expect("real manifest should parse");
    let cases = validate_io_cases(REAL_CASES, &manifest).expect("real cases should be valid");
    let run = run_io_tests(&binary, &cases, &options_from_manifest(&manifest));

    assert!(run.overall_passed);
    assert_eq!(run.passed_count, 10);
    assert_eq!(run.failed_count, 0);
    assert_eq!(run.results.len(), 10);
    assert!(run
        .results
        .iter()
        .all(|result| result.status == IoCaseStatus::Passed));
}

#[test]
fn fixed_buffer_bug_only_fails_a_boundaries_case() {
    let Some(gcc) = require_gcc("fixed_buffer_bug_only_fails_a_boundaries_case") else {
        return;
    };
    let directory = TestDirectory::new("fixed-buffer-bug");
    let binary = directory.compile(
        &gcc,
        r#"#include <stdio.h>

int main(void) {
    char line[64];
    int count = 0;

    if (fgets(line, sizeof line, stdin) != NULL) {
        for (int i = 0; line[i] != '\0'; ++i) {
            if (line[i] >= 'a' && line[i] <= 'z') {
                ++count;
            }
        }
    }

    printf("%d\n", count);
    return 0;
}
"#,
    );
    let manifest: Value = serde_json::from_str(REAL_MANIFEST).expect("real manifest should parse");
    let cases = validate_io_cases(REAL_CASES, &manifest).expect("real cases should be valid");
    let run = run_io_tests(&binary, &cases, &options_from_manifest(&manifest));

    assert!(!run.overall_passed);
    let failed_ids: Vec<_> = run
        .results
        .iter()
        .filter(|result| result.status == IoCaseStatus::Failed)
        .map(|result| result.id.as_str())
        .collect();
    assert_eq!(failed_ids, ["long-line"]);

    let traversal = run
        .group_results
        .iter()
        .find(|group| group.id == "traversal")
        .expect("traversal summary should exist");
    assert_eq!(traversal.total, 4);
    assert_eq!(traversal.passed, 4);
    assert!(traversal.all_passed);

    let boundaries = run
        .group_results
        .iter()
        .find(|group| group.id == "boundaries")
        .expect("boundaries summary should exist");
    assert_eq!(boundaries.total, 6);
    assert_eq!(boundaries.passed, 5);
    assert!(!boundaries.all_passed);

    let long_line = run
        .results
        .iter()
        .find(|result| result.id == "long-line")
        .expect("long-line result should exist");
    assert_eq!(long_line.expected_stdout_normalized.as_deref(), Some("200"));
    assert_eq!(long_line.actual_stdout_normalized.as_deref(), Some("63"));
}

#[test]
fn infinite_loop_times_out_and_is_terminated() {
    let Some(gcc) = require_gcc("infinite_loop_times_out_and_is_terminated") else {
        return;
    };
    let directory = TestDirectory::new("timeout");
    let binary = directory.compile(
        &gcc,
        r#"int main(void) {
    for (;;) {
    }
}
"#,
    );
    let manifest = json!({
        "testContract": {
            "testGroups": [
                { "id": "public-group", "phase": "public" }
            ],
            "limits": { "timeLimitMs": 500 }
        }
    });
    let cases = validate_io_cases(
        r#"{
            "formatVersion": 1,
            "cases": [
                {
                    "id": "infinite-loop",
                    "group": "public-group",
                    "stdin": "",
                    "expectedStdout": "",
                    "timeoutMs": 300
                }
            ]
        }"#,
        &manifest,
    )
    .expect("timeout case should be valid");
    let run = run_io_tests(&binary, &cases, &RunOptions::default());

    assert!(!run.overall_passed);
    assert_eq!(run.results[0].status, IoCaseStatus::Timeout);
    assert!(run.results[0].duration_ms >= 300);
    fs::remove_file(&binary).expect("timed out process should no longer hold its executable");
}

#[test]
fn validates_real_and_invalid_case_files() {
    let real_manifest: Value =
        serde_json::from_str(REAL_MANIFEST).expect("real manifest should parse");
    let real_cases = validate_io_cases(REAL_CASES, &real_manifest)
        .expect("real case file and manifest should be valid");
    assert_eq!(real_cases.format_version, 1);
    assert_eq!(real_cases.cases.len(), 10);

    let manifest = synthetic_manifest(100);
    assert_has_code(
        validate_io_cases(
            &case_file(&[
                ("same-id", "public-group", None),
                ("same-id", "private-group", None),
            ]),
            &manifest,
        ),
        "DUPLICATE_CASE_ID",
    );
    assert_has_code(
        validate_io_cases(
            &case_file(&[
                ("public-case", "public-group", None),
                ("private-case", "private-group", None),
                ("ghost-case", "ghost-group", None),
            ]),
            &manifest,
        ),
        "UNKNOWN_TEST_GROUP",
    );
    assert_has_code(
        validate_io_cases(
            &case_file(&[("public-case", "public-group", None)]),
            &manifest,
        ),
        "EMPTY_TEST_GROUP",
    );
    assert_has_code(
        validate_io_cases(
            &case_file(&[
                ("public-case", "public-group", Some(101)),
                ("private-case", "private-group", None),
            ]),
            &manifest,
        ),
        "TIMEOUT_EXCEEDS_LIMIT",
    );
    assert_has_code(validate_io_cases("{", &manifest), "INVALID_JSON");
}

#[test]
fn unsupported_normalization_is_inconclusive_without_launching() {
    let manifest = json!({
        "testContract": {
            "testGroups": [
                { "id": "public-group", "phase": "public" }
            ],
            "limits": { "timeLimitMs": 100 }
        }
    });
    let cases = validate_io_cases(
        &case_file(&[("normalization-case", "public-group", None)]),
        &manifest,
    )
    .expect("case should be valid");
    let options = RunOptions {
        normalization: vec!["unknown-normalization".to_owned()],
        ..RunOptions::default()
    };
    let run = run_io_tests(Path::new("binary-that-does-not-exist"), &cases, &options);

    assert_eq!(run.results[0].status, IoCaseStatus::Inconclusive);
    assert!(run.results[0]
        .message
        .as_deref()
        .is_some_and(|message| message.contains("unknown-normalization")));
}

fn options_from_manifest(manifest: &Value) -> RunOptions {
    let normalization = manifest
        .pointer("/testContract/normalization")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .collect();

    RunOptions {
        normalization,
        default_timeout_ms: manifest
            .pointer("/testContract/limits/timeLimitMs")
            .and_then(Value::as_u64)
            .unwrap_or(2_000),
        output_limit_kb: manifest
            .pointer("/testContract/limits/outputLimitKb")
            .and_then(Value::as_u64)
            .and_then(|limit| usize::try_from(limit).ok())
            .unwrap_or(256),
        expected_exit_code: manifest
            .pointer("/testContract/expectedExitCode")
            .and_then(Value::as_i64)
            .or(Some(0)),
        ..RunOptions::default()
    }
}

fn synthetic_manifest(time_limit_ms: u64) -> Value {
    json!({
        "testContract": {
            "testGroups": [
                { "id": "public-group", "phase": "public" },
                { "id": "private-group", "phase": "local-private" }
            ],
            "limits": { "timeLimitMs": time_limit_ms }
        }
    })
}

fn case_file(cases: &[(&str, &str, Option<u64>)]) -> String {
    let cases: Vec<_> = cases
        .iter()
        .map(|(id, group, timeout_ms)| {
            let mut case = json!({
                "id": id,
                "group": group,
                "stdin": "",
                "expectedStdout": ""
            });
            if let Some(timeout_ms) = timeout_ms {
                case["timeoutMs"] = json!(timeout_ms);
            }
            case
        })
        .collect();
    json!({ "formatVersion": 1, "cases": cases }).to_string()
}

fn assert_has_code(result: Result<lumen_engine::testing::IoCases, Vec<TestingError>>, code: &str) {
    let errors = result.expect_err("case file should be rejected");
    assert!(
        errors.iter().any(|error| error.code == code),
        "expected {code}, got {errors:?}"
    );
}

fn require_gcc(test_name: &str) -> Option<PathBuf> {
    let gcc = discover_gcc();
    if gcc.is_none() {
        eprintln!("skipping {test_name}: GCC is not available");
    }
    gcc
}

fn discover_gcc() -> Option<PathBuf> {
    let names: &[&str] = if cfg!(windows) {
        &["gcc.exe", "gcc"]
    } else {
        &["gcc", "gcc.exe"]
    };
    let on_path = env::var_os("PATH").and_then(|path| {
        env::split_paths(&path)
            .flat_map(|directory| names.iter().map(move |name| directory.join(name)))
            .find(|candidate| candidate.is_file())
    });

    on_path.or_else(|| {
        [
            PathBuf::from(r"C:\msys64\ucrt64\bin\gcc.exe"),
            PathBuf::from(r"C:\msys64\mingw64\bin\gcc.exe"),
        ]
        .into_iter()
        .find(|candidate| candidate.is_file())
    })
}
