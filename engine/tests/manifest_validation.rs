use std::fs;
use std::path::{Path, PathBuf};

use lumen_engine::manifest::validate_manifest;

fn contracts_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../contracts/examples")
}

#[test]
fn valid_manifests_pass() {
    let directory = contracts_dir().join("valid");
    let mut entries: Vec<_> = fs::read_dir(&directory)
        .expect("no se pudo leer contracts/examples/valid")
        .map(|entry| entry.expect("entrada inválida").path())
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "json")
        })
        .collect();
    entries.sort();

    assert!(!entries.is_empty(), "no se encontraron manifests válidos");
    for path in entries {
        let json = fs::read_to_string(&path).expect("no se pudo leer manifest válido");
        let result = validate_manifest(&json);
        assert!(
            result.is_ok(),
            "{} debería ser válido: {result:?}",
            path.display()
        );
    }
}

#[test]
fn invalid_manifests_report_expected_codes() {
    let cases = [
        ("unknown-skill-id.json", "UNKNOWN_TAXONOMY_ID"),
        (
            "evidence-missing-test-group.json",
            "EVIDENCE_GROUP_NOT_FOUND",
        ),
        (
            "adapter-policy-contradiction.json",
            "ADAPTER_POLICY_CONTRADICTION",
        ),
        (
            "unlock-stricter-than-prerequisites.json",
            "UNLOCK_INCONSISTENT",
        ),
        ("weight-out-of-range.json", "VALUE_OUT_OF_RANGE"),
        ("band-score-mismatch.json", "BAND_SCORE_MISMATCH"),
        ("self-reference.json", "SELF_REFERENCE"),
        (
            "entrypoint-not-in-content.json",
            "CONTENT_CONTRACT_VIOLATION",
        ),
        ("order-in-module-zero.json", "ROUTE_METADATA_INVALID"),
        (
            "objective-unknown-skill.json",
            "OBJECTIVE_SKILL_NOT_DECLARED",
        ),
        ("path-traversal.json", "INVALID_CONTENT_PATH"),
        ("schema-missing-required.json", "SCHEMA_VIOLATION"),
    ];
    let directory = contracts_dir().join("invalid");

    for (file_name, expected_code) in cases {
        let path = directory.join(file_name);
        let json = fs::read_to_string(&path).expect("no se pudo leer manifest inválido");
        let errors = validate_manifest(&json).expect_err("el manifest debería ser inválido");
        assert!(
            errors.iter().any(|error| error.code == expected_code),
            "{file_name} debería incluir {expected_code}: {errors:?}"
        );
    }
}
