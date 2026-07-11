# Engine Protocol v3

Archivo: `Architectural-plans/extension-engine-bridge/protocol-v3.md`

Contrato normativo de la version 3 del protocolo entre Extension Host y Local
Engine. v3 es un superset de v2: transporte, formas de request/response,
codigos base y todos los metodos v1/v2 (`engine.healthCheck`,
`session.getLastState`, `session.saveLastState`, `exercise.compile`,
`toolchain.check`) siguen igual. Este documento solo define lo nuevo.

## Version

- `engine.healthCheck` responde `protocolVersion: 3`.
- La extension exige igualdad exacta; ambas piezas se actualizan en lockstep.

## Alcance

v3 expone por protocolo la importacion de paquetes `.esex` (implementada en
`engine/src/esex.rs` desde F3.3) y mueve al engine la resolucion del ejercicio
activo, como manda `Architectural-plans/local-engine/compile.md`. El metodo
`exercise.compile` no cambia de firma en v3: sigue recibiendo `sourcePath`.
La extension DEBE resolver ese path via `exercise.getActive` cuando opera en
Lumen Mode; el paso transicional de "archivo activo del editor" queda solo
para Free Mode/fallback.

La presentacion (path SVG, theme, posiciones de nodos) NO viaja por este
protocolo: el engine entrega datos y la webview los proyecta sobre su
scaffolding visual (`La webview muestra`).

## Raiz de instalacion

Las actividades importadas viven bajo el data-dir del engine (el mismo que
contiene `lumen.db`):

```txt
<data_dir>/activities/<activityId>/<version>/
```

Ese layout ya lo garantiza `esex::import_esex`; v3 fija `<data_dir>/activities`
como raiz canonica de instalacion.

## Forma de error extendida

v3 agrega un campo opcional `details` al objeto `error`:

```json
{
  "id": "…",
  "ok": false,
  "error": {
    "code": "IMPORT_FAILED",
    "message": "El paquete no supero la validacion.",
    "recoverable": true,
    "details": [
      { "code": "UNSAFE_ENTRY", "path": "../evil.c", "message": "…" }
    ]
  }
}
```

- `details` solo aparece cuando hay sub-errores estructurados (hoy: los
  `EsexError` de importacion). Clientes v3 deben tolerar su ausencia.

## Codigos de error nuevos (engine)

```txt
IMPORT_FAILED    el paquete .esex no supero validacion/limites/seguridad
IMPORT_CONFLICT  ya existe la misma actividad+version con otro sha256
```

`DATABASE_ERROR` (v1) aplica tambien a los metodos nuevos.

## Schema v3 de la base

Migracion 3:

```sql
CREATE TABLE installed_activities (
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
```

- `entrypoint`: relativo al `install_path`, copiado de `execution.entrypoint`.
- `route_id`, `module_id`, `order_in_module`, `node_type`: copiados de
  `route.*` del manifest cuando `route.routeEligible` es `true`; `NULL` si no.
- `primary_topics`: array JSON serializado (`["strings"]`).
- `manifest_json`: el manifest completo tal como vino en el paquete (cache de
  metadata para fases futuras; el archivo en disco sigue siendo canonico).
- La migracion sigue las reglas de v1: transaccional, registrada en
  `schema_migrations`, y si falla el engine reporta `dbStatus: "error"`.

## Metodos v3

### exercise.import

`params`:

```json
{ "esexPath": "C:\\Users\\u\\Downloads\\c.strings.count-lowercase-01.esex" }
```

- `esexPath`: string no vacio, ruta absoluta. Cualquier otra forma es
  `INVALID_PARAMS`. Si la base esta en error, responde `DATABASE_ERROR` antes
  de tocar disco (no se permiten instalaciones sin registro).

`result` (exito):

```json
{
  "activityId": "c.strings.count-lowercase-01",
  "version": "1.0.3",
  "installPath": "C:\\…\\activities\\c.strings.count-lowercase-01\\1.0.3",
  "packageSha256": "9f2c…",
  "alreadyInstalled": false,
  "activity": {
    "title": "Contar minusculas en una linea",
    "routeId": "c",
    "moduleId": "strings",
    "orderInModule": 4,
    "nodeType": "lesson"
  }
}
```

Reglas:

- Importa con `esex::import_esex` sobre la raiz canonica y registra la fila en
  `installed_activities` (upsert por PK) en la misma operacion logica. Si la
  fila no se puede registrar tras instalar, la response es `DATABASE_ERROR`
  (la carpeta instalada queda; el proximo import la auto-repara).
- Re-import de la misma actividad+version con el mismo `packageSha256`: NO es
  error. Responde `ok: true` con `alreadyInstalled: true` y, si faltaba la
  fila en la base (carpeta presente sin registro), la registra leyendo el
  `manifest.json` instalado (auto-reparacion).
- Misma actividad+version con sha distinto: `IMPORT_CONFLICT`. Nunca se
  sobreescribe una instalacion existente.
- Fallos de validacion/seguridad/limites del paquete: `IMPORT_FAILED` con los
  `EsexError` en `error.details`.

### exercise.getActive

`params`: `{}`

`result` — exactamente una de estas tres formas:

```json
{ "status": "none" }
```

```json
{ "status": "missing", "exerciseId": "c.strings.count-lowercase-01" }
```

```json
{
  "status": "ready",
  "active": {
    "exerciseId": "c.strings.count-lowercase-01",
    "version": "1.0.3",
    "installPath": "C:\\…\\activities\\c.strings.count-lowercase-01\\1.0.3",
    "entrypointPath": "C:\\…\\1.0.3\\starter\\main.c",
    "title": "Contar minusculas en una linea",
    "routeId": "c",
    "moduleId": "strings",
    "nodeType": "lesson"
  }
}
```

Reglas:

- `none`: `user_state.last_exercise_id` es `NULL` o no hay fila.
- Con id presente, se resuelve contra `installed_activities`; si hay varias
  versiones instaladas gana la de `imported_at` mas reciente (desempate:
  `version` DESC lexicografico).
- `missing`: el id no esta instalado, o el `entrypointPath` ya no existe en
  disco (caso "ejercicio registrado pero carpeta eliminada" de
  `local-database.md`). La response incluye el `exerciseId` para que la UI
  pueda explicar y ofrecer re-import.
- `ready`: instalado y con entrypoint verificado en disco. `entrypointPath` es
  absoluto y apto para pasarse tal cual a `exercise.compile`.

### route.getModuleSnapshot

`params`:

```json
{ "routeId": "c", "moduleId": "strings" }
```

- Ambos strings no vacios; cualquier otra forma es `INVALID_PARAMS`.

`result`:

```json
{
  "snapshot": {
    "routeId": "c",
    "moduleId": "strings",
    "activeExerciseId": "c.strings.count-lowercase-01",
    "nodes": [
      {
        "exerciseId": "c.strings.count-lowercase-01",
        "title": "Contar minusculas en una linea",
        "primaryTopics": ["strings"],
        "nodeType": "lesson",
        "orderInModule": 4,
        "status": "active"
      }
    ]
  }
}
```

Reglas:

- `nodes`: actividades de `installed_activities` con ese `route_id` +
  `module_id`, una por `activity_id` (gana la version de `imported_at` mas
  reciente), ordenadas por `order_in_module` ASC (NULL al final, desempate por
  `exerciseId` ASC).
- `status`: `"active"` si `exerciseId` coincide con
  `user_state.last_exercise_id`; si no, `"locked"`. (`"completed"` llega con
  el sistema de progreso en F5+; v3 no lo emite.)
- `activeExerciseId`: el `last_exercise_id` si esta instalado en este modulo;
  `null` en caso contrario.
- Modulo sin actividades instaladas: `nodes: []` (no es error). La extension
  decide el fallback (hoy: conservar el mock visual).

## Puente webview (informativo, no parte del protocolo engine)

La extension proyecta el snapshot hacia la webview con un mensaje nuevo
`route.module.data` (`ExtensionToWebviewMessage`):

```json
{
  "type": "route.module.data",
  "payload": {
    "source": "engine",
    "routeId": "c",
    "moduleId": "strings",
    "activeExerciseId": "…" ,
    "nodes": [ { "exerciseId": "…", "title": "…", "primaryTopics": ["…"],
                 "nodeType": "lesson", "orderInModule": 4,
                 "status": "active" } ]
  }
}
```

- Solo se envia cuando `nodes.length > 0`; con lista vacia la webview conserva
  el mock (`route.module.snapshot` tipo existente queda reservado para pushes
  de vista completa).
- La webview construye el `RoutePathModuleView` proyectando los nodos sobre su
  scaffolding visual (path, theme, distribucion de `pathT`) y actualiza su
  `dataSource` a `engine:<routeId>/<moduleId>`.

## Tooling de desarrollo

Para poder ejercitar `exercise.import` end-to-end sin nube, el binario acepta
un modo CLI de un solo uso (fuera del loop stdio):

```txt
lumen-engine build-esex <activity_dir> <output.esex>
```

Empaqueta con `esex::build_esex`, imprime `packageSha256` y sale con codigo 0;
errores de validacion salen por stderr con codigo 1. No es parte del protocolo
stdio y puede evolucionar sin versionado.

## Timeouts del bridge

Sin cambios sobre v2. `exercise.import` usa el timeout default de 10s (los
limites anti zip-bomb acotan el trabajo).

## Estado del repo

Contrato escrito en F4. Implementacion objetivo: `engine/src/protocol.rs` +
`engine/src/storage.rs` (migracion 3) + `engine/tests/protocol_v3.rs` (Rust) y
`extension/src/engine/` + `extension/src/lumenWebviewHost.ts` +
`frontend/src/webview/messages.ts` + `frontend/src/App.svelte` (TS).
