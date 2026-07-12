# Exercise Workspace

Archivo: `Architectural-plans/exercise-workspace/exercise-workspace.md`

Estado: `partial`

## Propósito

Define la separación entre el contenido instalado por Lumen y el código que
edita el estudiante. La decisión normativa está en
`Architectural-plans/decisions/0002-installed-content-and-working-copies.md`.

## Dos raíces con responsabilidades distintas

Un paquete `.esex` importado se valida y se instala como contenido inmutable.
Sus manifests, enunciados, hints y tests son la fuente editorial y de
evaluación. El estudiante no trabaja directamente sobre esos archivos.

El código editable vive en una working copy con esta identidad:

```txt
activityId + version + mode
```

Su ubicación canónica es:

```txt
~/.lumen/workspaces/{mode}/{activityId}/{version}/
```

`mode` evita que una práctica libre modifique el trabajo guiado de Route Mode.
`version` evita que una actualización de contenido reinterprete o sobrescriba
silenciosamente una solución creada para otra versión.

## Materialización

Activar un ejercicio materializa en su working copy únicamente los archivos
editables declarados en `content.starter`. La creación es idempotente:

- si el destino no existe, Lumen crea los directorios y copia el starter;
- si el destino ya existe, Lumen conserva todos sus bytes;
- repetir `exercise.activate` devuelve la misma ruta y nunca repone el starter;
- una creación parcial debe terminar en éxito completo o en error controlado,
  sin presentar como activa una working copy incompleta.

El entrypoint editable se deriva de `execution.entrypoint` dentro del árbol de
starter y se devuelve como `entrypointPath` canónico.

## Compilación y tests

F9 y F10 deben resolver el mismo entrypoint de la working copy activa. Para
evaluar una solución, el engine combina dos fuentes sin mezclarlas:

```txt
source/entrypoint   working copy editable
manifest + tests    instalación inmutable verificada
```

Los tests nunca se copian al área editable. El estudiante no necesita acceso
de escritura a los datos que determinan el veredicto.

## Reset y actualizaciones

No existe reset implícito. Un reset será una operación futura, explícita y con
confirmación; no forma parte de `exercise.activate`.

Instalar otra versión crea otra identidad de working copy. Actualizar o
reimportar un `.esex` nunca sobrescribe el trabajo de una versión existente.
Las políticas futuras de migración o copia entre versiones deberán ser
acciones explícitas y reversibles.

## Límites actuales

El slice v5 materializa y selecciona working copies para actividades locales.
Recuperación avanzada de creaciones interrumpidas, reset, migración entre
versiones y limpieza por cuotas siguen pendientes.

Este contrato de workspace no afirma aislamiento total de ejecución. Los
límites reales del runner se documentan en `solution-testing.md` y deben
describirse según lo que el engine aplique efectivamente.

## Reglas deterministas

- El contenido instalado se trata como inmutable.
- El usuario edita una working copy, nunca el paquete instalado.
- La identidad es `activityId + version + mode`.
- La materialización es idempotente y jamás sobrescribe trabajo existente.
- F9 y F10 usan el source activo de la working copy.
- El manifest y los tests siempre provienen de la instalación validada.
- Reset y migración de trabajo requieren contratos explícitos futuros.
