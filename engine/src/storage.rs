use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension, Transaction};

use crate::state::{LastState, StatePatch};

const CURRENT_SCHEMA_VERSION: i64 = 1;

pub(crate) struct Database {
    path: PathBuf,
    state: DatabaseState,
}

enum DatabaseState {
    Ready(Connection),
    Error(String),
}

impl Database {
    pub(crate) fn initialize(data_dir: &Path) -> Self {
        let path = data_dir.join("lumen.db");
        let state = match open_and_migrate(data_dir, &path) {
            Ok(connection) => DatabaseState::Ready(connection),
            Err(error) => {
                eprintln!("No se pudo inicializar SQLite: {error}");
                DatabaseState::Error(error)
            }
        };

        Self { path, state }
    }

    pub(crate) fn path(&self) -> &Path {
        &self.path
    }

    pub(crate) fn error(&self) -> Option<&str> {
        match &self.state {
            DatabaseState::Ready(_) => None,
            DatabaseState::Error(error) => Some(error),
        }
    }

    pub(crate) fn get_last_state(&mut self) -> Result<Option<LastState>, String> {
        let result = match &self.state {
            DatabaseState::Ready(connection) => query_last_state(connection),
            DatabaseState::Error(error) => return Err(error.clone()),
        };
        self.capture_runtime_error(result)
    }

    pub(crate) fn save_last_state(&mut self, patch: &StatePatch) -> Result<LastState, String> {
        let result = match &mut self.state {
            DatabaseState::Ready(connection) => persist_last_state(connection, patch),
            DatabaseState::Error(error) => return Err(error.clone()),
        };
        self.capture_runtime_error(result)
    }

    fn capture_runtime_error<T>(&mut self, result: Result<T, String>) -> Result<T, String> {
        if let Err(error) = &result {
            eprintln!("SQLite dejo de estar disponible: {error}");
            self.state = DatabaseState::Error(error.clone());
        }
        result
    }
}

fn open_and_migrate(data_dir: &Path, db_path: &Path) -> Result<Connection, String> {
    fs::create_dir_all(data_dir).map_err(|error| {
        format!(
            "no se pudo crear el data-dir {}: {error}",
            data_dir.display()
        )
    })?;

    let mut connection = Connection::open(db_path)
        .map_err(|error| format!("no se pudo abrir {}: {error}", db_path.display()))?;
    run_migrations(&mut connection)?;
    Ok(connection)
}

fn run_migrations(connection: &mut Connection) -> Result<(), String> {
    let transaction = connection
        .transaction()
        .map_err(|error| format!("no se pudo iniciar la transaccion de migraciones: {error}"))?;

    transaction
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            );",
        )
        .map_err(|error| format!("no se pudo preparar schema_migrations: {error}"))?;

    let version: i64 = transaction
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .map_err(|error| format!("no se pudo leer la version del schema: {error}"))?;

    if version > CURRENT_SCHEMA_VERSION {
        return Err(format!(
            "la base usa schema version {version}, pero el engine solo soporta {CURRENT_SCHEMA_VERSION}"
        ));
    }

    if version < 1 {
        apply_migration_1(&transaction)?;
    }

    transaction
        .commit()
        .map_err(|error| format!("no se pudo confirmar la migracion: {error}"))
}

fn apply_migration_1(transaction: &Transaction<'_>) -> Result<(), String> {
    transaction
        .execute_batch(
            "CREATE TABLE user_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                last_mode TEXT,
                last_route_id TEXT,
                last_module_id TEXT,
                last_exercise_id TEXT,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            INSERT INTO schema_migrations (version, applied_at)
            VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));",
        )
        .map_err(|error| format!("fallo la migracion 1: {error}"))
}

fn query_last_state(connection: &Connection) -> Result<Option<LastState>, String> {
    connection
        .query_row(
            "SELECT last_mode, last_route_id, last_module_id, last_exercise_id, updated_at
             FROM user_state
             WHERE id = 1",
            [],
            |row| {
                Ok(LastState {
                    last_mode: row.get(0)?,
                    last_route_id: row.get(1)?,
                    last_module_id: row.get(2)?,
                    last_exercise_id: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            },
        )
        .optional()
        .map_err(|error| format!("no se pudo leer user_state: {error}"))
}

fn persist_last_state(
    connection: &mut Connection,
    patch: &StatePatch,
) -> Result<LastState, String> {
    let transaction = connection
        .transaction()
        .map_err(|error| format!("no se pudo iniciar la escritura de user_state: {error}"))?;

    transaction
        .execute(
            "INSERT INTO user_state (
                id,
                last_mode,
                last_route_id,
                last_module_id,
                last_exercise_id,
                updated_at
            ) VALUES (
                1, ?1, ?2, ?3, ?4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            )
            ON CONFLICT(id) DO UPDATE SET
                last_mode = CASE WHEN ?5 = 1 THEN excluded.last_mode ELSE user_state.last_mode END,
                last_route_id = CASE WHEN ?6 = 1 THEN excluded.last_route_id ELSE user_state.last_route_id END,
                last_module_id = CASE WHEN ?7 = 1 THEN excluded.last_module_id ELSE user_state.last_module_id END,
                last_exercise_id = CASE WHEN ?8 = 1 THEN excluded.last_exercise_id ELSE user_state.last_exercise_id END,
                updated_at = excluded.updated_at",
            params![
                patch.last_mode.value(),
                patch.last_route_id.value(),
                patch.last_module_id.value(),
                patch.last_exercise_id.value(),
                patch.last_mode.should_apply(),
                patch.last_route_id.should_apply(),
                patch.last_module_id.should_apply(),
                patch.last_exercise_id.should_apply(),
            ],
        )
        .map_err(|error| format!("no se pudo escribir user_state: {error}"))?;

    let state = query_last_state(&transaction)?
        .ok_or_else(|| "user_state no existe despues de guardarlo".to_owned())?;

    transaction
        .commit()
        .map_err(|error| format!("no se pudo confirmar user_state: {error}"))?;
    Ok(state)
}
