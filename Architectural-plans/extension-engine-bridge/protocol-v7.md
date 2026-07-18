# Engine Protocol v7

Archivo: `Architectural-plans/extension-engine-bridge/protocol-v7.md`

Contrato normativo de la versión 7 del protocolo entre Extension Host y Local
Engine. v7 extiende v6 con metadata de módulo y progreso autoritativo en el
snapshot para que Route Path View no reconstruya encabezados, contadores ni el
siguiente ejercicio a partir del mock o de los nodos.

## Versión

- `engine.healthCheck` responde `protocolVersion: 7`.
- Extension Host y engine exigen igualdad exacta y se actualizan en lockstep.

## Principio

El snapshot de módulo es la fuente de verdad de metadata pedagógica, progreso
y siguiente ejercicio. El engine lee la metadata de la instalación validada y
calcula el progreso desde SQLite; Extension Host solo transporta el resultado
y la webview solo lo presenta.

El mock queda como fallback inicial y scaffolding visual. Nunca decide
encabezados, contadores, estado completo ni la siguiente acción cuando existe
un payload del engine.

## Método `route.getModuleSnapshot`

`params`:

```json
{
  "routeId": "c",
  "moduleId": "strings"
}
```

Reglas:

- `routeId` y `moduleId` identifican un módulo con actividades instaladas y
  metadata válida en `content/modules/{routeId}/{moduleId}/module.json`.
- El engine resuelve `module.json` desde el install path; nunca desde una
  working copy ni desde una ruta enviada por la webview.
- `module.json` usa `schemaVersion: 1` y declara exactamente la identidad y los
  textos del módulo: `routeId`, `moduleId`, `moduleNumber`, `routeTitle`,
  `title` y `subtitle`.
- La identidad declarada en `module.json` debe coincidir con los parámetros de
  la solicitud. Los textos no se obtienen de manifests de ejercicios ni del
  frontend.
- `nodes` conserva la progresión secuencial autoritativa de v5 y el orden de
  `route.orderInModule`.
- `progress.completed` cuenta nodos del módulo presentes en el progreso
  autoritativo; `progress.total` cuenta las actividades instaladas vigentes del
  módulo.
- `nextExercise` es el ejercicio `active` actual, con su `exerciseId` y
  `title`. Es `null` cuando todos los nodos están completos.
- La llamada es idempotente y de solo lectura.

`result`:

```json
{
  "snapshot": {
    "routeId": "c",
    "moduleId": "strings",
    "activeExerciseId": "c.strings.count-lowercase-01",
    "module": {
      "routeId": "c",
      "moduleId": "strings",
      "moduleNumber": 2,
      "routeTitle": "Ruta C",
      "title": "Cadenas de caracteres",
      "subtitle": "char, strings y texto"
    },
    "progress": { "completed": 2, "total": 7 },
    "nextExercise": {
      "exerciseId": "c.strings.count-lowercase-01",
      "title": "Contar minúsculas en una línea"
    },
    "nodes": [
      {
        "exerciseId": "c.strings.count-lowercase-01",
        "title": "Contar minúsculas en una línea",
        "primaryTopics": ["strings", "chars"],
        "nodeType": "exercise",
        "orderInModule": 3,
        "status": "active"
      }
    ]
  }
}
```

- `module` es una proyección validada de `module.json`; `schemaVersion` valida
  el archivo pero no forma parte del resultado.
- `progress` y `nextExercise` se calculan en la misma lectura lógica que
  `nodes`; el host y la webview no los recomputan.
- `activeExerciseId` coincide con `nextExercise.exerciseId` cuando
  `nextExercise` no es `null`; ambos son `null` al completar el módulo.

Errores relevantes:

```txt
INVALID_PARAMS           routeId o moduleId no cumplen el contrato
CONTENT_ERROR            module.json falta, no se puede leer o es malformado
DATABASE_ERROR           no se pudo leer actividades o progreso autoritativo
```

Los errores de lectura o validación de `module.json` son respuestas de
protocolo controladas y recuperables; nunca producen panic.

## Puente webview

`route.module.data` se amplía en lockstep en
`extension/src/lumenProtocol.ts` y `frontend/src/webview/messages.ts`:

```ts
{
  type: "route.module.data";
  payload: {
    source: "engine";
    routeId: string;
    moduleId: string;
    activeExerciseId: string | null;
    module: {
      routeId: string;
      moduleId: string;
      moduleNumber: number;
      routeTitle: string;
      title: string;
      subtitle: string;
    };
    progress: { completed: number; total: number };
    nextExercise: { exerciseId: string; title: string } | null;
    nodes: RouteModuleDataNode[];
  };
}
```

Reglas del host:

- El host reenvía `module`, `progress` y `nextExercise` sin reinterpretarlos,
  junto con la identidad, el ejercicio activo y los nodos del snapshot.
- Tras activación o avance, el host solicita un snapshot fresco antes de
  publicar `route.module.data`.
- Un error del engine se registra y no se convierte en metadata o progreso
  inventado. La webview conserva su fallback inicial si no recibe datos.
- La webview toma encabezados de `payload.module`, contadores de
  `payload.progress` y la siguiente acción de `payload.nextExercise`; solo
  puede derivar el porcentaje para display.
- `pathT`, `labelSide`, offsets, theme y path continúan siendo scaffolding
  visual del frontend y no forman parte del contrato del engine.

## Estado del repo

v7 se implementa como slice local sobre v6 para el módulo
`content/modules/c/strings/module.json`. Metadata visual dinámica, descarga de
módulos desde Cloud, gates no secuenciales y módulos sin actividades
instaladas quedan fuera de este protocolo.
