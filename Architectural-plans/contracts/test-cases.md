# Contrato: IO Test Cases

Estado: `partial`

## Propósito

Este contrato define el archivo de casos de prueba de entrada/salida de una actividad (`tests/io-cases.json` en el content map, con `role: test-data`). Es el formato que consume Solution Testing en modo `io`.

La explicación pedagógica vive en `Architectural-plans/exercise-system/solution-testing.md`. Ese documento explica; este contrato norma.

## Fuente de verdad

La definición campo a campo vive en el schema ejecutable versionado:

```txt
contracts/io-test-cases.v1.schema.json
```

## Relación con el manifest

El archivo de casos no repite configuración que ya es del `testContract` del manifest. `comparator`, `normalization`, `expectedExitCode` y `limits` se declaran una sola vez, en el manifest. Cada caso pertenece a un `testGroups[].id` del manifest mediante su campo `group`; la fase del grupo (`public`, `local-private`, …) decide si el caso es visible como parte del contrato o comprueba generalización. No existe un flag `hidden` por caso.

Los tests distribuidos al cliente son inspeccionables; Lumen no llama secretos a tests incluidos en un paquete offline.

## Invariantes

1. Los `id` de caso son únicos dentro del archivo.
2. Todo `group` referenciado por un caso existe en `testContract.testGroups` del manifest de la actividad.
3. Todo test group del manifest con fase `public` o `local-private` tiene al menos un caso.
4. `timeoutMs` de un caso, si existe, no supera `testContract.limits.timeLimitMs`.
5. `expectedStdout` se compara después de aplicar la `normalization` del manifest; la normalización nunca esconde errores semánticos.
6. `weight` de caso es relativo dentro de su grupo; el peso del grupo vive en el manifest.

El validador aplica las invariantes 1 y (cuando dispone del manifest) 2–4 junto al schema. Una violación rechaza el archivo completo.

## Compatibilidad

`formatVersion` identifica la versión de este contrato. Las reglas de migración son las mismas del contrato `activity.md`.
