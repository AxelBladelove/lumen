# Engine Protocol v1

Archivo: `Architectural-plans/extension-engine-bridge/protocol-v1.md`

Contrato normativo de la primera version del protocolo entre Extension Host y
Local Engine. Este documento es la fuente de verdad para ambas piezas; si algo
cambia aqui, cambian las dos implementaciones.

## Transporte

- El engine es un binario Rust: `lumen-engine` (`lumen-engine.exe` en Windows).
- La extension lo lanza como proceso hijo persistente:
  `lumen-engine --data-dir <ruta absoluta>`.
- Comunicacion por NDJSON: un objeto JSON por linea, UTF-8, `\n` como
  separador. Requests entran por stdin, responses salen por stdout.
- stdout es EXCLUSIVO del protocolo. Logs y diagnostico van a stderr.
- El engine procesa requests en orden y responde una response por request.
- Cuando stdin se cierra (EOF), el engine termina limpio con exit code 0.

## Startup

Al arrancar, el engine:

1. Crea `<data-dir>` si no existe.
2. Abre o crea `<data-dir>/lumen.db`.
3. Corre las migraciones pendientes.
4. Empieza a leer stdin.

Si la base o las migraciones fallan, el engine NO muere: sigue sirviendo
requests y reporta `dbStatus: "error"` en `engine.healthCheck`; los metodos que
requieren base responden `DATABASE_ERROR`.

## Request

```json
{ "id": "r-1", "method": "engine.healthCheck", "params": {} }
```

- `id`: string no vacio, elegido por la extension, unico por request en vuelo.
- `method`: string registrado.
- `params`: objeto opcional (ausente equivale a `{}`).

## Response

Exito:

```json
{ "id": "r-1", "ok": true, "result": { } }
```

Fallo:

```json
{
  "id": "r-1",
  "ok": false,
  "error": {
    "code": "DATABASE_ERROR",
    "message": "No se pudo escribir el estado.",
    "recoverable": true
  }
}
```

- Toda response lleva el `id` del request que la origino.
- Una linea que no parsea como JSON o no tiene la forma de request produce
  `{ "id": null, "ok": false, "error": { "code": "INVALID_REQUEST", ... } }`
  y el engine sigue vivo.
- Un `method` no registrado produce `UNKNOWN_METHOD`.

## Codigos de error del engine

```txt
INVALID_REQUEST   la linea no es un request valido
UNKNOWN_METHOD    metodo no registrado
INVALID_PARAMS    params no cumplen el contrato del metodo
DATABASE_ERROR    fallo leyendo/escribiendo SQLite o migraciones
UNKNOWN_ERROR     cualquier otro fallo interno
```

Codigos que agrega el bridge del lado TypeScript (nunca los emite el engine):

```txt
ENGINE_NOT_FOUND      no se encontro el binario
ENGINE_START_FAILED   el proceso no arranco o murio
ENGINE_TIMEOUT        no hubo response dentro del timeout
ENGINE_PROTOCOL_ERROR el engine emitio una linea invalida
```

## Metodos v1

### engine.healthCheck

`params`: `{}`

`result`:

```json
{
  "protocolVersion": 1,
  "engineVersion": "0.1.0",
  "dbStatus": "ready",
  "dbPath": "C:\\...\\lumen.db"
}
```

- `protocolVersion` es el numero de este documento: `1`.
- `dbStatus` es `"ready"` o `"error"`. Si es `"error"` se agrega
  `dbError: string` con el motivo.

### session.getLastState

`params`: `{}`

`result`:

```json
{
  "state": {
    "lastMode": "route",
    "lastRouteId": "ruta-c",
    "lastModuleId": "modulo-2-cadenas",
    "lastExerciseId": null,
    "updatedAt": "2026-07-10T12:00:00Z"
  }
}
```

- Si nunca se guardo estado, `state` es `null`.
- Todos los campos internos son `string | null` salvo `updatedAt` (string
  ISO-8601 UTC, siempre presente cuando `state` no es null).

### session.saveLastState

`params` (todos opcionales; los ausentes conservan su valor previo, `null`
explicito borra el campo):

```json
{
  "lastMode": "free",
  "lastRouteId": null,
  "lastModuleId": null,
  "lastExerciseId": "punteros-01"
}
```

`result`: `{ "state": { ...estado completo ya persistido... } }` con la misma
forma que `session.getLastState`.

## Schema v1 de la base

Migracion 1 (`schema_migrations` la lleva el propio engine):

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE user_state (
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
```

- `user_state` es una tabla de fila unica (`id = 1`).
- Las migraciones corren en transaccion; si una falla, se revierte y el engine
  reporta `dbStatus: "error"`.

## Versionado

- `protocolVersion: 1` vive en este documento.
- Si la extension recibe un `protocolVersion` distinto al esperado en
  `engine.healthCheck`, muestra error controlado y no usa el engine.

## Estado del repo

Superseded por `protocol-v2.md`: el engine reporta `protocolVersion: 2`. Los
metodos y formas de v1 siguen vigentes sin cambios dentro de v2; este documento
queda como referencia historica del transporte y los metodos base.
Implementado por `engine/` (crate Rust) y `extension/src/engine/` (bridge
TypeScript). Ver `extension-engine-bridge.md` para la arquitectura general.
