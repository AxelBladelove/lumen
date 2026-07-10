use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::Path;

use serde_json::{json, Map, Value};

use crate::state::StatePatch;
use crate::storage::Database;

const PROTOCOL_VERSION: u64 = 1;
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

fn success_response(id: String, result: Value) -> Value {
    json!({
        "id": id,
        "ok": true,
        "result": result,
    })
}

fn error_response(
    id: Option<String>,
    code: &'static str,
    message: &'static str,
    recoverable: bool,
) -> Value {
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
