use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Path, PathBuf};

use serde_json::{json, Map, Value};

use crate::compile::{self, CompileFailure};
use crate::state::StatePatch;
use crate::storage::Database;

const PROTOCOL_VERSION: u64 = 2;
const ENGINE_VERSION: &str = "0.1.0";

pub(crate) struct Engine {
    database: Database,
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
