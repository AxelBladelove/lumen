use std::fs;
use std::path::{Path, PathBuf};

use lumen_engine::manifest::validate_manifest;
use serde_json::Value;

fn activities_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../content/activities")
}

#[test]
fn repo_activities_are_valid_and_complete() {
    let directory = activities_dir();
    let mut found = 0;

    for entry in fs::read_dir(&directory).expect("no se pudo leer content/activities") {
        let activity_dir = entry.expect("entrada inválida").path();
        if !activity_dir.is_dir() {
            continue;
        }

        let manifest_path = activity_dir.join("manifest.json");
        let json = fs::read_to_string(&manifest_path).expect("no se pudo leer manifest.json");
        let result = validate_manifest(&json);
        assert!(
            result.is_ok(),
            "{} debería ser válido: {result:?}",
            manifest_path.display()
        );

        let manifest: Value = serde_json::from_str(&json).expect("manifest válido debería parsear");
        let directory_name = activity_dir
            .file_name()
            .and_then(|name| name.to_str())
            .expect("nombre de directorio inválido");
        assert_eq!(
            manifest.get("id").and_then(Value::as_str),
            Some(directory_name),
            "el directorio de la actividad debe llamarse como su id"
        );

        let mut declared_paths = Vec::new();
        if let Some(content) = manifest.get("content") {
            collect_paths(content, &mut declared_paths);
        }
        assert!(
            !declared_paths.is_empty(),
            "{} no declara archivos de content",
            manifest_path.display()
        );
        for relative in declared_paths {
            assert!(
                activity_dir.join(&relative).is_file(),
                "content path declarado pero ausente: {relative} en {}",
                activity_dir.display()
            );
        }

        found += 1;
    }

    assert!(found >= 1, "no se encontró ninguna actividad en content/");
}

fn collect_paths(value: &Value, paths: &mut Vec<String>) {
    match value {
        Value::Object(object) => {
            if let Some(path) = object.get("path").and_then(Value::as_str) {
                paths.push(path.to_owned());
            }
            for child in object.values() {
                collect_paths(child, paths);
            }
        }
        Value::Array(items) => {
            for child in items {
                collect_paths(child, paths);
            }
        }
        _ => {}
    }
}
