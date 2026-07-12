# Engine Protocol v6

Archivo: `Architectural-plans/extension-engine-bridge/protocol-v6.md`

Contrato normativo de la versión 6 del protocolo entre Extension Host y Local
Engine. v6 extiende v5 con lectura de detalle del ejercicio (enunciado, hints
y progreso) para que el panel derecho de Lumen pueda mostrar la información
que `route-mode.md` exige sin que la webview invente estados.

## Versión

- `engine.healthCheck` responde `protocolVersion: 6`.
- Extension Host y engine exigen igualdad exacta y se actualizan en lockstep.

## Principio

El detalle de un ejercicio es una lectura pura: nunca modifica progreso,
working copies ni ejercicio activo. El enunciado y los hints se leen de la
instalación validada (nunca de la working copy, que el usuario puede haber
editado). El progreso sale de las mismas tablas autoritativas que el snapshot.

## Método `exercise.getDetail`

`params`:

```json
{
  "exerciseId": "c.strings.count-lowercase-01"
}
```

Reglas:

- `exerciseId` debe identificar una actividad instalada y validada.
- La progresión de Route Mode aplica igual que en `exercise.activate`: un
  nodo `locked` se rechaza con `ACTIVITY_LOCKED`. Los nodos `active` y
  `completed` son consultables. `previewableWhenLocked` queda fuera de este
  protocolo (llega con la colección de ejercicios).
- `statementMarkdown` es el contenido UTF-8 de `content.statement.path` del
  manifest, leído desde el install path.
- `hints` es la lista ordenada por `order` de `content.hints` cuando existe;
  `[]` cuando el manifest no declara hints o el archivo no existe. Un archivo
  de hints declarado pero ilegible o malformado es `CONTENT_ERROR`.
- La llamada es idempotente y de solo lectura.

`result`:

```json
{
  "detail": {
    "exerciseId": "c.strings.count-lowercase-01",
    "version": "1.0.0",
    "title": "Contar minúsculas en una línea",
    "summary": "Recorre una cadena y cuenta sus letras minúsculas.",
    "statementMarkdown": "# Contar minúsculas…",
    "hints": [{ "order": 1, "text": "Una cadena en C termina en '\\0'…" }],
    "status": "active",
    "nodeType": "exercise",
    "primaryTopics": ["strings", "chars"],
    "difficulty": { "band": "easy", "score": 35, "expectedMinutes": 18 },
    "progress": {
      "completed": false,
      "attempts": { "total": 3, "passed": 0, "lastRunAt": "2026-07-11T17:20:04Z" }
    }
  }
}
```

- `status` refleja la progresión secuencial de v5 (`active` o `completed`;
  `locked` nunca llega aquí porque se rechaza antes).
- `attempts.total` cuenta ejecuciones de `exercise.runTests` registradas para
  el ejercicio; `attempts.passed` las que aprobaron todos los casos;
  `lastRunAt` es UTC ISO-8601 o `null` sin intentos.
- `difficulty` proyecta `difficulty.band`, `difficulty.score` y
  `difficulty.expectedMinutes` del manifest.

Errores relevantes:

```txt
ACTIVITY_NOT_FOUND       no existe una instalación válida para exerciseId
ACTIVITY_LOCKED          la progresión de Route Mode no permite consultarla
CONTENT_ERROR            statement o hints declarados ilegibles o malformados
DATABASE_ERROR           no se pudo leer progreso o intentos
```

## Puente webview

Nuevos mensajes del protocolo webview (lockstep en
`extension/src/lumenProtocol.ts` y `frontend/src/webview/messages.ts`):

```ts
// Extension Host -> webview
{
  type: "exercise.detail.data";
  payload: {
    source: "engine";
    detail: ExerciseDetailPayload | null;
  };
}

// webview -> Extension Host (intención; el host decide)
{
  type: "exercise.detail.requested";
  payload: { exerciseId: string };
}

type ExerciseDetailPayload = {
  exerciseId: string;
  version: string;
  title: string;
  summary: string;
  statementMarkdown: string;
  hints: { order: number; text: string }[];
  status: "active" | "completed";
  nodeType: string;
  primaryTopics: string[];
  difficulty: { band: string; score: number; expectedMinutes: number };
  progress: {
    completed: boolean;
    attempts: { total: number; passed: number; lastRunAt: string | null };
  };
};
```

Reglas del host:

- Tras una activación exitosa (`exercise.activate`), el host publica el
  snapshot fresco y después `exercise.detail.data` del ejercicio activado.
- Tras cada `route.module.data`, el host publica el detail del
  `activeExerciseId` vigente, o `detail: null` cuando el módulo está completo.
- `exercise.detail.requested` responde con `exercise.detail.data` del
  ejercicio pedido. Si el engine lo rechaza (p. ej. `ACTIVITY_LOCKED`), el
  host publica `detail: null` sin romper la vista; la webview no debe pedir
  detalles de nodos bloqueados.
- La webview renderiza `statementMarkdown` con su propio renderer de subset
  markdown con escape total de HTML; no ejecuta HTML embebido.

## Estado del repo

v6 se implementa como slice local sobre el Route Loop v5. La visibilidad de
enunciados bloqueados en la colección, la persistencia de hints revelados y
el gating de hints por intentos quedan fuera de este protocolo.
