#![cfg(windows)]

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

fn runner() -> PathBuf {
    PathBuf::from(env!("CARGO_BIN_EXE_lumen-console-runner"))
}

fn temp_dir(test_name: &str) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    let path = env::temp_dir().join(format!(
        "lumen-console-runner-{test_name}-{}-{unique}",
        std::process::id()
    ));
    fs::create_dir_all(&path).expect("temporary directory should be created");
    path
}

fn cmd_exe() -> PathBuf {
    PathBuf::from(env::var_os("COMSPEC").expect("COMSPEC should point to cmd.exe"))
}

fn output_text(output: &Output) -> String {
    String::from_utf8_lossy(&output.stdout).into_owned()
}

fn assert_removed(path: &Path) {
    assert!(
        !path.exists(),
        "{} should have been removed",
        path.display()
    );
}

#[test]
fn run_prints_codeblocks_footer_and_manages_lock() {
    let temp = temp_dir("run");
    let lock = temp.join("nested").join("runner.lock");
    let child = Command::new(runner())
        .arg("run")
        .arg("--title")
        .arg("Lumen test")
        .arg("--lock")
        .arg(&lock)
        .arg("--no-wait")
        .arg(cmd_exe())
        .args(["/d", "/c", "ping -n 2 127.0.0.1 >nul & exit /b 3"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("runner should start");

    let deadline = Instant::now() + Duration::from_secs(5);
    while !lock.exists() && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(10));
    }
    assert!(
        lock.exists(),
        "lock should exist while the child is running"
    );

    let output = child.wait_with_output().expect("runner should finish");
    assert_eq!(output.status.code(), Some(3));
    let stdout = output_text(&output);
    assert!(stdout.contains("Process returned 3 (0x3)"), "{stdout:?}");
    assert!(stdout.contains("execution time :"), "{stdout:?}");
    assert!(stdout.contains("Press any key to continue."), "{stdout:?}");
    assert_removed(&lock);
    fs::remove_dir_all(temp).expect("temporary directory should be removed");
}

#[test]
fn report_prints_and_removes_report_and_lock() {
    let temp = temp_dir("report");
    let lock = temp.join("runner.lock");
    let report = temp.join("report.txt");
    let contents = "\u{1b}[31mError de prueba\u{1b}[0m\n";
    fs::write(&report, contents).expect("report should be written");
    fs::write(
        &lock,
        format!("reservation:{}:test-token", std::process::id()),
    )
    .expect("reservation should be written");

    let output = Command::new(runner())
        .arg("report")
        .arg("--title")
        .arg("Lumen report")
        .arg("--lock")
        .arg(&lock)
        .arg("--lock-token")
        .arg("test-token")
        .arg("--exit-code")
        .arg("1")
        .arg("--no-wait")
        .arg(&report)
        .output()
        .expect("runner should finish");

    assert_eq!(output.status.code(), Some(1));
    let stdout = output_text(&output);
    assert!(stdout.starts_with(contents), "{stdout:?}");
    assert!(stdout.contains("Process returned 1 (0x1)"), "{stdout:?}");
    assert!(stdout.contains("Press any key to continue."), "{stdout:?}");
    assert_removed(&report);
    assert_removed(&lock);
    fs::remove_dir_all(temp).expect("temporary directory should be removed");
}
