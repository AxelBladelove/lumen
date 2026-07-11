# Engine Protocol v2

Archivo: `Architectural-plans/extension-engine-bridge/protocol-v2.md`

Contrato normativo de la version 2 del protocolo entre Extension Host y Local
Engine. v2 es un superset de v1: transporte, formas de request/response,
codigos base y los metodos `engine.healthCheck`, `session.getLastState` y
`session.saveLastState` siguen igual que en `protocol-v1.md`. Este documento
solo define lo nuevo.

## Version

- `engine.healthCheck` responde `protocolVersion: 2`.
- La extension exige igualdad exacta; ambas piezas se actualizan en lockstep.

## Alcance transicional

La coleccion de ejercicios no existe todavia. En v2 el "ejercicio activo" se
resuelve de forma transicional: la extension pasa la ruta absoluta del archivo
fuente activo y el engine valida y compila. Cuando exista Exercise Collection,
un v3 movera la resolucion del ejercicio al engine, como manda
`Architectural-plans/local-engine/compile.md`.

La ejecucion del programa compilado (ventana externa de consola) es
responsabilidad del Extension Host, que conoce Zen Mode y el layout. El engine
compila, clasifica diagnosticos, registra el intento y devuelve
`executablePath`; no lanza procesos de usuario.

## Codigos de error nuevos (engine)

```txt
SOURCE_NOT_FOUND     el archivo fuente no existe o no es un .c valido
TOOLCHAIN_NOT_FOUND  no se encontro GCC (PATH ni rutas conocidas de MSYS2)
BUILD_DIR_ERROR      no se pudo crear o escribir la carpeta .lumen-build
COMPILER_FAILED      GCC no pudo ejecutarse o termino de forma anomala
```

Los errores de compilacion del codigo del usuario NO son errores de protocolo:
son una response `ok: true` con `status: "compile_error"`.

## Metodos v2

### exercise.compile

`params`:

```json
{
  "sourcePath": "C:\\Users\\u\\.lumen\\ejercicios\\hola\\main.c"
}
```

- `sourcePath`: string no vacio, ruta absoluta a un archivo `.c` existente.
  Cualquier otra cosa es `INVALID_PARAMS`; archivo inexistente o sin extension
  `.c` es `SOURCE_NOT_FOUND`.

`result` (exito):

```json
{
  "status": "success",
  "executablePath": "C:\\...\\hola\\.lumen-build\\main.exe",
  "diagnostics": [],
  "durationMs": 132,
  "toolchain": { "compilerPath": "C:\\msys64\\ucrt64\\bin\\gcc.exe" }
}
```

`result` (error de compilacion):

```json
{
  "status": "compile_error",
  "executablePath": null,
  "diagnostics": [
    {
      "kind": "error",
      "file": "main.c",
      "line": 39,
      "column": 5,
      "message": "expected ';' before '}' token"
    }
  ],
  "rawOutput": "main.c: In function 'main': ...",
  "durationMs": 96,
  "toolchain": { "compilerPath": "C:\\msys64\\ucrt64\\bin\\gcc.exe" }
}
```

- `status`: `"success"` o `"compile_error"`. Warnings solos no bloquean:
  `status` es `"success"` y los warnings van en `diagnostics`.
- `diagnostics`: lista ordenada como los reporto GCC. Cada item:
  `kind` (`"error" | "warning" | "note"`), `file` (`string | null`, relativo a
  la carpeta del ejercicio cuando se pueda), `line` (`number | null`),
  `column` (`number | null`), `message` (string no vacio).
- `rawOutput`: presente solo en `compile_error`; stderr crudo de GCC,
  truncado a un tope razonable (64 KB) para no inflar el protocolo.
- `durationMs`: duracion total de la invocacion de GCC.

Reglas de compilacion:

- Compilador: GCC. Flags base: `-Wall -g`. Sin `-Werror`. (Hasta 2026-07-11
  incluia `-Wextra`; se retiro por paridad con Code::Blocks — ver
  `Architectural-plans/local-engine/compile.md`, seccion "Paridad".)
- Artefactos en `<carpeta del fuente>/.lumen-build/`; ejecutable con el nombre
  del fuente (`main.c` -> `main.exe` en Windows).
- Descubrimiento de GCC: primero el cache en la tabla `settings`
  (key `toolchain.gcc.path`), validando que siga existiendo; despues `gcc` en
  PATH; despues rutas conocidas de MSYS2 (`C:\msys64\ucrt64\bin\gcc.exe`,
  `C:\msys64\mingw64\bin\gcc.exe`). Al encontrarlo se cachea en `settings`.
  Si no aparece: `TOOLCHAIN_NOT_FOUND` con mensaje accionable.
- Cada invocacion registra un intento en `compile_attempts` (exito o
  `compile_error`; los fallos de protocolo no se registran). El modo se lee de
  `user_state.last_mode` (`"free"` si es null). Un fallo al registrar el
  intento no rompe la compilacion: se loguea a stderr y la response sale igual.

### toolchain.check

`params`: `{}`

`result`:

```json
{
  "status": "ready",
  "compilerPath": "C:\\msys64\\ucrt64\\bin\\gcc.exe",
  "compilerVersion": "gcc (Rev3, Built by MSYS2 project) 13.2.0"
}
```

- `status`: `"ready"` o `"missing"`. Si es `"missing"`, `compilerPath` y
  `compilerVersion` son `null` y se agrega `hint: string` con el paso sugerido
  (instalar MSYS2 UCRT64).
- Nunca responde `TOOLCHAIN_NOT_FOUND`: la ausencia de toolchain es un estado
  valido de este metodo, no un error.

## Schema v2 de la base

Migracion 2:

```sql
CREATE TABLE compile_attempts (
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
```

- `status` toma `"success" | "compile_error"`.
- La migracion sigue las reglas de v1: transaccional, registrada en
  `schema_migrations`, y si falla el engine reporta `dbStatus: "error"`.

## Timeouts del bridge

El bridge TypeScript usa 10s por default. `exercise.compile` puede tardar mas
en frio: el cliente debe permitir timeout por request y usar 60s para
`exercise.compile`. El engine ademas mata GCC si supera 30s y responde
`COMPILER_FAILED`.

## Estado del repo

Implementado: `engine/src/compile.rs` + `engine/src/protocol.rs` (Rust) y
`extension/src/engine/` + `extension/src/lumenCompile.ts` (TS). Tests de
integracion en `engine/tests/protocol_v2.rs`. El flujo F9 completo (comando,
terminal integrada, ventana externa) se describe en
`Architectural-plans/local-engine/compile.md`.
