# Engine Protocol v5

Archivo: `Architectural-plans/extension-engine-bridge/protocol-v5.md`

Contrato normativo de la versión 5 del protocolo entre Extension Host y Local
Engine. v5 extiende v4 con activación real y working copies; los métodos de
v1-v4 permanecen disponibles salvo las precisiones de resolución de source
definidas aquí.

## Versión

- `engine.healthCheck` responde `protocolVersion: 5`.
- Extension Host y engine exigen igualdad exacta y se actualizan en lockstep.

## Principio

El engine decide activación, bloqueo y progreso. La extensión coordina la
apertura del archivo devuelto y la webview representa el snapshot; ninguna de
las dos inventa estados de nodos.

El contenido instalado y el trabajo editable se separan según ADR 0002 y
`exercise-workspace.md`.

## Método `exercise.activate`

`params`:

```json
{
  "exerciseId": "c.strings.count-lowercase-01",
  "mode": "route",
  "workspaceRoot": "C:\\Users\\ana\\.lumen"
}
```

Reglas:

- `exerciseId` debe identificar una actividad instalada y validada.
- `mode` forma parte de la identidad de la working copy.
- `workspaceRoot` es la raíz local proporcionada por el host (`~/.lumen`). El
  engine deriva `workspaces/{mode}/{activityId}/{version}`; no acepta que el
  manifest escape de esa raíz.
- En `route`, solo se activan nodos `active` o `completed`. Un nodo `locked`
  se rechaza con `ACTIVITY_LOCKED` y no modifica estado ni archivos.
- Un nodo `completed` es reabrible para repetirlo. Reabrirlo no elimina su
  progreso ni cambia el primer incompleto de la secuencia.
- La creación es idempotente y nunca sobrescribe una working copy existente.
- Solo después de resolver o crear una working copy válida se persiste el
  ejercicio activo.

`result`:

```json
{
  "created": true,
  "active": {
    "exerciseId": "c.strings.count-lowercase-01",
    "version": "1.0.0",
    "installPath": "C:\\Users\\ana\\AppData\\...\\activities\\c.strings.count-lowercase-01\\1.0.0",
    "workspacePath": "C:\\Users\\ana\\.lumen\\workspaces\\route\\c.strings.count-lowercase-01\\1.0.0",
    "entrypointPath": "C:\\Users\\ana\\.lumen\\workspaces\\route\\c.strings.count-lowercase-01\\1.0.0\\starter\\main.c",
    "title": "Contar minúsculas en una línea",
    "routeId": "c",
    "moduleId": "strings",
    "nodeType": "exercise"
  }
}
```

`created` es `true` únicamente cuando esta llamada materializó el starter;
es `false` al reabrir la misma working copy. La presencia de `active` confirma
que el estado se persistió. `active.workspacePath` y
`active.entrypointPath` son rutas absolutas.

Errores relevantes:

```txt
ACTIVITY_NOT_FOUND       no existe una instalación válida para exerciseId
ACTIVITY_UNSUPPORTED     la actividad no pertenece a una ruta en mode=route
ACTIVITY_LOCKED          la progresión de Route Mode no permite activarla
WORKSPACE_ERROR          la ruta no es segura o no se pudo materializar
DATABASE_ERROR           no se pudo leer o persistir la activación
```

## Resolución de compilación y tests

Después de activar, `exercise.compile` y `exercise.runTests` deben usar el
entrypoint de la working copy activa. `exercise.runTests` conserva el manifest
y `tests/io-cases.json` de la instalación validada. Nunca ejecuta el starter
instalado como si fuera la solución del usuario.

## `route.getModuleSnapshot` en v5

Los nodos se ordenan por `route.orderInModule`. Para una secuencia sin gates
adicionales:

1. todo ejercicio presente en `exercise_progress` es `completed`;
2. el primer ejercicio no completado es `active`;
3. los incompletos posteriores son `locked`.

El snapshot es secuencial y autoritativo. `activeExerciseId` identifica el
primer incompleto, aunque el usuario haya reabierto temporalmente un nodo
completado. Si todos están completos, `activeExerciseId` es `null` y no hay
nodos `active`.

Seleccionar un nodo bloqueado no cambia el snapshot. Completar el nodo activo
y volver a consultar el snapshot mueve `active` al siguiente incompleto en la
misma secuencia.

## Puente webview

`route.node.selected` y `route.continue.requested` son intenciones. Extension
Host llama `exercise.activate`, abre `entrypointPath` solo tras éxito y luego
publica un snapshot fresco. `route.module.data` es la única fuente de
estados de progreso para la vista.

## Estado del repo

Route Loop v5 implementa este contrato como slice local para actividades
instaladas. Gates no secuenciales, reset, migración de working copies y
aislamiento total del sandbox quedan fuera de este protocolo.
