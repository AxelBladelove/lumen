# Engine Protocol v4

Archivo: `Architectural-plans/extension-engine-bridge/protocol-v4.md`

Contrato normativo de la version 4 del protocolo entre Extension Host y Local
Engine. v4 es un superset de v3: todo lo anterior sigue igual. Este documento
solo define lo nuevo: correr los tests del ejercicio activo, registrar
intentos y marcar ejercicios completados (la base de los gates de Route Mode).

## Version

- `engine.healthCheck` responde `protocolVersion: 4`.
- La extension exige igualdad exacta; ambas piezas se actualizan en lockstep.

## Principio

Compilar no significa completar (`solution-testing.md`). Completar un
ejercicio exige pasar TODOS sus casos de IO. El engine es la unica autoridad
que registra intentos y marca completados; la webview solo muestra.

## Codigos de error nuevos (engine)

```txt
NO_ACTIVE_EXERCISE  no hay ejercicio activo instalado y verificado en disco
TESTS_INVALID       el io-cases.json instalado no supera la validacion
```

`SOURCE_NOT_FOUND`, `TOOLCHAIN_NOT_FOUND`, `BUILD_DIR_ERROR`,
`COMPILER_FAILED` y `DATABASE_ERROR` aplican igual que en v2/v3.

## Schema v4 de la base

Migracion 4:

```sql
CREATE TABLE exercise_attempts (
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
```

- `exercise_attempts.status`: `"passed" | "failed" | "compile_error"`. Los
  fallos de protocolo (p. ej. toolchain ausente) NO registran intento.
- `mode`: `user_state.last_mode` (`"free"` si es null), igual que
  `compile_attempts`.
- `attempts_before_completion`: cantidad de filas previas en
  `exercise_attempts` para ese `activity_id` al momento de completar (el
  intento que completa cuenta: minimo 1).
- La migracion sigue las reglas de v1: transaccional, registrada en
  `schema_migrations`.

## Metodos v4

### exercise.runTests

`params`: `{}`

El engine resuelve el ejercicio activo con la misma logica de
`exercise.getActive`. Si el resultado seria `none` o `missing`, responde
`NO_ACTIVE_EXERCISE` (error, con el `exerciseId` en `details[0].path` cuando
exista).

Flujo: compilar el entrypoint (mismas reglas que `exercise.compile`, artefacto
en `.lumen-build/`) → cargar el archivo de tests declarado en el manifest
(`content.tests[]` con `role: "test-data"`) → `validate_io_cases` contra el
manifest instalado (invalido → `TESTS_INVALID` con detalles) →
`run_io_tests` → registrar intento → actualizar progreso si corresponde.

`result` (error de compilacion — NO es error de protocolo):

```json
{
  "status": "compile_error",
  "diagnostics": [ { "kind": "error", "file": "main.c", "line": 3,
                     "column": 5, "message": "…" } ],
  "rawOutput": "…",
  "durationMs": 96
}
```

`result` (tests ejecutados):

```json
{
  "status": "passed",
  "exerciseId": "c.strings.count-lowercase-01",
  "version": "1.0.0",
  "casesPassed": 7,
  "casesTotal": 7,
  "durationMs": 1240,
  "completed": true,
  "newlyCompleted": true,
  "groups": [
    {
      "groupId": "traversal",
      "phase": "public",
      "casesPassed": 4,
      "casesTotal": 4,
      "cases": [
        {
          "caseId": "basic-mixed",
          "status": "passed",
          "durationMs": 12,
          "stdinPreview": "Hola Mundo",
          "expected": "7",
          "observed": "7"
        }
      ]
    }
  ]
}
```

Reglas:

- `status`: `"passed"` solo si TODOS los casos de TODOS los grupos pasan;
  cualquier otro resultado es `"failed"`. Los estados por caso vienen de
  `testing.rs` (serializados snake_case): `passed | failed | timeout |
  runtime_error | inconclusive`. `expected`/`observed` del wire son
  `expected_stdout_normalized`/`actual_stdout_normalized` del runner; los
  casos truncados llevan ademas `outputTruncated: true`.
- Ocultamiento (`solution-testing.md`): en grupos con `phase` distinta de
  `"public"`, los casos NO incluyen `stdinPreview`, `expected` ni `observed`;
  solo `caseId`, `status` y `durationMs`. En grupos `public` se incluyen los
  tres campos (con `stdinPreview` truncado a 200 chars).
- `completed`: el ejercicio esta en `exercise_progress` despues de esta
  llamada. `newlyCompleted`: esta llamada lo inserto. Un ejercicio ya
  completado que luego falla NO pierde su completado (el progreso no
  retrocede; `local-database.md`, seguridad de datos).
- Todo run (passed/failed/compile_error) registra su fila en
  `exercise_attempts`; un fallo al registrar se loguea a stderr sin romper la
  response (mismo patron que `compile_attempts`).
- Timeout del bridge: 120s para este metodo (compilacion + todos los casos).
  El engine ya limita cada caso por su `timeoutMs`.

### route.getModuleSnapshot (cambio v4)

Sin cambios de firma. `nodes[*].status` ahora emite tambien `"completed"`:

- `"completed"`: el `exerciseId` esta en `exercise_progress` (gana sobre
  `"active"`).
- `"active"`: es `user_state.last_exercise_id` y no esta completado.
- `"locked"`: el resto.

`activeExerciseId` no cambia de semantica.

## Puente webview (informativo)

Tras un `exercise.runTests` con `newlyCompleted: true`, la extension:

1. postea `route.exercise.completed` (tipo ya existente) con
   `nodeId = exerciseId` — dispara la animacion de completado del frontend; y
2. vuelve a pedir `route.getModuleSnapshot` y re-postea `route.module.data`
   para que la vista refleje `completed` y el progreso.

El frontend deriva `completed`/`percent` del conteo de nodos `completed` y
mapea el estado `completed` del engine a su `NodeStatus` homonimo.

## Comando y keybinding (Extension Host)

- Comando `lumen.testCurrentExercise` ("Lumen: Probar Solucion"): llama
  `exercise.runTests` y muestra el resumen (passed → informacion con
  `casesPassed/casesTotal`; failed → warning con el primer caso `public`
  fallido: `caseId`, `expected`, `observed`; compile_error → error con el
  primer diagnostico).
- Keybinding `F10` con el mismo `when` que F9
  (`editorTextFocus && resourceExtname == .c`).

## Estado del repo

Contrato escrito en F5 (re-scopeada a progresion de Route Mode).
Implementacion objetivo: `engine/src/protocol.rs` + `engine/src/storage.rs`
(migracion 4) + `engine/src/testing.rs` (reutilizado, sin cambios de fondo) +
`engine/tests/protocol_v4.rs` (Rust); `extension/src/engine/` + comando F10
(TS); mapeo `completed` en `frontend/src/route-path-view/data/routeModuleSource.ts`.
