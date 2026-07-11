use std::fs;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Path, PathBuf};

use serde_json::{json, Map, Value};

use crate::compile::{self, CompileFailure};
use crate::esex::{self, EsexError};
use crate::state::StatePatch;
use crate::storage::{Database, InstalledActivity};

const PROTOCOL_VERSION: u64 = 3;
const ENGINE_VERSION: &str = "0.1.0";
const PACKAGE_SHA_FILE: &str = ".package-sha256";

pub(crate) struct Engine {
    database: Database,
    activities_root: PathBuf,
}

struct Request {
    id: String,
    method: String,
    params: Value,
}

impl Engine {
    pub(crate) fn new(data_dir: &Path) -> Self {
        Self {
            database: Database::initialize(data_dir),
            activities_root: data_dir.join("activities"),
        }
    }

    pub(crate) fn handle_line(&mut self, line: &str) -> Value {
        let request = match parse_request(line) {
            Ok(request) => request,
            Err(()) => return invalid_request_response(),
        };
        let request_id = request.id.clone();

        match catch_unwind(AssertUnwindSafe(|| self.dispatch(request))) {
            Ok(response) => response,
            Err(_) => {
                eprintln!("Fallo interno inesperado procesando request {request_id}");
                error_response(
                    Some(request_id),
                    "UNKNOWN_ERROR",
                    "Ocurrio un error interno.",
                    false,
                )
            }
        }
    }

    fn dispatch(&mut self, request: Request) -> Value {
        match request.method.as_str() {
            "engine.healthCheck" => self.health_check(request.id, &request.params),
            "session.getLastState" => self.get_last_state(request.id, &request.params),
            "session.saveLastState" => self.save_last_state(request.id, &request.params),
            "exercise.compile" => self.compile_exercise(request.id, &request.params),
            "exercise.import" => self.import_exercise(request.id, &request.params),
            "exercise.getActive" => self.get_active_exercise(request.id, &request.params),
            "route.getModuleSnapshot" => self.get_module_snapshot(request.id, &request.params),
            "toolchain.check" => self.check_toolchain(request.id, &request.params),
            _ => error_response(
                Some(request.id),
                "UNKNOWN_METHOD",
                "Metodo no registrado.",
                true,
            ),
        }
    }

    fn health_check(&self, id: String, params: &Value) -> Value {
        if !is_empty_object(params) {
            return invalid_params_response(id);
        }

        let mut result = Map::new();
        result.insert("protocolVersion".to_owned(), json!(PROTOCOL_VERSION));
        result.insert("engineVersion".to_owned(), json!(ENGINE_VERSION));
        result.insert(
            "dbPath".to_owned(),
            json!(self.database.path().to_string_lossy()),
        );

        match self.database.error() {
            None => {
                result.insert("dbStatus".to_owned(), json!("ready"));
            }
            Some(error) => {
                result.insert("dbStatus".to_owned(), json!("error"));
                result.insert("dbError".to_owned(), json!(error));
            }
        }

        success_response(id, Value::Object(result))
    }

    fn get_last_state(&mut self, id: String, params: &Value) -> Value {
        if !is_empty_object(params) {
            return invalid_params_response(id);
        }

        match self.database.get_last_state() {
            Ok(state) => success_response(id, json!({ "state": state })),
            Err(_) => error_response(
                Some(id),
                "DATABASE_ERROR",
                "No se pudo leer el estado.",
                true,
            ),
        }
    }

    fn save_last_state(&mut self, id: String, params: &Value) -> Value {
        let patch = match StatePatch::from_params(params) {
            Ok(patch) => patch,
            Err(()) => return invalid_params_response(id),
        };

        match self.database.save_last_state(&patch) {
            Ok(state) => success_response(id, json!({ "state": state })),
            Err(_) => error_response(
                Some(id),
                "DATABASE_ERROR",
                "No se pudo escribir el estado.",
                true,
            ),
        }
    }

    fn compile_exercise(&mut self, id: String, params: &Value) -> Value {
        let source_path = match parse_source_path(params) {
            Ok(source_path) => source_path,
            Err(()) => return invalid_params_response(id),
        };

        if let Err(error) = compile::validate_source(&source_path) {
            return compile_error_response(id, error);
        }

        let compiler_path = match self.find_compiler() {
            Some(compiler_path) => compiler_path,
            None => return compile_error_response(id, CompileFailure::toolchain_not_found()),
        };

        let result = match compile::compile_source(&source_path, &compiler_path) {
            Ok(result) => result,
            Err(error) => return compile_error_response(id, error),
        };

        if let Err(error) = self.database.record_compile_attempt(
            &source_path.to_string_lossy(),
            result.status.as_str(),
            result.error_count(),
            result.warning_count(),
            result.duration_ms,
            &compiler_path.to_string_lossy(),
        ) {
            eprintln!("No se pudo registrar el intento de compilacion: {error}");
        }

        success_response(id, json!(result))
    }

    fn check_toolchain(&mut self, id: String, params: &Value) -> Value {
        if !is_empty_object(params) {
            return invalid_params_response(id);
        }

        let Some(compiler_path) = self.find_compiler() else {
            return success_response(
                id,
                json!({
                    "status": "missing",
                    "compilerPath": null,
                    "compilerVersion": null,
                    "hint": "Instala MSYS2 UCRT64 y agrega GCC al PATH."
                }),
            );
        };

        let Some(compiler_version) = compile::compiler_version(&compiler_path) else {
            return success_response(
                id,
                json!({
                    "status": "missing",
                    "compilerPath": null,
                    "compilerVersion": null,
                    "hint": "Instala MSYS2 UCRT64 y agrega GCC al PATH."
                }),
            );
        };

        success_response(
            id,
            json!({
                "status": "ready",
                "compilerPath": compiler_path.to_string_lossy(),
                "compilerVersion": compiler_version,
            }),
        )
    }

    fn import_exercise(&mut self, id: String, params: &Value) -> Value {
        let esex_path = match parse_esex_path(params) {
            Ok(path) => path,
            Err(()) => return invalid_params_response(id),
        };
        if self.database.error().is_some() {
            return database_error_response(id, "No se pudo registrar la actividad.");
        }

        match esex::import_esex(&esex_path, &self.activities_root) {
            Ok(imported) => {
                let activity = match activity_from_installed_manifest(
                    &imported.install_path,
                    &imported.package_sha256,
                ) {
                    Ok(activity) => activity,
                    Err(errors) => return import_failed_response(id, &errors),
                };
                let previously_registered = match self
                    .database
                    .get_installed_activity(&activity.activity_id, &activity.version)
                {
                    Ok(activity) => activity,
                    Err(_) => return database_error_response(id, "No se pudo leer la actividad."),
                };
                if previously_registered
                    .as_ref()
                    .is_some_and(|registered| registered.package_sha256 != imported.package_sha256)
                {
                    if let Err(error) = fs::remove_dir_all(&imported.install_path) {
                        eprintln!(
                            "No se pudo retirar la instalacion rechazada por conflicto: {error}"
                        );
                    }
                    return import_conflict_response(id);
                }
                let already_installed = previously_registered.is_some();
                if let Err(error) = fs::write(
                    imported.install_path.join(PACKAGE_SHA_FILE),
                    &imported.package_sha256,
                ) {
                    eprintln!("No se pudo guardar el sha del paquete instalado: {error}");
                }
                if self.database.register_activity(&activity).is_err() {
                    return database_error_response(id, "No se pudo registrar la actividad.");
                }
                import_success_response(id, &activity, already_installed)
            }
            Err(errors) => {
                let Some(installed_path) = already_installed_path(&errors) else {
                    return import_failed_response(id, &errors);
                };
                self.handle_reimport(id, &esex_path, &installed_path)
            }
        }
    }

    fn handle_reimport(&mut self, id: String, esex_path: &Path, install_path: &Path) -> Value {
        let package_sha256 = match esex::hash_file(esex_path) {
            Ok((sha, _)) => sha,
            Err(message) => {
                return import_failed_response(
                    id,
                    &[EsexError {
                        code: "IO_ERROR".to_owned(),
                        path: esex_path.display().to_string(),
                        message,
                    }],
                )
            }
        };
        let activity = match activity_from_installed_manifest(install_path, &package_sha256) {
            Ok(activity) => activity,
            Err(errors) => return import_failed_response(id, &errors),
        };
        let registered = match self
            .database
            .get_installed_activity(&activity.activity_id, &activity.version)
        {
            Ok(activity) => activity,
            Err(_) => return database_error_response(id, "No se pudo leer la actividad."),
        };
        let installed_sha = registered
            .as_ref()
            .map(|row| row.package_sha256.clone())
            .or_else(|| read_installed_sha(install_path));
        if installed_sha.is_none() {
            match esex::package_matches_installation(esex_path, install_path) {
                Ok(true) => {}
                Ok(false) => return import_conflict_response(id),
                Err(message) => {
                    return import_failed_response(
                        id,
                        &[EsexError {
                            code: "IO_ERROR".to_owned(),
                            path: esex_path.display().to_string(),
                            message,
                        }],
                    )
                }
            }
        }
        if installed_sha
            .as_deref()
            .is_some_and(|sha| sha != package_sha256)
        {
            return import_conflict_response(id);
        }
        if let Err(error) = fs::write(install_path.join(PACKAGE_SHA_FILE), &package_sha256) {
            eprintln!("No se pudo guardar el sha del paquete instalado: {error}");
        }
        if self.database.register_activity(&activity).is_err() {
            return database_error_response(id, "No se pudo registrar la actividad.");
        }
        import_success_response(id, &activity, true)
    }

    fn get_active_exercise(&mut self, id: String, params: &Value) -> Value {
        if !is_empty_object(params) {
            return invalid_params_response(id);
        }
        let exercise_id = match self.database.get_last_state() {
            Ok(Some(state)) => state.last_exercise_id,
            Ok(None) => None,
            Err(_) => return database_error_response(id, "No se pudo leer el estado."),
        };
        let Some(exercise_id) = exercise_id else {
            return success_response(id, json!({ "status": "none" }));
        };
        let activity = match self.database.get_latest_activity(&exercise_id) {
            Ok(Some(activity)) => activity,
            Ok(None) => {
                return success_response(
                    id,
                    json!({ "status": "missing", "exerciseId": exercise_id }),
                )
            }
            Err(_) => return database_error_response(id, "No se pudo leer la actividad."),
        };
        let entrypoint_path = PathBuf::from(&activity.install_path).join(&activity.entrypoint);
        if !entrypoint_path.is_file() {
            return success_response(
                id,
                json!({ "status": "missing", "exerciseId": exercise_id }),
            );
        }
        success_response(
            id,
            json!({
                "status": "ready",
                "active": {
                    "exerciseId": activity.activity_id,
                    "version": activity.version,
                    "installPath": activity.install_path,
                    "entrypointPath": entrypoint_path,
                    "title": activity.title,
                    "routeId": activity.route_id,
                    "moduleId": activity.module_id,
                    "nodeType": activity.node_type,
                }
            }),
        )
    }

    fn get_module_snapshot(&mut self, id: String, params: &Value) -> Value {
        let (route_id, module_id) = match parse_module_params(params) {
            Ok(values) => values,
            Err(()) => return invalid_params_response(id),
        };
        let active_id = match self.database.get_last_state() {
            Ok(Some(state)) => state.last_exercise_id,
            Ok(None) => None,
            Err(_) => return database_error_response(id, "No se pudo leer el estado."),
        };
        let activities = match self.database.get_module_activities(&route_id, &module_id) {
            Ok(activities) => activities,
            Err(_) => return database_error_response(id, "No se pudo leer el modulo."),
        };
        let installed_active = active_id
            .as_ref()
            .filter(|active| activities.iter().any(|item| &item.activity_id == *active))
            .cloned();
        let mut nodes = Vec::with_capacity(activities.len());
        for activity in activities {
            let primary_topics: Value = match serde_json::from_str(&activity.primary_topics) {
                Ok(value) => value,
                Err(error) => {
                    eprintln!("primary_topics invalido en SQLite: {error}");
                    return database_error_response(id, "No se pudo leer el modulo.");
                }
            };
            let status = if active_id.as_deref() == Some(activity.activity_id.as_str()) {
                "active"
            } else {
                "locked"
            };
            nodes.push(json!({
                "exerciseId": activity.activity_id,
                "title": activity.title,
                "primaryTopics": primary_topics,
                "nodeType": activity.node_type,
                "orderInModule": activity.order_in_module,
                "status": status,
            }));
        }
        success_response(
            id,
            json!({
                "snapshot": {
                    "routeId": route_id,
                    "moduleId": module_id,
                    "activeExerciseId": installed_active,
                    "nodes": nodes,
                }
            }),
        )
    }

    fn find_compiler(&mut self) -> Option<PathBuf> {
        let cached_path = match self.database.get_setting("toolchain.gcc.path") {
            Ok(path) => path,
            Err(error) => {
                eprintln!("No se pudo leer el cache de GCC: {error}");
                None
            }
        };
        let compiler_path = compile::discover_gcc(cached_path.as_deref())?;

        if let Err(error) = self
            .database
            .save_setting("toolchain.gcc.path", &compiler_path.to_string_lossy())
        {
            eprintln!("No se pudo guardar el cache de GCC: {error}");
        }

        Some(compiler_path)
    }
}

pub(crate) fn invalid_utf8_response() -> Value {
    invalid_request_response()
}

fn parse_request(line: &str) -> Result<Request, ()> {
    let value: Value = serde_json::from_str(line).map_err(|_| ())?;
    let object = value.as_object().ok_or(())?;

    let id = object
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
        .ok_or(())?
        .to_owned();
    let method = object
        .get("method")
        .and_then(Value::as_str)
        .ok_or(())?
        .to_owned();
    let params = object
        .get("params")
        .cloned()
        .unwrap_or_else(|| Value::Object(Map::new()));

    Ok(Request { id, method, params })
}

fn is_empty_object(value: &Value) -> bool {
    value.as_object().is_some_and(Map::is_empty)
}

fn parse_source_path(params: &Value) -> Result<PathBuf, ()> {
    let fields = params.as_object().ok_or(())?;
    if fields.len() != 1 {
        return Err(());
    }

    let source_path = fields
        .get("sourcePath")
        .and_then(Value::as_str)
        .filter(|source_path| !source_path.is_empty())
        .map(PathBuf::from)
        .ok_or(())?;

    if !source_path.is_absolute() {
        return Err(());
    }

    Ok(source_path)
}

fn parse_esex_path(params: &Value) -> Result<PathBuf, ()> {
    parse_absolute_path_param(params, "esexPath")
}

fn parse_absolute_path_param(params: &Value, key: &str) -> Result<PathBuf, ()> {
    let fields = params.as_object().ok_or(())?;
    if fields.len() != 1 {
        return Err(());
    }
    let path = fields
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .ok_or(())?;
    path.is_absolute().then_some(path).ok_or(())
}

fn parse_module_params(params: &Value) -> Result<(String, String), ()> {
    let fields = params.as_object().ok_or(())?;
    if fields.len() != 2 {
        return Err(());
    }
    let required = |key: &str| {
        fields
            .get(key)
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
            .ok_or(())
    };
    Ok((required("routeId")?, required("moduleId")?))
}

fn already_installed_path(errors: &[EsexError]) -> Option<PathBuf> {
    errors
        .iter()
        .find(|error| error.code == "ALREADY_INSTALLED")
        .map(|error| PathBuf::from(&error.path))
}

fn read_installed_sha(install_path: &Path) -> Option<String> {
    fs::read_to_string(install_path.join(PACKAGE_SHA_FILE))
        .ok()
        .map(|sha| sha.trim().to_owned())
        .filter(|sha| !sha.is_empty())
}

fn activity_from_installed_manifest(
    install_path: &Path,
    package_sha256: &str,
) -> Result<InstalledActivity, Vec<EsexError>> {
    let manifest_path = install_path.join("manifest.json");
    let manifest_json = fs::read_to_string(&manifest_path).map_err(|error| {
        vec![EsexError {
            code: "IO_ERROR".to_owned(),
            path: manifest_path.display().to_string(),
            message: format!("No se pudo leer el manifest instalado: {error}"),
        }]
    })?;
    let manifest: Value = serde_json::from_str(&manifest_json).map_err(|error| {
        vec![EsexError {
            code: "MANIFEST_INVALID".to_owned(),
            path: "manifest.json".to_owned(),
            message: format!("El manifest instalado no contiene JSON valido: {error}"),
        }]
    })?;
    let required = |pointer: &str| {
        manifest
            .pointer(pointer)
            .and_then(Value::as_str)
            .map(str::to_owned)
            .ok_or_else(|| {
                vec![EsexError {
                    code: "MANIFEST_INVALID".to_owned(),
                    path: pointer.to_owned(),
                    message: format!("Falta el campo requerido {pointer}."),
                }]
            })
    };
    let route_eligible = manifest
        .pointer("/route/routeEligible")
        .and_then(Value::as_bool)
        == Some(true);
    let route_string = |pointer: &str| {
        route_eligible
            .then(|| {
                manifest
                    .pointer(pointer)
                    .and_then(Value::as_str)
                    .map(str::to_owned)
            })
            .flatten()
    };
    let primary_topics = manifest
        .get("primaryTopics")
        .cloned()
        .unwrap_or_else(|| json!([]));
    Ok(InstalledActivity {
        activity_id: required("/id")?,
        version: required("/version")?,
        title: required("/title")?,
        entrypoint: required("/execution/entrypoint")?,
        install_path: install_path.to_string_lossy().into_owned(),
        package_sha256: package_sha256.to_owned(),
        route_id: route_string("/route/routeId"),
        module_id: route_string("/route/moduleId"),
        order_in_module: route_eligible
            .then(|| {
                manifest
                    .pointer("/route/orderInModule")
                    .and_then(Value::as_i64)
            })
            .flatten(),
        node_type: route_string("/route/nodeType"),
        primary_topics: serde_json::to_string(&primary_topics).map_err(|error| {
            vec![EsexError {
                code: "MANIFEST_INVALID".to_owned(),
                path: "/primaryTopics".to_owned(),
                message: format!("No se pudo serializar primaryTopics: {error}"),
            }]
        })?,
        manifest_json,
    })
}

fn invalid_request_response() -> Value {
    error_response(None, "INVALID_REQUEST", "La solicitud no es valida.", true)
}

fn invalid_params_response(id: String) -> Value {
    error_response(
        Some(id),
        "INVALID_PARAMS",
        "Los parametros no cumplen el contrato del metodo.",
        true,
    )
}

fn compile_error_response(id: String, error: CompileFailure) -> Value {
    error_response(Some(id), error.code, error.message, error.recoverable)
}

fn database_error_response(id: String, message: &str) -> Value {
    error_response(Some(id), "DATABASE_ERROR", message, true)
}

fn import_failed_response(id: String, errors: &[EsexError]) -> Value {
    let details: Vec<Value> = errors
        .iter()
        .map(|error| {
            json!({
                "code": error.code,
                "path": error.path,
                "message": error.message,
            })
        })
        .collect();
    error_response_with_details(
        Some(id),
        "IMPORT_FAILED",
        "El paquete no supero la validacion.",
        true,
        details,
    )
}

fn import_conflict_response(id: String) -> Value {
    error_response(
        Some(id),
        "IMPORT_CONFLICT",
        "La actividad y version ya existen con otro sha256.",
        true,
    )
}

fn import_success_response(id: String, activity: &InstalledActivity, already: bool) -> Value {
    success_response(
        id,
        json!({
            "activityId": activity.activity_id,
            "version": activity.version,
            "installPath": activity.install_path,
            "packageSha256": activity.package_sha256,
            "alreadyInstalled": already,
            "activity": {
                "title": activity.title,
                "routeId": activity.route_id,
                "moduleId": activity.module_id,
                "orderInModule": activity.order_in_module,
                "nodeType": activity.node_type,
            }
        }),
    )
}

fn success_response(id: String, result: Value) -> Value {
    json!({
        "id": id,
        "ok": true,
        "result": result,
    })
}

fn error_response(id: Option<String>, code: &str, message: &str, recoverable: bool) -> Value {
    json!({
        "id": id,
        "ok": false,
        "error": {
            "code": code,
            "message": message,
            "recoverable": recoverable,
        }
    })
}

fn error_response_with_details(
    id: Option<String>,
    code: &str,
    message: &str,
    recoverable: bool,
    details: Vec<Value>,
) -> Value {
    json!({
        "id": id,
        "ok": false,
        "error": {
            "code": code,
            "message": message,
            "recoverable": recoverable,
            "details": details,
        }
    })
}
