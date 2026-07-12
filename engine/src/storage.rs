use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension, Transaction};

use crate::state::{LastState, StatePatch};

const CURRENT_SCHEMA_VERSION: i64 = 5;

#[derive(Debug, Clone, Copy)]
pub(crate) struct ExerciseProgressResult {
    pub completed: bool,
    pub newly_completed: bool,
}

#[derive(Debug, Clone)]
pub(crate) struct ExerciseDetailProgress {
    pub completed: bool,
    pub attempts_total: u64,
    pub attempts_passed: u64,
    pub last_run_at: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct InstalledActivity {
    pub activity_id: String,
    pub version: String,
    pub title: String,
    pub entrypoint: String,
    pub install_path: String,
    pub package_sha256: String,
    pub route_id: Option<String>,
    pub module_id: Option<String>,
    pub order_in_module: Option<i64>,
    pub node_type: Option<String>,
    pub primary_topics: String,
    pub manifest_json: String,
}

#[derive(Debug, Clone)]
pub(crate) struct ActiveExerciseRecord {
    pub activity_id: String,
    pub version: String,
    pub workspace_path: String,
    pub entrypoint_path: String,
}

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

    pub(crate) fn get_setting(&mut self, key: &str) -> Result<Option<String>, String> {
        let result = match &self.state {
            DatabaseState::Ready(connection) => query_setting(connection, key),
            DatabaseState::Error(error) => return Err(error.clone()),
        };
        self.capture_runtime_error(result)
    }

    pub(crate) fn save_setting(&mut self, key: &str, value: &str) -> Result<(), String> {
        let result = match &self.state {
            DatabaseState::Ready(connection) => persist_setting(connection, key, value),
            DatabaseState::Error(error) => return Err(error.clone()),
        };
        self.capture_runtime_error(result)
    }

    #[allow(clippy::too_many_arguments)]
    pub(crate) fn record_compile_attempt(
        &mut self,
        source_path: &str,
        status: &str,
        error_count: usize,
        warning_count: usize,
        duration_ms: u64,
        compiler_path: &str,
    ) -> Result<(), String> {
        let result = match &self.state {
            DatabaseState::Ready(connection) => persist_compile_attempt(
                connection,
                source_path,
                status,
                error_count,
                warning_count,
                duration_ms,
                compiler_path,
            ),
            DatabaseState::Error(error) => return Err(error.clone()),
        };
        self.capture_runtime_error(result)
    }

    pub(crate) fn register_activity(&mut self, activity: &InstalledActivity) -> Result<(), String> {
        let result = match &self.state {
            DatabaseState::Ready(connection) => persist_installed_activity(connection, activity),
            DatabaseState::Error(error) => return Err(error.clone()),
        };
        self.capture_runtime_error(result)
    }

    pub(crate) fn get_installed_activity(
        &mut self,
        activity_id: &str,
        version: &str,
    ) -> Result<Option<InstalledActivity>, String> {
        let result = match &self.state {
            DatabaseState::Ready(connection) => {
                query_installed_activity(connection, activity_id, version)
            }
            DatabaseState::Error(error) => return Err(error.clone()),
        };
        self.capture_runtime_error(result)
    }

    pub(crate) fn get_latest_activity(
        &mut self,
        activity_id: &str,
    ) -> Result<Option<InstalledActivity>, String> {
        let result = match &self.state {
            DatabaseState::Ready(connection) => query_latest_activity(connection, activity_id),
            DatabaseState::Error(error) => return Err(error.clone()),
        };
        self.capture_runtime_error(result)
    }

    pub(crate) fn get_module_activities(
        &mut self,
        route_id: &str,
        module_id: &str,
    ) -> Result<Vec<InstalledActivity>, String> {
        let result = match &self.state {
            DatabaseState::Ready(connection) => {
                query_module_activities(connection, route_id, module_id)
            }
            DatabaseState::Error(error) => return Err(error.clone()),
        };
        self.capture_runtime_error(result)
    }

    #[allow(clippy::too_many_arguments)]
    pub(crate) fn record_exercise_attempt(
        &mut self,
        activity_id: &str,
        version: &str,
        status: &str,
        cases_passed: usize,
        cases_total: usize,
        duration_ms: u64,
        completed: bool,
    ) -> Result<ExerciseProgressResult, String> {
        let result = match &mut self.state {
            DatabaseState::Ready(connection) => persist_exercise_attempt(
                connection,
                activity_id,
                version,
                status,
                cases_passed,
                cases_total,
                duration_ms,
                completed,
            ),
            DatabaseState::Error(error) => return Err(error.clone()),
        };
        self.capture_runtime_error(result)
    }

    pub(crate) fn completed_activity_ids(&mut self) -> Result<HashSet<String>, String> {
        let result = match &self.state {
            DatabaseState::Ready(connection) => query_completed_activity_ids(connection),
            DatabaseState::Error(error) => return Err(error.clone()),
        };
        self.capture_runtime_error(result)
    }

    pub(crate) fn exercise_detail_progress(
        &mut self,
        activity_id: &str,
    ) -> Result<ExerciseDetailProgress, String> {
        let result = match &self.state {
            DatabaseState::Ready(connection) => {
                query_exercise_detail_progress(connection, activity_id)
            }
            DatabaseState::Error(error) => return Err(error.clone()),
        };
        self.capture_runtime_error(result)
    }

    pub(crate) fn get_active_exercise(&mut self) -> Result<Option<ActiveExerciseRecord>, String> {
        let result = match &self.state {
            DatabaseState::Ready(connection) => query_active_exercise(connection),
            DatabaseState::Error(error) => return Err(error.clone()),
        };
        self.capture_runtime_error(result)
    }

    pub(crate) fn activate_exercise(
        &mut self,
        activity: &InstalledActivity,
        mode: &str,
        workspace_path: &Path,
        entrypoint_path: &Path,
    ) -> Result<ActiveExerciseRecord, String> {
        let result = match &mut self.state {
            DatabaseState::Ready(connection) => {
                persist_active_exercise(connection, activity, mode, workspace_path, entrypoint_path)
            }
            DatabaseState::Error(error) => return Err(error.clone()),
        };
        self.capture_runtime_error(result)
    }

    fn capture_runtime_error<T>(&mut self, result: Result<T, String>) -> Result<T, String> {
        if let Err(error) = &result {
            // Runtime errors may be transient (notably SQLITE_BUSY when two VS Code
            // windows overlap). Keep the connection usable and let the caller retry.
            eprintln!("SQLite operation failed: {error}");
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
    connection
        .busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|error| format!("no se pudo configurar busy_timeout: {error}"))?;
    connection
        .pragma_update(None, "journal_mode", "WAL")
        .map_err(|error| format!("no se pudo activar WAL: {error}"))?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| format!("no se pudieron activar foreign keys: {error}"))?;
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

    if version < 2 {
        apply_migration_2(&transaction)?;
    }

    if version < 3 {
        apply_migration_3(&transaction)?;
    }

    if version < 4 {
        apply_migration_4(&transaction)?;
    }

    if version < 5 {
        apply_migration_5(&transaction)?;
    }

    transaction
        .commit()
        .map_err(|error| format!("no se pudo confirmar la migracion: {error}"))
}

fn apply_migration_5(transaction: &Transaction<'_>) -> Result<(), String> {
    transaction
        .execute_batch(
            "CREATE TABLE active_exercise (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              activity_id TEXT NOT NULL,
              version TEXT NOT NULL,
              mode TEXT NOT NULL CHECK (mode IN ('route', 'free')),
              workspace_path TEXT NOT NULL,
              entrypoint_path TEXT NOT NULL,
              activated_at TEXT NOT NULL
            );

            INSERT INTO schema_migrations (version, applied_at)
            VALUES (5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));",
        )
        .map_err(|error| format!("fallo la migracion 5: {error}"))
}

fn apply_migration_4(transaction: &Transaction<'_>) -> Result<(), String> {
    transaction
        .execute_batch(
            "CREATE TABLE exercise_attempts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              activity_id TEXT NOT NULL,
              version TEXT NOT NULL,
              mode TEXT,
              status TEXT NOT NULL,
              cases_passed INTEGER NOT NULL,
              cases_total INTEGER NOT NULL,
              duration_ms INTEGER NOT NULL,
              created_at TEXT NOT NULL
            );

            CREATE INDEX idx_exercise_attempts_activity
              ON exercise_attempts (activity_id, created_at);

            CREATE TABLE exercise_progress (
              activity_id TEXT PRIMARY KEY,
              completed_version TEXT NOT NULL,
              completed_at TEXT NOT NULL,
              attempts_before_completion INTEGER NOT NULL
            );

            INSERT INTO schema_migrations (version, applied_at)
            VALUES (4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));",
        )
        .map_err(|error| format!("fallo la migracion 4: {error}"))
}

fn apply_migration_3(transaction: &Transaction<'_>) -> Result<(), String> {
    transaction
        .execute_batch(
            "CREATE TABLE installed_activities (
                activity_id TEXT NOT NULL,
                version TEXT NOT NULL,
                title TEXT NOT NULL,
                entrypoint TEXT NOT NULL,
                install_path TEXT NOT NULL,
                package_sha256 TEXT NOT NULL,
                route_id TEXT,
                module_id TEXT,
                order_in_module INTEGER,
                node_type TEXT,
                primary_topics TEXT NOT NULL DEFAULT '[]',
                manifest_json TEXT NOT NULL,
                imported_at TEXT NOT NULL,
                PRIMARY KEY (activity_id, version)
            );

            CREATE INDEX idx_installed_activities_module
              ON installed_activities (route_id, module_id);

            INSERT INTO schema_migrations (version, applied_at)
            VALUES (3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));",
        )
        .map_err(|error| format!("fallo la migracion 3: {error}"))
}

fn apply_migration_2(transaction: &Transaction<'_>) -> Result<(), String> {
    transaction
        .execute_batch(
            "CREATE TABLE compile_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_path TEXT NOT NULL,
                mode TEXT,
                status TEXT NOT NULL,
                error_count INTEGER NOT NULL,
                warning_count INTEGER NOT NULL,
                duration_ms INTEGER NOT NULL,
                compiler_path TEXT,
                created_at TEXT NOT NULL
            );

            INSERT INTO schema_migrations (version, applied_at)
            VALUES (2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));",
        )
        .map_err(|error| format!("fallo la migracion 2: {error}"))
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

fn query_setting(connection: &Connection, key: &str) -> Result<Option<String>, String> {
    connection
        .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
            row.get(0)
        })
        .optional()
        .map_err(|error| format!("no se pudo leer settings: {error}"))
}

fn persist_setting(connection: &Connection, key: &str, value: &str) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map(|_| ())
        .map_err(|error| format!("no se pudo escribir settings: {error}"))
}

#[allow(clippy::too_many_arguments)]
fn persist_compile_attempt(
    connection: &Connection,
    source_path: &str,
    status: &str,
    error_count: usize,
    warning_count: usize,
    duration_ms: u64,
    compiler_path: &str,
) -> Result<(), String> {
    let mode: Option<String> = connection
        .query_row("SELECT last_mode FROM user_state WHERE id = 1", [], |row| {
            row.get(0)
        })
        .optional()
        .map_err(|error| format!("no se pudo leer el modo del intento: {error}"))?
        .flatten();

    connection
        .execute(
            "INSERT INTO compile_attempts (
                source_path,
                mode,
                status,
                error_count,
                warning_count,
                duration_ms,
                compiler_path,
                created_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7,
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            )",
            params![
                source_path,
                mode.as_deref().unwrap_or("free"),
                status,
                i64::try_from(error_count).unwrap_or(i64::MAX),
                i64::try_from(warning_count).unwrap_or(i64::MAX),
                i64::try_from(duration_ms).unwrap_or(i64::MAX),
                compiler_path,
            ],
        )
        .map(|_| ())
        .map_err(|error| format!("no se pudo registrar compile_attempts: {error}"))
}

#[allow(clippy::too_many_arguments)]
fn persist_exercise_attempt(
    connection: &mut Connection,
    activity_id: &str,
    version: &str,
    status: &str,
    cases_passed: usize,
    cases_total: usize,
    duration_ms: u64,
    should_complete: bool,
) -> Result<ExerciseProgressResult, String> {
    let transaction = connection
        .transaction()
        .map_err(|error| format!("no se pudo iniciar el registro del intento: {error}"))?;
    let mode: Option<String> = transaction
        .query_row("SELECT last_mode FROM user_state WHERE id = 1", [], |row| {
            row.get(0)
        })
        .optional()
        .map_err(|error| format!("no se pudo leer el modo del intento: {error}"))?
        .flatten();

    transaction
        .execute(
            "INSERT INTO exercise_attempts (
                activity_id, version, mode, status, cases_passed, cases_total,
                duration_ms, created_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7,
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            )",
            params![
                activity_id,
                version,
                mode.as_deref().unwrap_or("free"),
                status,
                i64::try_from(cases_passed).unwrap_or(i64::MAX),
                i64::try_from(cases_total).unwrap_or(i64::MAX),
                i64::try_from(duration_ms).unwrap_or(i64::MAX),
            ],
        )
        .map_err(|error| format!("no se pudo registrar exercise_attempts: {error}"))?;

    let newly_completed = if should_complete {
        let attempts: i64 = transaction
            .query_row(
                "SELECT COUNT(*) FROM exercise_attempts WHERE activity_id = ?1",
                [activity_id],
                |row| row.get(0),
            )
            .map_err(|error| format!("no se pudieron contar los intentos: {error}"))?;
        transaction
            .execute(
                "INSERT OR IGNORE INTO exercise_progress (
                    activity_id, completed_version, completed_at,
                    attempts_before_completion
                ) VALUES (
                    ?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?3
                )",
                params![activity_id, version, attempts.max(1)],
            )
            .map_err(|error| format!("no se pudo registrar exercise_progress: {error}"))?
            == 1
    } else {
        false
    };
    let completed = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM exercise_progress WHERE activity_id = ?1)",
            [activity_id],
            |row| row.get::<_, bool>(0),
        )
        .map_err(|error| format!("no se pudo leer exercise_progress: {error}"))?;

    transaction
        .commit()
        .map_err(|error| format!("no se pudo confirmar el intento: {error}"))?;
    Ok(ExerciseProgressResult {
        completed,
        newly_completed,
    })
}

fn query_completed_activity_ids(connection: &Connection) -> Result<HashSet<String>, String> {
    let mut statement = connection
        .prepare("SELECT activity_id FROM exercise_progress")
        .map_err(|error| format!("no se pudo preparar exercise_progress: {error}"))?;
    let rows = statement
        .query_map([], |row| row.get(0))
        .map_err(|error| format!("no se pudo leer exercise_progress: {error}"))?;
    rows.collect::<Result<HashSet<String>, _>>()
        .map_err(|error| format!("no se pudo decodificar exercise_progress: {error}"))
}

fn query_exercise_detail_progress(
    connection: &Connection,
    activity_id: &str,
) -> Result<ExerciseDetailProgress, String> {
    connection
        .query_row(
            "SELECT
               EXISTS(SELECT 1 FROM exercise_progress WHERE activity_id = ?1),
               COUNT(id),
               COALESCE(SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END), 0),
               MAX(created_at)
             FROM exercise_attempts
             WHERE activity_id = ?1",
            [activity_id],
            |row| {
                let attempts_total: i64 = row.get(1)?;
                let attempts_passed: i64 = row.get(2)?;
                Ok((row.get(0)?, attempts_total, attempts_passed, row.get(3)?))
            },
        )
        .map_err(|error| format!("no se pudo leer el detalle de progreso: {error}"))
        .and_then(
            |(completed, attempts_total, attempts_passed, last_run_at)| {
                Ok(ExerciseDetailProgress {
                    completed,
                    attempts_total: u64::try_from(attempts_total)
                        .map_err(|_| "exercise_attempts contiene un total invalido".to_owned())?,
                    attempts_passed: u64::try_from(attempts_passed).map_err(|_| {
                        "exercise_attempts contiene un total de aprobados invalido".to_owned()
                    })?,
                    last_run_at,
                })
            },
        )
}

fn query_active_exercise(connection: &Connection) -> Result<Option<ActiveExerciseRecord>, String> {
    connection
        .query_row(
            "SELECT activity_id, version, workspace_path, entrypoint_path
             FROM active_exercise WHERE id = 1",
            [],
            |row| {
                Ok(ActiveExerciseRecord {
                    activity_id: row.get(0)?,
                    version: row.get(1)?,
                    workspace_path: row.get(2)?,
                    entrypoint_path: row.get(3)?,
                })
            },
        )
        .optional()
        .map_err(|error| format!("no se pudo leer active_exercise: {error}"))
}

fn persist_active_exercise(
    connection: &mut Connection,
    activity: &InstalledActivity,
    mode: &str,
    workspace_path: &Path,
    entrypoint_path: &Path,
) -> Result<ActiveExerciseRecord, String> {
    let transaction = connection
        .transaction()
        .map_err(|error| format!("no se pudo iniciar la activacion: {error}"))?;
    transaction
        .execute(
            "INSERT INTO active_exercise (
                id, activity_id, version, mode, workspace_path, entrypoint_path, activated_at
             ) VALUES (
                1, ?1, ?2, ?3, ?4, ?5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             )
             ON CONFLICT(id) DO UPDATE SET
                activity_id = excluded.activity_id,
                version = excluded.version,
                mode = excluded.mode,
                workspace_path = excluded.workspace_path,
                entrypoint_path = excluded.entrypoint_path,
                activated_at = excluded.activated_at",
            params![
                activity.activity_id,
                activity.version,
                mode,
                workspace_path.to_string_lossy(),
                entrypoint_path.to_string_lossy(),
            ],
        )
        .map_err(|error| format!("no se pudo persistir active_exercise: {error}"))?;
    transaction
        .execute(
            "INSERT INTO user_state (
                id, last_mode, last_route_id, last_module_id, last_exercise_id, updated_at
             ) VALUES (
                1, ?1, ?2, ?3, ?4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             )
             ON CONFLICT(id) DO UPDATE SET
                last_mode = excluded.last_mode,
                last_route_id = excluded.last_route_id,
                last_module_id = excluded.last_module_id,
                last_exercise_id = excluded.last_exercise_id,
                updated_at = excluded.updated_at",
            params![
                mode,
                activity.route_id,
                activity.module_id,
                activity.activity_id,
            ],
        )
        .map_err(|error| format!("no se pudo actualizar user_state al activar: {error}"))?;
    transaction
        .commit()
        .map_err(|error| format!("no se pudo confirmar la activacion: {error}"))?;
    Ok(ActiveExerciseRecord {
        activity_id: activity.activity_id.clone(),
        version: activity.version.clone(),
        workspace_path: workspace_path.to_string_lossy().into_owned(),
        entrypoint_path: entrypoint_path.to_string_lossy().into_owned(),
    })
}

fn persist_installed_activity(
    connection: &Connection,
    activity: &InstalledActivity,
) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO installed_activities (
                activity_id, version, title, entrypoint, install_path,
                package_sha256, route_id, module_id, order_in_module, node_type,
                primary_topics, manifest_json, imported_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            )
            ON CONFLICT(activity_id, version) DO UPDATE SET
                title = excluded.title,
                entrypoint = excluded.entrypoint,
                install_path = excluded.install_path,
                package_sha256 = excluded.package_sha256,
                route_id = excluded.route_id,
                module_id = excluded.module_id,
                order_in_module = excluded.order_in_module,
                node_type = excluded.node_type,
                primary_topics = excluded.primary_topics,
                manifest_json = excluded.manifest_json,
                imported_at = excluded.imported_at",
            params![
                activity.activity_id,
                activity.version,
                activity.title,
                activity.entrypoint,
                activity.install_path,
                activity.package_sha256,
                activity.route_id,
                activity.module_id,
                activity.order_in_module,
                activity.node_type,
                activity.primary_topics,
                activity.manifest_json,
            ],
        )
        .map(|_| ())
        .map_err(|error| format!("no se pudo registrar installed_activities: {error}"))
}

const ACTIVITY_COLUMNS: &str = "activity_id, version, title, entrypoint, install_path,
    package_sha256, route_id, module_id, order_in_module, node_type,
    primary_topics, manifest_json";

fn decode_installed_activity(row: &rusqlite::Row<'_>) -> rusqlite::Result<InstalledActivity> {
    Ok(InstalledActivity {
        activity_id: row.get(0)?,
        version: row.get(1)?,
        title: row.get(2)?,
        entrypoint: row.get(3)?,
        install_path: row.get(4)?,
        package_sha256: row.get(5)?,
        route_id: row.get(6)?,
        module_id: row.get(7)?,
        order_in_module: row.get(8)?,
        node_type: row.get(9)?,
        primary_topics: row.get(10)?,
        manifest_json: row.get(11)?,
    })
}

fn query_installed_activity(
    connection: &Connection,
    activity_id: &str,
    version: &str,
) -> Result<Option<InstalledActivity>, String> {
    connection
        .query_row(
            &format!(
                "SELECT {ACTIVITY_COLUMNS} FROM installed_activities
                 WHERE activity_id = ?1 AND version = ?2"
            ),
            params![activity_id, version],
            decode_installed_activity,
        )
        .optional()
        .map_err(|error| format!("no se pudo leer installed_activities: {error}"))
}

fn query_latest_activity(
    connection: &Connection,
    activity_id: &str,
) -> Result<Option<InstalledActivity>, String> {
    connection
        .query_row(
            &format!(
                "SELECT {ACTIVITY_COLUMNS} FROM installed_activities
                 WHERE activity_id = ?1
                 ORDER BY imported_at DESC, version DESC
                 LIMIT 1"
            ),
            [activity_id],
            decode_installed_activity,
        )
        .optional()
        .map_err(|error| format!("no se pudo resolver la actividad instalada: {error}"))
}

fn query_module_activities(
    connection: &Connection,
    route_id: &str,
    module_id: &str,
) -> Result<Vec<InstalledActivity>, String> {
    let mut statement = connection
        .prepare(&format!(
            "SELECT {ACTIVITY_COLUMNS} FROM installed_activities
             WHERE route_id = ?1 AND module_id = ?2
             ORDER BY activity_id ASC, imported_at DESC, version DESC"
        ))
        .map_err(|error| format!("no se pudo preparar el snapshot del modulo: {error}"))?;
    let rows = statement
        .query_map(params![route_id, module_id], decode_installed_activity)
        .map_err(|error| format!("no se pudo leer el snapshot del modulo: {error}"))?;
    let mut seen = HashSet::new();
    let mut activities = Vec::new();
    for row in rows {
        let activity =
            row.map_err(|error| format!("no se pudo decodificar el snapshot del modulo: {error}"))?;
        if seen.insert(activity.activity_id.clone()) {
            activities.push(activity);
        }
    }
    activities.sort_by(|left, right| {
        left.order_in_module
            .is_none()
            .cmp(&right.order_in_module.is_none())
            .then_with(|| left.order_in_module.cmp(&right.order_in_module))
            .then_with(|| left.activity_id.cmp(&right.activity_id))
    });
    Ok(activities)
}
