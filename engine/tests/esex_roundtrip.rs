use std::env;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use lumen_engine::esex::{
    build_esex, import_esex, import_esex_with_limits, EsexError, ImportLimits, ImportedActivity,
};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

const REAL_ACTIVITY: &str = "../content/activities/c.strings.count-lowercase-01";

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
            "lumen-esex-{label}-{}-{timestamp}-{counter}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("test directory should be created");
        Self { path }
    }
}

impl Drop for TestDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn real_activity_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join(REAL_ACTIVITY)
}

fn assert_has_code(errors: &[EsexError], expected: &str) {
    assert!(
        errors.iter().any(|error| error.code == expected),
        "debería incluir {expected}: {errors:?}"
    );
}

#[test]
fn build_is_reproducible_and_import_round_trips() {
    let workdir = TestDirectory::new("roundtrip");
    let package_a = workdir.path.join("a.esex");
    let package_b = workdir.path.join("b.esex");

    let info_a = build_esex(&real_activity_dir(), &package_a).expect("el build debería funcionar");
    let info_b =
        build_esex(&real_activity_dir(), &package_b).expect("el segundo build debería funcionar");

    assert_eq!(
        info_a.entry_count, 5,
        "manifest.json + 4 archivos de content"
    );
    assert_eq!(
        info_a.package_sha256, info_b.package_sha256,
        "el empaquetado debe ser reproducible"
    );
    assert!(info_a.size_bytes > 0);

    let install_root = workdir.path.join("store");
    let imported: ImportedActivity =
        import_esex(&package_a, &install_root).expect("la importación debería funcionar");
    assert_eq!(imported.activity_id, "c.strings.count-lowercase-01");
    assert_eq!(imported.version, "1.0.0");
    assert_eq!(imported.package_sha256, info_a.package_sha256);
    assert_eq!(
        imported.install_path,
        install_root
            .join("c.strings.count-lowercase-01")
            .join("1.0.0")
    );

    for relative in [
        "manifest.json",
        "statement.md",
        "starter/main.c",
        "tests/io-cases.json",
        "hints/hints.es.json",
    ] {
        let source = fs::read(real_activity_dir().join(relative))
            .expect("el archivo fuente debería existir");
        let extracted = fs::read(imported.install_path.join(relative))
            .expect("el archivo extraído debería existir");
        assert_eq!(
            source, extracted,
            "el archivo '{relative}' debe ser idéntico"
        );
    }

    let staging = install_root.join(".staging");
    let staging_entries = fs::read_dir(&staging)
        .map(|entries| entries.count())
        .unwrap_or(0);
    assert_eq!(staging_entries, 0, "el staging debe quedar limpio");

    let errors =
        import_esex(&package_a, &install_root).expect_err("la segunda importación debería fallar");
    assert_has_code(&errors, "ALREADY_INSTALLED");
}

#[test]
fn rejects_unsafe_undeclared_and_incomplete_packages() {
    let workdir = TestDirectory::new("invalid");
    let install_root = workdir.path.join("store");
    let manifest_json =
        fs::read_to_string(real_activity_dir().join("manifest.json")).expect("manifest real");

    let traversal = synthetic_package(&workdir.path, "traversal.esex", |zip, options| {
        zip.start_file("../evil.txt", options).unwrap();
        zip.write_all(b"evil").unwrap();
    });
    assert_has_code(
        &import_esex(&traversal, &install_root).expect_err("path traversal debería fallar"),
        "UNSAFE_ENTRY",
    );

    let undeclared = synthetic_package(&workdir.path, "undeclared.esex", |zip, options| {
        write_real_activity_entries(zip, options, &manifest_json);
        zip.start_file("extra.txt", options).unwrap();
        zip.write_all(b"extra").unwrap();
    });
    assert_has_code(
        &import_esex(&undeclared, &install_root).expect_err("entrada extra debería fallar"),
        "UNDECLARED_ENTRY",
    );

    let no_manifest = synthetic_package(&workdir.path, "no-manifest.esex", |zip, options| {
        zip.start_file("statement.md", options).unwrap();
        zip.write_all(b"sin manifest").unwrap();
    });
    assert_has_code(
        &import_esex(&no_manifest, &install_root).expect_err("sin manifest debería fallar"),
        "INVALID_PACKAGE",
    );

    let missing_content = synthetic_package(&workdir.path, "missing.esex", |zip, options| {
        zip.start_file("manifest.json", options).unwrap();
        zip.write_all(manifest_json.as_bytes()).unwrap();
    });
    assert_has_code(
        &import_esex(&missing_content, &install_root).expect_err("content ausente debería fallar"),
        "MISSING_CONTENT",
    );

    let invalid_manifest = synthetic_package(&workdir.path, "bad-manifest.esex", |zip, options| {
        zip.start_file("manifest.json", options).unwrap();
        zip.write_all(br#"{"schemaVersion": 1, "id": "c.strings.bad-01"}"#)
            .unwrap();
    });
    assert_has_code(
        &import_esex(&invalid_manifest, &install_root)
            .expect_err("manifest inválido debería fallar"),
        "MANIFEST_INVALID",
    );
}

#[test]
fn enforces_size_limits() {
    let workdir = TestDirectory::new("limits");
    let install_root = workdir.path.join("store");
    let manifest_json =
        fs::read_to_string(real_activity_dir().join("manifest.json")).expect("manifest real");

    let package = synthetic_package(&workdir.path, "large.esex", |zip, options| {
        write_real_activity_entries(zip, options, &manifest_json);
    });

    let limits = ImportLimits {
        max_entries: 256,
        max_total_uncompressed_bytes: 1024 * 1024,
        max_file_uncompressed_bytes: 512,
    };
    let errors = import_esex_with_limits(&package, &install_root, &limits)
        .expect_err("los límites bajos deberían rechazar el paquete");
    assert_has_code(&errors, "PACKAGE_TOO_LARGE");
}

fn synthetic_package(
    directory: &Path,
    name: &str,
    populate: impl FnOnce(&mut ZipWriter<File>, SimpleFileOptions),
) -> PathBuf {
    let path = directory.join(name);
    let file = File::create(&path).expect("el zip sintético debería crearse");
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default();
    populate(&mut zip, options);
    zip.finish().expect("el zip sintético debería finalizarse");
    path
}

fn write_real_activity_entries(
    zip: &mut ZipWriter<File>,
    options: SimpleFileOptions,
    manifest_json: &str,
) {
    zip.start_file("manifest.json", options).unwrap();
    zip.write_all(manifest_json.as_bytes()).unwrap();
    for relative in [
        "statement.md",
        "starter/main.c",
        "tests/io-cases.json",
        "hints/hints.es.json",
    ] {
        let bytes = fs::read(real_activity_dir().join(relative)).expect("archivo real");
        zip.start_file(relative, options).unwrap();
        zip.write_all(&bytes).unwrap();
    }
}
