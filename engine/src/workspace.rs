use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};

use serde_json::{json, Value};

use crate::storage::InstalledActivity;

pub(crate) struct MaterializedWorkspace {
    pub root: PathBuf,
    pub entrypoint: PathBuf,
    pub created: bool,
}

pub(crate) fn materialize(
    activity: &InstalledActivity,
    mode: &str,
    workspace_root: &Path,
) -> Result<MaterializedWorkspace, String> {
    if !workspace_root.is_absolute() || !matches!(mode, "route" | "free") {
        return Err("INVALID_PARAMS".to_owned());
    }
    validate_component(&activity.activity_id)?;
    validate_component(&activity.version)?;

    let manifest: Value = serde_json::from_str(&activity.manifest_json)
        .map_err(|error| format!("El manifest instalado no contiene JSON valido: {error}"))?;
    let installed_root = Path::new(&activity.install_path);
    let root = workspace_root
        .join("workspaces")
        .join(mode)
        .join(&activity.activity_id)
        .join(&activity.version);
    fs::create_dir_all(&root)
        .map_err(|error| format!("No se pudo crear la copia de trabajo: {error}"))?;

    let starters = manifest
        .pointer("/content/starter")
        .and_then(Value::as_array)
        .ok_or_else(|| "El manifest no declara archivos starter.".to_owned())?;
    let mut created = false;
    for starter in starters
        .iter()
        .filter(|starter| starter.get("editable").and_then(Value::as_bool) == Some(true))
    {
        let relative = starter
            .get("path")
            .and_then(Value::as_str)
            .ok_or_else(|| "Un starter no declara path.".to_owned())?;
        let relative = safe_relative_path(relative)?;
        let source = installed_root.join(&relative);
        let destination = root.join(&relative);
        let parent = destination
            .parent()
            .ok_or_else(|| "El starter no tiene directorio padre valido.".to_owned())?;
        fs::create_dir_all(parent)
            .map_err(|error| format!("No se pudo crear el directorio del starter: {error}"))?;
        match copy_create_new(&source, &destination) {
            Ok(true) => created = true,
            Ok(false) => {}
            Err(error) => {
                return Err(format!(
                    "No se pudo materializar '{}': {error}",
                    relative.display()
                ))
            }
        }
    }

    let entrypoint_relative = safe_relative_path(&activity.entrypoint)?;
    let entrypoint = root.join(&entrypoint_relative);
    if !entrypoint.is_file() {
        return Err(format!(
            "La copia de trabajo no contiene el entrypoint '{}'.",
            entrypoint_relative.display()
        ));
    }

    let metadata = root.join(".lumen-exercise.json");
    let metadata_value = json!({
        "activityId": activity.activity_id,
        "version": activity.version,
        "mode": mode,
        "packageSha256": activity.package_sha256,
    });
    if write_json_create_new(&metadata, &metadata_value)? {
        created = true;
    }

    Ok(MaterializedWorkspace {
        root,
        entrypoint,
        created,
    })
}

fn validate_component(value: &str) -> Result<(), String> {
    let path = Path::new(value);
    let mut components = path.components();
    if value.is_empty()
        || !matches!(components.next(), Some(Component::Normal(_)))
        || components.next().is_some()
    {
        return Err("La identidad de la actividad no es un componente seguro.".to_owned());
    }
    Ok(())
}

fn safe_relative_path(value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value);
    if value.is_empty()
        || path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(format!("Path relativo inseguro: {value}"));
    }
    Ok(path.to_path_buf())
}

fn copy_create_new(source: &Path, destination_path: &Path) -> io::Result<bool> {
    let mut source = fs::File::open(source)?;
    let mut destination = match OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination_path)
    {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => return Ok(false),
        Err(error) => return Err(error),
    };
    let result = io::copy(&mut source, &mut destination).and_then(|_| destination.flush());
    if let Err(error) = result {
        drop(destination);
        let _ = fs::remove_file(destination_path);
        return Err(error);
    }
    Ok(true)
}

fn write_json_create_new(path: &Path, value: &Value) -> Result<bool, String> {
    let mut file = match OpenOptions::new().write(true).create_new(true).open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => return Ok(false),
        Err(error) => return Err(format!("No se pudo crear metadata de workspace: {error}")),
    };
    let result = serde_json::to_writer_pretty(&mut file, value)
        .map_err(|error| format!("No se pudo serializar metadata de workspace: {error}"))
        .and_then(|_| {
            file.write_all(b"\n")
                .map_err(|error| format!("No se pudo completar metadata de workspace: {error}"))
        });
    if let Err(error) = result {
        drop(file);
        let _ = fs::remove_file(path);
        return Err(error);
    }
    Ok(true)
}
