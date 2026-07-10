# Contrato: Activity

Estado: `partial`

## Propósito

Este contrato define la forma normativa del manifest de autoría de una actividad de Lumen (`practice`, `challenge`, `quiz`, `project`, `assessment`).

La explicación pedagógica completa vive en `Architectural-plans/learning-intelligence/exercise-metadata.md`. Ese documento explica; este contrato norma. Cuando haya conflicto, gana este contrato y su schema ejecutable.

## Fuente de verdad

La definición campo a campo (tipos, enums, obligatoriedad) NO se duplica en prosa. Vive en el schema ejecutable versionado:

```txt
contracts/activity-manifest.v1.schema.json
```

Los IDs pedagógicos válidos (topics, skills, misconceptions, módulos, errores comunes) viven en la taxonomía versionada:

```txt
contracts/taxonomy.v1.json
```

Los ejemplos válidos e inválidos que fijan el comportamiento esperado del validador viven en:

```txt
contracts/examples/valid/
contracts/examples/invalid/
```

Estos tres artefactos son parte del contrato. Cambiarlos es cambiar el contrato.

## Estado actual del repo

Existen el schema v1, la taxonomía v1 (semilla centrada en el módulo Cadenas de Ruta C), los ejemplos y un validador ejecutable en el Local Engine (`engine/src/manifest.rs`, cubierto por `cargo test`). Todavía no existen: pipeline de contenido, formato `.esex`, importación, ni ninguna actividad publicada. El validador aún no se expone por protocolo; eso llega con la importación de ejercicios.

## Identidad

- `id` es estable a través del tiempo y globalmente único.
- Formato de `id` de actividad: `<language>.<module>.<kebab-name>-<NN>` (ejemplo: `c.strings.count-lowercase-01`).
- Formato de IDs de taxonomía: `<topic>.<kebab-name>` para skills y misconceptions (ejemplo: `strings.traverse-null-terminated`).
- Toda referencia entre actividades (`preparesFor`, `variantOf`, `alternativeTo`, `supersedes`, `contrastsWith`, `remediates` hacia actividades) usa IDs completos, nunca nombres sueltos.

## Versionado

- `version` usa SemVer y cada publicación es inmutable: una versión publicada nunca se edita en sitio.
- `schemaVersion` identifica la versión de este contrato. El schema v1 es `schemaVersion: 1`.
- `patch`: copy, traducciones o hints sin cambiar evaluación. `minor`: adición compatible. `major`: cambio incompatible en enunciado, I/O, tests, scoring o evidencia.
- Un consumidor (engine, pipeline, cloud) debe rechazar de forma controlada un `schemaVersion` que no comprende.

## Separación de capas

El manifest de autoría contiene solo intención pedagógica declarativa. Nunca contiene:

- estado del estudiante (progreso, mastery, intentos, desbloqueo efectivo);
- datos generados por pipeline (hashes, tamaños, firmas, ubicaciones R2);
- estadísticas observadas;
- credenciales, rutas absolutas locales, comandos shell o prompts privados;
- soluciones o answer keys.

## Invariantes

El validador aplica estas invariantes además del schema. Una violación rechaza el manifest completo; no existen publicaciones parciales.

1. Todo `skillId`, `misconceptionId`, topic, `moduleId` y error común referenciado debe existir en la taxonomía declarada por `compatibility.taxonomyVersion`.
2. Todo `source` de `evidenceContract.groups` que use `test-group:<id>` debe apuntar a un `testGroups[].id` existente en `testContract`.
3. Combinaciones de adapters: `adapterPolicy: forbidden` exige `allowAdapter: false` y `allowAiAdapter: false`; `adapterPolicy: prebuilt-reviewed` exige `allowAdapter: true`.
4. `requiredMastery`, `prerequisites` y `unlock.requiresSkills` son capas distintas y coherentes: un skill con prerequisito `hard` no puede faltar en `unlock` si `unlock.requiresSkills` no está vacío, y los umbrales de `unlock` no pueden ser más exigentes que los declarados en `prerequisites` para el mismo skill.
5. `weight`, `evidenceStrength`, `confidence`, mastery y confidence mínimos están en `[0.0, 1.0]`; `difficulty.score` en `[0, 100]`; cargas dimensionales en `[0, 5]`.
6. `difficulty.band` debe ser coherente con `difficulty.score` según los rangos que fija el schema.
7. Una actividad no puede referenciarse a sí misma en ninguna relación.
8. `content.statement` y al menos un `content.starter` con `role: entrypoint` son obligatorios para `kind: practice` y `kind: challenge`; `execution.entrypoint` debe coincidir con un path declarado en `content`.
9. `route.orderInModule` es `>= 1` y solo tiene sentido si `routeEligible` es `true` y `routeId`/`moduleId` están presentes.
10. Los `learningObjectives[].skillIds` deben ser un subconjunto de los `skills[].id` declarados.
11. Paths de `content` son relativos, sin `..`, sin rutas absolutas y sin backslashes.

## Validación

- El pipeline de contenido valida antes de publicar.
- El Local Engine valida al importar y nunca confía en que el paquete ya fue validado remotamente.
- Ambos usan el mismo contrato: el schema y las invariantes de este documento, implementados en Rust (`engine/src/manifest.rs`).

## Compatibilidad y migración

Un cambio de contrato que agregue campos opcionales mantiene `schemaVersion`. Un cambio que agregue obligatoriedad, elimine campos o cambie semántica publica un schema nuevo (`v2`) y conserva el anterior mientras existan actividades publicadas con él. Las migraciones se documentan en `Architectural-plans/decisions/`.
