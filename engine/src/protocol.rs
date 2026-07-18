use std::fs;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Component, Path, PathBuf};
use std::time::Instant;

use serde::Deserialize;
use serde_json::{json, Map, Value};

use crate::compile::{self, CompileFailure};
use crate::esex::{self, EsexError};
use crate::state::StatePatch;
use crate::storage::{Database, ExerciseProgressResult, InstalledActivity};
use crate::testing::{self, IoCaseStatus, RunOptions, TestingError};
use crate::workspace;

const PROTOCOL_VERSION: u64 = 7;
const ENGINE_VERSION: &str = "0.1.0";
const PACKAGE_SHA_FILE: &str = ".package-sha256";

pub(crate) struct Engine {
    database: Database,
    activities_root: PathBuf,
    install_root: Option<PathBuf>,
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
        activity: Box<InstalledActivity>,
        workspace_path: PathBuf,
        entrypoint_path: PathBuf,
    },
}

#[derive(Clone, Copy)]
enum ActivityStatus {
    Active,
    Completed,
}

impl ActivityStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Completed => "completed",
        }
    }
}

enum ActivityLookupError {
    NotFound,
    Locked,
    Database,
}

impl Engine {
    pub(crate) fn new(data_dir: &Path) -> Self {
        Self {
            database: Database::initialize(data_dir),
            activities_root: data_dir.join("activities"),
            install_root: std::env::current_dir().ok(),
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
            "exercise.activate" => self.activate_exercise(request.id, &request.params),
            "exercise.getDetail" => self.get_exercise_detail(request.id, &request.params),
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
                    Err(errors) => {
                        if let Err(error) = fs::remove_dir_all(&imported.install_path) {
                            eprintln!("No se pudo retirar la importacion rechazada: {error}");
                        }
                        return import_failed_response(id, &errors);
                    }
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
                workspace_path,
                entrypoint_path,
            }) => success_response(
                id,
                json!({
                    "status": "ready",
                    "active": {
                        "exerciseId": activity.activity_id,
                        "version": activity.version,
                        "installPath": activity.install_path,
                        "workspacePath": workspace_path,
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

    fn get_exercise_detail(&mut self, id: String, params: &Value) -> Value {
        let exercise_id = match parse_exercise_id(params) {
            Ok(exercise_id) => exercise_id,
            Err(()) => return invalid_params_response(id),
        };
        let activity = match self.resolve_installed_activity(&exercise_id) {
            Ok(activity) => activity,
            Err(error) => return activity_lookup_error_response(id, error),
        };
        let status = match self.activity_status(&activity) {
            Ok(status) => status,
            Err(error) => return activity_lookup_error_response(id, error),
        };
        let manifest: Value = match serde_json::from_str(&activity.manifest_json) {
            Ok(manifest) => manifest,
            Err(error) => {
                return content_error_response(
                    id,
                    format!("El manifest instalado no contiene JSON valido: {error}"),
                )
            }
        };
        let content = match exercise_detail_content(&activity, &manifest) {
            Ok(content) => content,
            Err(message) => return content_error_response(id, message),
        };
        let progress = match self
            .database
            .exercise_detail_progress(&activity.activity_id)
        {
            Ok(progress) => progress,
            Err(_) => return database_error_response(id, "No se pudo leer el progreso."),
        };
        success_response(
            id,
            json!({
                "detail": {
                    "exerciseId": activity.activity_id,
                    "version": activity.version,
                    "title": activity.title,
                    "summary": content.summary,
                    "statementMarkdown": content.statement_markdown,
                    "hints": content.hints,
                    "status": status.as_str(),
                    "nodeType": content.node_type,
                    "primaryTopics": content.primary_topics,
                    "difficulty": {
                        "band": content.difficulty_band,
                        "score": content.difficulty_score,
                        "expectedMinutes": content.expected_minutes,
                    },
                    "progress": {
                        "completed": progress.completed,
                        "attempts": {
                            "total": progress.attempts_total,
                            "passed": progress.attempts_passed,
                            "lastRunAt": progress.last_run_at,
                        }
                    }
                }
            }),
        )
    }

    fn activate_exercise(&mut self, id: String, params: &Value) -> Value {
        let (exercise_id, mode, workspace_root) = match parse_activate_params(params) {
            Ok(values) => values,
            Err(()) => return invalid_params_response(id),
        };
        let activity = match self.resolve_installed_activity(&exercise_id) {
            Ok(activity) => activity,
            Err(error) => return activity_lookup_error_response(id, error),
        };

        if mode == "route" {
            if activity.route_id.is_none() || activity.module_id.is_none() {
                return error_response(
                    Some(id),
                    "ACTIVITY_UNSUPPORTED",
                    "La actividad no pertenece a una ruta.",
                    true,
                );
            }
            if let Err(error) = self.activity_status(&activity) {
                return activity_lookup_error_response(id, error);
            }
        }

        let materialized = match workspace::materialize(&activity, &mode, &workspace_root) {
            Ok(materialized) => materialized,
            Err(message) => {
                return error_response_with_details(
                    Some(id),
                    "WORKSPACE_ERROR",
                    "No se pudo preparar la copia editable del ejercicio.",
                    true,
                    vec![testing_detail(
                        "WORKSPACE_ERROR",
                        workspace_root.display().to_string(),
                        message,
                    )],
                )
            }
        };
        if self
            .database
            .activate_exercise(
                &activity,
                &mode,
                &materialized.root,
                &materialized.entrypoint,
            )
            .is_err()
        {
            return database_error_response(id, "No se pudo activar el ejercicio.");
        }
        success_response(
            id,
            json!({
                "created": materialized.created,
                "active": active_exercise_json(&activity, &materialized.root, &materialized.entrypoint),
            }),
        )
    }

    fn run_exercise_tests(&mut self, id: String, params: &Value) -> Value {
        if !is_empty_object(params) {
            return invalid_params_response(id);
        }
        let (activity, entrypoint_path) = match self.resolve_active_exercise() {
            Ok(ActiveExercise::Ready {
                activity,
                workspace_path: _,
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

    fn resolve_installed_activity(
        &mut self,
        exercise_id: &str,
    ) -> Result<InstalledActivity, ActivityLookupError> {
        self.database
            .get_latest_activity(exercise_id)
            .map_err(|_| ActivityLookupError::Database)?
            .ok_or(ActivityLookupError::NotFound)
    }

    fn activity_status(
        &mut self,
        activity: &InstalledActivity,
    ) -> Result<ActivityStatus, ActivityLookupError> {
        let completed = self
            .database
            .completed_activity_ids()
            .map_err(|_| ActivityLookupError::Database)?;
        if completed.contains(&activity.activity_id) {
            return Ok(ActivityStatus::Completed);
        }
        let (Some(route_id), Some(module_id)) =
            (activity.route_id.as_deref(), activity.module_id.as_deref())
        else {
            return Ok(ActivityStatus::Active);
        };
        let module = self
            .database
            .get_module_activities(route_id, module_id)
            .map_err(|_| ActivityLookupError::Database)?;
        let recommended = module
            .iter()
            .find(|candidate| !completed.contains(&candidate.activity_id));
        if recommended.is_some_and(|candidate| candidate.activity_id == activity.activity_id) {
            Ok(ActivityStatus::Active)
        } else {
            Err(ActivityLookupError::Locked)
        }
    }

    fn resolve_active_exercise(&mut self) -> Result<ActiveExercise, ()> {
        if let Some(active) = self.database.get_active_exercise().map_err(|_| ())? {
            let Some(activity) = self
                .database
                .get_installed_activity(&active.activity_id, &active.version)
                .map_err(|_| ())?
            else {
                return Ok(ActiveExercise::Missing(active.activity_id));
            };
            let workspace_path = PathBuf::from(active.workspace_path);
            let entrypoint_path = PathBuf::from(active.entrypoint_path);
            if !entrypoint_path.is_file() || !entrypoint_path.starts_with(&workspace_path) {
                return Ok(ActiveExercise::Missing(activity.activity_id));
            }
            return Ok(ActiveExercise::Ready {
                activity: Box::new(activity),
                workspace_path,
                entrypoint_path,
            });
        }

        // Compatibility for v3/v4 callers that only persisted lastExerciseId.
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
            workspace_path: PathBuf::from(&activity.install_path),
            activity: Box::new(activity),
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
        let metadata =
            match read_module_metadata(self.install_root.as_deref(), &route_id, &module_id) {
                Ok(metadata) => metadata,
                Err(message) => return content_error_response(id, message),
            };
        let activities = match self.database.get_module_activities(&route_id, &module_id) {
            Ok(activities) => activities,
            Err(_) => return database_error_response(id, "No se pudo leer el modulo."),
        };
        let completed_ids = match self.database.completed_activity_ids() {
            Ok(ids) => ids,
            Err(_) => return database_error_response(id, "No se pudo leer el progreso."),
        };
        let recommended_id = activities
            .iter()
            .find(|activity| !completed_ids.contains(&activity.activity_id))
            .map(|activity| activity.activity_id.clone());
        let completed = activities
            .iter()
            .filter(|activity| completed_ids.contains(&activity.activity_id))
            .count();
        let next_exercise = activities
            .iter()
            .find(|activity| recommended_id.as_deref() == Some(activity.activity_id.as_str()))
            .map(|activity| {
                json!({
                    "exerciseId": activity.activity_id,
                    "title": activity.title,
                })
            });
        let total = activities.len();
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
            } else if recommended_id.as_deref() == Some(activity.activity_id.as_str()) {
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
                    "activeExerciseId": recommended_id,
                    "module": {
                        "routeId": metadata.route_id,
                        "moduleId": metadata.module_id,
                        "moduleNumber": metadata.module_number,
                        "routeTitle": metadata.route_title,
                        "title": metadata.title,
                        "subtitle": metadata.subtitle,
                    },
                    "progress": {
                        "completed": completed,
                        "total": total,
                    },
                    "nextExercise": next_exercise,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ModuleMetadata {
    schema_version: u64,
    route_id: String,
    module_id: String,
    module_number: u64,
    route_title: String,
    title: String,
    subtitle: String,
}

fn read_module_metadata(
    install_root: Option<&Path>,
    route_id: &str,
    module_id: &str,
) -> Result<ModuleMetadata, String> {
    let install_root =
        install_root.ok_or_else(|| "No se pudo resolver el install path de Lumen.".to_owned())?;
    let metadata_path = install_root
        .join("content")
        .join("modules")
        .join(route_id)
        .join(module_id)
        .join("module.json");
    let metadata_json = fs::read_to_string(&metadata_path).map_err(|error| {
        format!(
            "No se pudo leer la metadata del modulo en {}: {error}",
            metadata_path.display()
        )
    })?;
    let metadata: ModuleMetadata = serde_json::from_str(&metadata_json).map_err(|error| {
        format!(
            "La metadata del modulo en {} no cumple el schema: {error}",
            metadata_path.display()
        )
    })?;
    if metadata.schema_version != 1 {
        return Err("La metadata del modulo debe declarar schemaVersion 1.".to_owned());
    }
    if metadata.route_id != route_id || metadata.module_id != module_id {
        return Err(
            "La metadata del modulo no coincide con la ruta y el modulo solicitados.".to_owned(),
        );
    }
    if metadata.module_number == 0 {
        return Err("La metadata del modulo debe declarar moduleNumber mayor que cero.".to_owned());
    }
    for (field, value) in [
        ("routeTitle", metadata.route_title.as_str()),
        ("title", metadata.title.as_str()),
        ("subtitle", metadata.subtitle.as_str()),
    ] {
        if value.trim().is_empty() {
            return Err(format!(
                "La metadata del modulo debe declarar {field} no vacio."
            ));
        }
    }
    Ok(metadata)
}

struct ExerciseDetailContent {
    summary: String,
    statement_markdown: String,
    hints: Vec<Value>,
    node_type: String,
    primary_topics: Vec<String>,
    difficulty_band: String,
    difficulty_score: u64,
    expected_minutes: u64,
}

fn exercise_detail_content(
    activity: &InstalledActivity,
    manifest: &Value,
) -> Result<ExerciseDetailContent, String> {
    let required_string = |pointer: &str| {
        manifest
            .pointer(pointer)
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
            .ok_or_else(|| format!("El manifest no declara un valor valido en {pointer}."))
    };
    let install_path = Path::new(&activity.install_path);
    let statement_path = required_string("/content/statement/path")?;
    let statement_markdown = read_installed_text(install_path, &statement_path, "statement")?;
    let hints = read_installed_hints(install_path, manifest)?;
    let primary_topics = manifest
        .get("primaryTopics")
        .and_then(Value::as_array)
        .ok_or_else(|| "El manifest no declara primaryTopics validos.".to_owned())?
        .iter()
        .map(|topic| {
            topic
                .as_str()
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
                .ok_or_else(|| "El manifest contiene un primaryTopic invalido.".to_owned())
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(ExerciseDetailContent {
        summary: required_string("/summary")?,
        statement_markdown,
        hints,
        node_type: required_string("/route/nodeType")?,
        primary_topics,
        difficulty_band: required_string("/difficulty/band")?,
        difficulty_score: manifest
            .pointer("/difficulty/score")
            .and_then(Value::as_u64)
            .ok_or_else(|| "El manifest no declara difficulty.score valido.".to_owned())?,
        expected_minutes: manifest
            .pointer("/difficulty/expectedMinutes")
            .and_then(Value::as_u64)
            .ok_or_else(|| {
                "El manifest no declara difficulty.expectedMinutes valido.".to_owned()
            })?,
    })
}

fn read_installed_hints(install_path: &Path, manifest: &Value) -> Result<Vec<Value>, String> {
    let Some(declarations) = manifest.pointer("/content/hints") else {
        return Ok(Vec::new());
    };
    if declarations.is_null() {
        return Ok(Vec::new());
    }
    let declarations = declarations
        .as_array()
        .ok_or_else(|| "content.hints debe ser una lista.".to_owned())?;
    let mut hints = Vec::new();
    for declaration in declarations {
        let path = declaration
            .get("path")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "Un archivo de hints declarado no tiene path valido.".to_owned())?;
        let content = read_installed_text(install_path, path, "hints")?;
        let document: Value = serde_json::from_str(&content).map_err(|error| {
            format!("El archivo de hints {path} no contiene JSON valido: {error}")
        })?;
        if document.get("formatVersion").and_then(Value::as_u64) != Some(1) {
            return Err(format!(
                "El archivo de hints {path} no declara formatVersion 1."
            ));
        }
        let items = document
            .get("hints")
            .and_then(Value::as_array)
            .ok_or_else(|| format!("El archivo de hints {path} no contiene una lista hints."))?;
        for item in items {
            let order = item
                .get("order")
                .and_then(Value::as_u64)
                .filter(|order| *order > 0)
                .ok_or_else(|| format!("El archivo de hints {path} contiene un order invalido."))?;
            let text = item
                .get("text")
                .and_then(Value::as_str)
                .filter(|text| !text.is_empty())
                .ok_or_else(|| format!("El archivo de hints {path} contiene un text invalido."))?;
            hints.push(json!({ "order": order, "text": text }));
        }
    }
    hints.sort_by_key(|hint| hint.get("order").and_then(Value::as_u64).unwrap_or(0));
    Ok(hints)
}

fn read_installed_text(install_path: &Path, relative: &str, label: &str) -> Result<String, String> {
    let relative_path = Path::new(relative);
    if relative_path.as_os_str().is_empty()
        || relative_path.is_absolute()
        || !relative_path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
    {
        return Err(format!("La ruta declarada para {label} no es valida."));
    }
    let path = install_path.join(relative_path);
    fs::read_to_string(&path)
        .map_err(|error| format!("No se pudo leer {label} en {}: {error}", path.display()))
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
        memory_limit_mb: manifest
            .pointer("/sandbox/memoryLimitMb")
            .and_then(Value::as_u64)
            .and_then(|value| usize::try_from(value).ok())
            .unwrap_or(defaults.memory_limit_mb),
        process_limit: manifest
            .pointer("/sandbox/processLimit")
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok())
            .unwrap_or(defaults.process_limit),
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

fn parse_activate_params(params: &Value) -> Result<(String, String, PathBuf), ()> {
    let fields = params.as_object().ok_or(())?;
    if fields.len() != 3 {
        return Err(());
    }
    let exercise_id = fields
        .get("exerciseId")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or(())?
        .to_owned();
    let mode = fields
        .get("mode")
        .and_then(Value::as_str)
        .filter(|value| matches!(*value, "route" | "free"))
        .ok_or(())?
        .to_owned();
    let workspace_root = fields
        .get("workspaceRoot")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .ok_or(())?;
    Ok((exercise_id, mode, workspace_root))
}

fn parse_exercise_id(params: &Value) -> Result<String, ()> {
    let fields = params.as_object().ok_or(())?;
    if fields.len() != 1 {
        return Err(());
    }
    fields
        .get("exerciseId")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .ok_or(())
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
            .filter(|value| {
                let mut components = Path::new(value).components();
                matches!(components.next(), Some(Component::Normal(_)))
                    && components.next().is_none()
            })
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
    ensure_activity_supported(&manifest)?;
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

fn ensure_activity_supported(manifest: &Value) -> Result<(), Vec<EsexError>> {
    let mut errors = Vec::new();
    if manifest
        .pointer("/testContract/mode")
        .and_then(Value::as_str)
        != Some("io")
    {
        errors.push(EsexError {
            code: "ACTIVITY_UNSUPPORTED".to_owned(),
            path: "/testContract/mode".to_owned(),
            message: "Esta version del engine solo ejecuta actividades con tests IO.".to_owned(),
        });
    }
    if let Some(normalizations) = manifest
        .pointer("/testContract/normalization")
        .and_then(Value::as_array)
    {
        for (index, normalization) in normalizations.iter().enumerate() {
            let supported = normalization
                .as_str()
                .is_some_and(|name| matches!(name, "crlf-to-lf" | "trim-final-newline"));
            if !supported {
                errors.push(EsexError {
                    code: "ACTIVITY_UNSUPPORTED".to_owned(),
                    path: format!("/testContract/normalization/{index}"),
                    message: "La normalizacion solicitada no esta implementada.".to_owned(),
                });
            }
        }
    }
    if let Some(platforms) = manifest
        .pointer("/compatibility/supportedPlatforms")
        .and_then(Value::as_array)
    {
        let current = std::env::consts::OS;
        let current_target = format!("{current}-{}", std::env::consts::ARCH);
        if !platforms.iter().any(|platform| {
            platform
                .as_str()
                .is_some_and(|platform| platform == current || platform == current_target)
        }) {
            errors.push(EsexError {
                code: "ACTIVITY_UNSUPPORTED".to_owned(),
                path: "/compatibility/supportedPlatforms".to_owned(),
                message: format!("La actividad no declara soporte para {current_target}."),
            });
        }
    }
    if let Some(capabilities) = manifest
        .pointer("/compatibility/requiredCapabilities")
        .and_then(Value::as_array)
    {
        const SUPPORTED: [&str; 3] = ["gcc-ucrt64", "io-testing-v1", "workspace-v1"];
        for (index, capability) in capabilities.iter().enumerate() {
            if !capability
                .as_str()
                .is_some_and(|name| SUPPORTED.contains(&name))
            {
                errors.push(EsexError {
                    code: "ACTIVITY_UNSUPPORTED".to_owned(),
                    path: format!("/compatibility/requiredCapabilities/{index}"),
                    message: "La actividad requiere una capacidad no implementada.".to_owned(),
                });
            }
        }
    }
    match manifest
        .pointer("/compatibility/minEngineVersion")
        .and_then(Value::as_str)
    {
        Some(version)
            if semver_tuple(version)
                .zip(semver_tuple(ENGINE_VERSION))
                .is_some_and(|(minimum, current)| minimum > current) =>
        {
            errors.push(EsexError {
                code: "ACTIVITY_UNSUPPORTED".to_owned(),
                path: "/compatibility/minEngineVersion".to_owned(),
                message: format!(
                    "La actividad requiere engine {version}; disponible {ENGINE_VERSION}."
                ),
            })
        }
        None => {}
        Some(_) => {}
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

fn semver_tuple(value: &str) -> Option<(u64, u64, u64)> {
    let core = value.split_once('-').map_or(value, |(core, _)| core);
    let mut parts = core.split('.');
    let tuple = (
        parts.next()?.parse().ok()?,
        parts.next()?.parse().ok()?,
        parts.next()?.parse().ok()?,
    );
    parts.next().is_none().then_some(tuple)
}

pub(crate) fn invalid_request_response() -> Value {
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

fn activity_lookup_error_response(id: String, error: ActivityLookupError) -> Value {
    match error {
        ActivityLookupError::NotFound => error_response(
            Some(id),
            "ACTIVITY_NOT_FOUND",
            "El ejercicio solicitado no esta instalado.",
            true,
        ),
        ActivityLookupError::Locked => error_response(
            Some(id),
            "ACTIVITY_LOCKED",
            "Completa el ejercicio activo antes de abrir este nodo.",
            true,
        ),
        ActivityLookupError::Database => {
            database_error_response(id, "No se pudo leer la actividad o su progreso.")
        }
    }
}

fn content_error_response(id: String, message: String) -> Value {
    error_response(Some(id), "CONTENT_ERROR", &message, true)
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

fn active_exercise_json(
    activity: &InstalledActivity,
    workspace_path: &Path,
    entrypoint_path: &Path,
) -> Value {
    json!({
        "exerciseId": activity.activity_id,
        "version": activity.version,
        "installPath": activity.install_path,
        "workspacePath": workspace_path,
        "entrypointPath": entrypoint_path,
        "title": activity.title,
        "routeId": activity.route_id,
        "moduleId": activity.module_id,
        "nodeType": activity.node_type,
    })
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
