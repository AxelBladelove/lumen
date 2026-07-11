use std::fs;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Path, PathBuf};
use std::time::Instant;

use serde_json::{json, Map, Value};

use crate::compile::{self, CompileFailure};
use crate::esex::{self, EsexError};
use crate::state::StatePatch;
use crate::storage::{Database, ExerciseProgressResult, InstalledActivity};
use crate::testing::{self, IoCaseStatus, RunOptions, TestingError};

const PROTOCOL_VERSION: u64 = 4;
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

enum ActiveExercise {
    None,
    Missing(String),
    Ready {
        activity: InstalledActivity,
        entrypoint_path: PathBuf,
    },
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
            "exercise.runTests" => self.run_exercise_tests(request.id, &request.params),
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
        match self.resolve_active_exercise() {
            Ok(ActiveExercise::None) => success_response(id, json!({ "status": "none" })),
            Ok(ActiveExercise::Missing(exercise_id)) => success_response(
                id,
                json!({ "status": "missing", "exerciseId": exercise_id }),
            ),
            Ok(ActiveExercise::Ready {
                activity,
                entrypoint_path,
            }) => success_response(
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
            ),
            Err(()) => database_error_response(id, "No se pudo resolver el ejercicio activo."),
        }
    }

    fn run_exercise_tests(&mut self, id: String, params: &Value) -> Value {
        if !is_empty_object(params) {
            return invalid_params_response(id);
        }
        let (activity, entrypoint_path) = match self.resolve_active_exercise() {
            Ok(ActiveExercise::Ready {
                activity,
                entrypoint_path,
            }) => (activity, entrypoint_path),
            Ok(ActiveExercise::None) => return no_active_exercise_response(id, None),
            Ok(ActiveExercise::Missing(exercise_id)) => {
                return no_active_exercise_response(id, Some(&exercise_id))
            }
            Err(()) => {
                return database_error_response(id, "No se pudo resolver el ejercicio activo.")
            }
        };
        let started_at = Instant::now();
        if let Err(error) = compile::validate_source(&entrypoint_path) {
            return compile_error_response(id, error);
        }
        let compiler_path = match self.find_compiler() {
            Some(path) => path,
            None => return compile_error_response(id, CompileFailure::toolchain_not_found()),
        };
        let compile_result = match compile::compile_source(&entrypoint_path, &compiler_path) {
            Ok(result) => result,
            Err(error) => return compile_error_response(id, error),
        };
        if compile_result.status == compile::CompileStatus::CompileError {
            let progress = self.record_exercise_attempt(
                &activity,
                "compile_error",
                0,
                0,
                compile_result.duration_ms,
                false,
            );
            let _ = progress;
            let serialized = json!(compile_result);
            return success_response(
                id,
                json!({
                    "status": "compile_error",
                    "diagnostics": serialized["diagnostics"],
                    "rawOutput": serialized["rawOutput"],
                    "durationMs": serialized["durationMs"],
                }),
            );
        }
        let Some(executable_path) = compile_result.executable_path.as_deref() else {
            return error_response(
                Some(id),
                "COMPILER_FAILED",
                "GCC no produjo el ejecutable esperado.",
                true,
            );
        };
        let manifest: Value = match serde_json::from_str(&activity.manifest_json) {
            Ok(manifest) => manifest,
            Err(error) => {
                return tests_invalid_response(
                    id,
                    &[testing_detail(
                        "MANIFEST_INVALID",
                        "manifest.json",
                        format!("El manifest instalado no contiene JSON valido: {error}"),
                    )],
                )
            }
        };
        let tests_path = match test_data_path(&manifest) {
            Some(path) => PathBuf::from(&activity.install_path).join(path),
            None => {
                return tests_invalid_response(
                    id,
                    &[testing_detail(
                        "TEST_DATA_NOT_FOUND",
                        "/content/tests",
                        "El manifest no declara un archivo de tests con role test-data.",
                    )],
                )
            }
        };
        let cases_json = match fs::read_to_string(&tests_path) {
            Ok(content) => content,
            Err(error) => {
                return tests_invalid_response(
                    id,
                    &[testing_detail(
                        "IO_ERROR",
                        tests_path.display().to_string(),
                        format!("No se pudo leer el archivo de tests: {error}"),
                    )],
                )
            }
        };
        let cases = match testing::validate_io_cases(&cases_json, &manifest) {
            Ok(cases) => cases,
            Err(errors) => return tests_invalid_response(id, &testing_errors(&errors)),
        };
        let options = run_options_from_manifest(&manifest);
        let run = testing::run_io_tests(Path::new(executable_path), &cases, &options);
        let duration_ms = elapsed_millis(started_at);
        let status = if run.overall_passed {
            "passed"
        } else {
            "failed"
        };
        let progress = self.record_exercise_attempt(
            &activity,
            status,
            run.passed_count,
            run.results.len(),
            duration_ms,
            run.overall_passed,
        );
        let groups = wire_groups(&manifest, &cases, &run);
        success_response(
            id,
            json!({
                "status": status,
                "exerciseId": activity.activity_id,
                "version": activity.version,
                "casesPassed": run.passed_count,
                "casesTotal": run.results.len(),
                "durationMs": duration_ms,
                "completed": progress.completed,
                "newlyCompleted": progress.newly_completed,
                "groups": groups,
            }),
        )
    }

    fn resolve_active_exercise(&mut self) -> Result<ActiveExercise, ()> {
        let exercise_id = self
            .database
            .get_last_state()
            .map_err(|_| ())?
            .and_then(|state| state.last_exercise_id);
        let Some(exercise_id) = exercise_id else {
            return Ok(ActiveExercise::None);
        };
        let Some(activity) = self
            .database
            .get_latest_activity(&exercise_id)
            .map_err(|_| ())?
        else {
            return Ok(ActiveExercise::Missing(exercise_id));
        };
        let entrypoint_path = PathBuf::from(&activity.install_path).join(&activity.entrypoint);
        if !entrypoint_path.is_file() {
            return Ok(ActiveExercise::Missing(exercise_id));
        }
        Ok(ActiveExercise::Ready {
            activity,
            entrypoint_path,
        })
    }

    fn record_exercise_attempt(
        &mut self,
        activity: &InstalledActivity,
        status: &str,
        cases_passed: usize,
        cases_total: usize,
        duration_ms: u64,
        completed: bool,
    ) -> ExerciseProgressResult {
        let was_completed = self
            .database
            .completed_activity_ids()
            .map(|ids| ids.contains(&activity.activity_id))
            .unwrap_or(false);
        match self.database.record_exercise_attempt(
            &activity.activity_id,
            &activity.version,
            status,
            cases_passed,
            cases_total,
            duration_ms,
            completed,
        ) {
            Ok(progress) => progress,
            Err(error) => {
                eprintln!("No se pudo registrar el intento del ejercicio: {error}");
                ExerciseProgressResult {
                    completed: was_completed,
                    newly_completed: false,
                }
            }
        }
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
        let completed_ids = match self.database.completed_activity_ids() {
            Ok(ids) => ids,
            Err(_) => return database_error_response(id, "No se pudo leer el progreso."),
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
            let status = if completed_ids.contains(&activity.activity_id) {
                "completed"
            } else if active_id.as_deref() == Some(activity.activity_id.as_str()) {
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

fn test_data_path(manifest: &Value) -> Option<&str> {
    manifest
        .pointer("/content/tests")
        .and_then(Value::as_array)?
        .iter()
        .find(|test| test.get("role").and_then(Value::as_str) == Some("test-data"))?
        .get("path")?
        .as_str()
}

fn run_options_from_manifest(manifest: &Value) -> RunOptions {
    let defaults = RunOptions::default();
    RunOptions {
        normalization: manifest
            .pointer("/testContract/normalization")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default(),
        default_timeout_ms: manifest
            .pointer("/testContract/limits/timeLimitMs")
            .and_then(Value::as_u64)
            .unwrap_or(defaults.default_timeout_ms),
        output_limit_kb: manifest
            .pointer("/testContract/limits/outputLimitKb")
            .and_then(Value::as_u64)
            .and_then(|value| usize::try_from(value).ok())
            .unwrap_or(defaults.output_limit_kb),
        expected_exit_code: manifest
            .pointer("/testContract/expectedExitCode")
            .and_then(Value::as_i64)
            .or(defaults.expected_exit_code),
    }
}

fn wire_groups(manifest: &Value, cases: &testing::IoCases, run: &testing::IoTestRun) -> Vec<Value> {
    manifest
        .pointer("/testContract/testGroups")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|group| {
            let group_id = group.get("id").and_then(Value::as_str)?;
            let phase = group.get("phase").and_then(Value::as_str).unwrap_or("");
            let group_results: Vec<_> = run
                .results
                .iter()
                .filter(|result| result.group == group_id)
                .collect();
            let cases_passed = group_results
                .iter()
                .filter(|result| result.status == IoCaseStatus::Passed)
                .count();
            let wire_cases: Vec<_> = group_results
                .into_iter()
                .map(|result| {
                    let mut wire = Map::new();
                    wire.insert("caseId".to_owned(), json!(result.id));
                    wire.insert("status".to_owned(), json!(result.status));
                    wire.insert("durationMs".to_owned(), json!(result.duration_ms));
                    if result.output_truncated {
                        wire.insert("outputTruncated".to_owned(), json!(true));
                    }
                    if phase == "public" {
                        let stdin = cases
                            .cases
                            .iter()
                            .find(|case| case.id == result.id)
                            .map(|case| case.stdin.chars().take(200).collect::<String>())
                            .unwrap_or_default();
                        wire.insert("stdinPreview".to_owned(), json!(stdin));
                        wire.insert(
                            "expected".to_owned(),
                            json!(result.expected_stdout_normalized),
                        );
                        wire.insert(
                            "observed".to_owned(),
                            json!(result.actual_stdout_normalized),
                        );
                    }
                    Value::Object(wire)
                })
                .collect();
            Some(json!({
                "groupId": group_id,
                "phase": phase,
                "casesPassed": cases_passed,
                "casesTotal": wire_cases.len(),
                "cases": wire_cases,
            }))
        })
        .collect()
}

fn testing_errors(errors: &[TestingError]) -> Vec<Value> {
    errors
        .iter()
        .map(|error| testing_detail(&error.code, &error.path, &error.message))
        .collect()
}

fn testing_detail(code: &str, path: impl AsRef<str>, message: impl AsRef<str>) -> Value {
    json!({
        "code": code,
        "path": path.as_ref(),
        "message": message.as_ref(),
    })
}

fn elapsed_millis(started_at: Instant) -> u64 {
    u64::try_from(started_at.elapsed().as_millis()).unwrap_or(u64::MAX)
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

fn no_active_exercise_response(id: String, exercise_id: Option<&str>) -> Value {
    match exercise_id {
        Some(exercise_id) => error_response_with_details(
            Some(id),
            "NO_ACTIVE_EXERCISE",
            "No hay un ejercicio activo instalado y disponible.",
            true,
            vec![testing_detail(
                "NO_ACTIVE_EXERCISE",
                exercise_id,
                "El ejercicio activo no esta instalado o su entrypoint no existe.",
            )],
        ),
        None => error_response(
            Some(id),
            "NO_ACTIVE_EXERCISE",
            "No hay un ejercicio activo instalado y disponible.",
            true,
        ),
    }
}

fn tests_invalid_response(id: String, details: &[Value]) -> Value {
    error_response_with_details(
        Some(id),
        "TESTS_INVALID",
        "El archivo de tests instalado no supera la validacion.",
        true,
        details.to_vec(),
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
