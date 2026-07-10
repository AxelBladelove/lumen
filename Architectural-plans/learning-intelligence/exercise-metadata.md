# Exercise Metadata and Registry

Archivo: `Architectural-plans/learning-intelligence/exercise-metadata.md`

## Propósito

Este documento define la metadata rica de los ejercicios, retos, quizzes y proyectos de Lumen, además del proceso mediante el cual se validan, versionan y registran.

La metadata es el contrato pedagógico y técnico que permite a Lumen:

- construir la colección de ejercicios;
- organizar rutas y módulos;
- aplicar bloqueos y gates;
- saber qué conceptos y skills intervienen;
- interpretar tests, intentos y errores;
- alimentar el Knowledge Graph;
- actualizar el Student Model;
- recomendar ejercicios, refuerzos y proyectos con una razón explicable;
- importar y ejecutar paquetes `.esex` de forma segura.

Lumen mantiene el modelo `import then use`: la metadata y los paquetes se descubren remotamente, pero una actividad importada debe poder trabajarse localmente.

## Principio de riqueza controlada

Lumen necesita metadata rica, pero no debe convertir `manifest.json` en un basurero de datos calculados, analytics o estado del usuario.

La separación obligatoria es:

```txt
Manifest de autoría:
intención pedagógica y requisitos declarativos estables.

Manifest runtime compilado:
forma normalizada y validada que viaja dentro del paquete.

Release record:
integridad, publicación, ubicación R2 e índices D1 generados por pipeline.

Datos observados:
estadísticas agregadas por versión, separadas de la definición canónica.

Estado del estudiante:
progreso privado, intentos, mastery y recomendaciones en SQLite local.
```

Esta separación permite añadir riqueza sin crear fuentes de verdad contradictorias.

## Estado actual

El registro de ejercicios todavía no está implementado. La Route Path View usa contenido mock y D1/R2 siguen siendo arquitectura objetivo.

Antes de publicar una colección real, Lumen debe convertir este documento en un JSON Schema versionado y en validadores ejecutables.

## Fuente de verdad y flujo

Cada versión de una actividad parte de un manifest de autoría versionado.

```txt
manifest de autoría
-> validación
-> normalización
-> compilación del Knowledge Graph
-> construcción del paquete .esex
-> release record con SHA-256
-> R2 para el artefacto
-> D1 para el índice consultable
-> snapshot/cache en SQLite local
```

El manifest de autoría es la definición editorial canónica.

El manifest runtime es una proyección normalizada de esa definición, no una segunda edición manual.

D1 contiene la metadata consultable y las relaciones compiladas. R2 contiene paquetes y assets inmutables. SQLite conserva la metadata y versiones necesarias para trabajar localmente.

## Qué cuenta como actividad

`Exercise` es el nombre general del sistema y de la colección, pero el campo `kind` debe distinguir el tipo pedagógico real:

```txt
practice
challenge
quiz
project
assessment
```

`practice` es un ejercicio normal de práctica.

`challenge` reduce scaffolding o integra más conocimientos.

`quiz` evalúa conocimiento teórico o conceptual.

`project` integra varias skills mediante entregables o milestones.

`assessment` sirve como gate o medición explícita de dominio.

## Identidad y ciclo editorial

Campos authored base:

```txt
schemaVersion
id
version
kind
title
summary
language
status
```

`id` es estable a través del tiempo.

`version` identifica una publicación inmutable de contenido, tests y metadata.

`schemaVersion` identifica la versión del contrato de metadata.

`status` dentro de autoría puede ser `draft`, `review` o `approved`. El pipeline
lo usa para decidir si puede publicar, pero debe eliminarlo del manifest runtime
o congelarlo únicamente como snapshot editorial informativo. El estado mutable
de publicación, rollout o deprecación pertenece al registry.

Una versión publicada nunca se modifica en sitio.

El versionado debe distinguir:

```txt
exercise version
schema version
package format version
test contract version
taxonomy / graph version
minimum engine version
```

SemVer se interpreta así:

- `patch`: copy, traducciones o hints sin cambiar evaluación;
- `minor`: adición compatible que preserva soluciones y significado pedagógico;
- `major`: cambios incompatibles en enunciado, I/O, tests, scoring o evidencia de skills.

## Topics y foco pedagógico

Los campos originales deben conservarse explícitamente:

```txt
primaryTopics
supportTopics
combinedTopics
requiredMastery
newTopicFocus
```

`primaryTopics` contiene los topics que definen la actividad.

`supportTopics` contiene topics ya conocidos que se reutilizan como apoyo.

`combinedTopics` indica combinaciones deliberadas de conocimientos. No es una simple unión automática de arrays.

`requiredMastery` expresa el dominio previo esperado. Puede apuntar a topics, módulos o skills y debe incluir el nivel mínimo cuando la actividad dependa realmente de ese dominio.

`newTopicFocus` identifica qué conocimiento nuevo pretende introducir la actividad.

Esta distinción no debe colapsarse en un único campo `concepts`, porque el rol pedagógico se perdería.

## Learning objectives

Cada actividad oficial debe tener objetivos observables.

Un objetivo debe poder declarar:

```txt
id
description
skillIds
successCriterion
criticality
```

Los objetivos explican qué debería demostrar el estudiante, no solo qué palabras aparecen en el enunciado.

## Skills

`skills` es la unidad principal para interpretar evidencia y actualizar el Student Model.

Cada skill declarada debe incluir:

```txt
id
role
weight
criticality
evidenceStrength
```

Roles permitidos inicialmente:

```txt
introduces
practices
reinforces
assesses
integrates
```

`weight` usa un valor entre `0.0` y `1.0` e indica cuánto participa la skill en la actividad.

`criticality` distingue una skill central de una incidental.

`evidenceStrength` declara cuánta evidencia podría aportar una finalización válida; el resultado real depende de tests, asistencia y comportamiento del estudiante.

## Prerequisitos y mastery requerido

Además de `requiredMastery`, una actividad puede declarar prerequisitos detallados:

```txt
skillId
minimumMastery
minimumConfidence
kind
rationale
```

`kind` puede ser:

```txt
hard
soft
recommended
```

Un prerequisito `hard` participa en disponibilidad o readiness.

Un prerequisito `soft` puede generar una advertencia o refuerzo.

Un prerequisito `recommended` ayuda al ranking, pero no bloquea.

Los valores exactos no deben escribirse con falsa precisión. Deben partir de defaults pedagógicos centrales y revisarse con evidencia.

La precedencia es:

```txt
requiredMastery:
resumen curricular authored de lo que se espera dominar.

prerequisites:
requisitos pedagógicos normalizados por skill para readiness y recomendación.

unlock.requiresSkills:
condición de acceso que el Local Engine aplica como gate.
```

El pipeline debe comprobar que estas tres capas sean coherentes, pero no debe
tratarlas como aliases intercambiables.

## Errores y misconceptions

`commonErrors` y `misconceptions` son conceptos diferentes y ambos deben existir.

`commonErrors` describe señales observables:

```txt
off-by-one
missing-null-terminator
scanf-format-mismatch
```

`misconceptions` describe el entendimiento incorrecto que puede explicar una o varias señales:

```txt
strings.iterate-capacity-instead-of-terminator
arrays.last-valid-index-equals-length
```

Cada relación puede incluir:

```txt
id
role
diagnosticSignals
confidenceCeiling
```

Los roles iniciales son `reveals`, `remediates` y `guardsAgainst`.

Un único error de compilación no debe confirmar automáticamente una misconception. La metadata solo define relaciones posibles; el Student Model acumula evidencia.

## Relaciones pedagógicas

Los campos originales se conservan:

```txt
remediates
preparesFor
relatedProjects
```

Se añaden relaciones útiles:

```txt
contentFamily
variantOf
contrastsWith
alternativeTo
supersedes
```

`contentFamily` agrupa actividades que practican un patrón muy similar. Ayuda a evitar recomendaciones repetitivas.

`variantOf` conecta una variante con su actividad base.

`contrastsWith` permite interleaving entre actividades parecidas que exigen decisiones distintas.

`alternativeTo` conecta actividades pedagógicamente sustituibles.

`supersedes` declara una migración editorial entre identidades, no solo entre versiones.

Estas relaciones alimentan el Knowledge Graph.

Los IDs de `remediates`, `preparesFor`, `relatedProjects`, variantes y
alternativas deben ser namespaced o estar tipados por el schema. No se permiten
referencias ambiguas que puedan apuntar a tipos de nodo diferentes.

## Transferencia y espacio de solución

`transferProfile` debe expresar si la actividad repite una aplicación cercana o exige transferir conocimiento a un contexto nuevo.

Campos conceptuales:

```txt
distance
noveltyDimensions
contextShift
```

`solutionSpace` puede describir:

```txt
breadth
acceptedStrategies
discouragedShortcuts
complexityExpectations
```

`acceptedStrategies` nunca debe convertirse en una lista cerrada que rechace soluciones válidas no previstas.

## Route metadata

El objeto `route` debe conservar toda la riqueza original:

```txt
routeEligible
routeId
moduleId
orderInModule
role
masteryChallengeEligible
freeModeAfterUnlock
nodeType
```

`routeEligible` indica si la actividad puede formar parte de una ruta.

`routeId` y `moduleId` ubican la actividad cuando ya está asignada.

`orderInModule` fija su orden editorial dentro del módulo.

`role` puede ser `required`, `recommended`, `reinforcement`, `extra`, `gate` o `project`.

`masteryChallengeEligible` indica si puede funcionar como reto de comprobación de dominio.

`freeModeAfterUnlock` define si puede practicarse libremente después de ser desbloqueada.

La metadata define reglas generales. El Local Engine aplica esas reglas al estado del estudiante.

## Visibility metadata

El objeto `visibility` debe conservar:

```txt
categoryVisible
projectEligible
recommendable
```

Y añadir:

```txt
searchable
previewableWhenLocked
featuredEligible
allowedContexts
```

`categoryVisible` controla si aparece en navegación por categorías.

`projectEligible` indica si la propia actividad puede promocionarse o tratarse
como candidato de tipo proyecto. No significa lo mismo que `relatedProjects`;
un ejercicio normal puede preparar para proyectos y seguir teniendo
`projectEligible: false`.

`recommendable` permite excluir contenido válido que no debe aparecer como recomendación automática.

`searchable` controla indexación dentro de la colección.

`previewableWhenLocked` define si un usuario puede ver nombre/resumen antes de desbloquearlo.

`allowedContexts` distingue `route`, `free` o ambos.

Visibility nunca sustituye las reglas de autorización o desbloqueo.

## Difficulty metadata

La dificultad debe conservar todos los campos del modelo original.

```txt
score
band
conceptualLevel
syntaxLoad
stateControl
loopDepth
functionComplexity
arrayComplexity
matrixComplexity
stringComplexity
pointerDepth
dynamicMemoryRisk
structComplexity
fileIoComplexity
inputParsingComplexity
hiddenTraps
debugDifficulty
expectedMinutes
```

Se añaden dimensiones útiles:

```txt
algorithmicComplexity
dataFlowComplexity
edgeCaseDensity
noveltyLoad
readingLoad
toolingLoad
interactionComplexity
expectedMinutesRange
```

`score` usa una escala general `0-100`.

`band` puede usar valores editoriales como `intro`, `easy`, `easy+`, `medium`, `medium+`, `hard` y `challenge`.

Las cargas y complejidades usan una escala documentada `0-5`.

`loopDepth` expresa el máximo nivel de loops anidados esperado.

`pointerDepth` expresa el nivel máximo de indirección necesario, no una valoración subjetiva.

`expectedMinutes` conserva la estimación editorial central. `expectedMinutesRange` expresa un rango más honesto.

La dificultad observada debe almacenarse por separado y nunca sobrescribir estos valores authored.

## Unlock metadata

El objeto `unlock` debe conservar:

```txt
requiresModules
requiresExercises
requiresQuizScore
```

Y añadir:

```txt
requiresSkills
requiresProjects
requiresRouteProgress
logic
```

`requiresSkills` puede incluir mastery y confidence mínimos.

`logic` define si los requisitos se combinan mediante `all`, `any` o un grupo explícito de condiciones.

El manifest define el gate. El desbloqueo efectivo del usuario nunca vive en el manifest.

## Scaffolding y hints

La metadata debe declarar cuánto apoyo ofrece la actividad:

```txt
scaffoldingLevel
starterCompleteness
guidedSteps
hintPolicy
```

`hintPolicy` debe poder expresar:

```txt
maxHints
generationMode
progression
revealSolution
```

El default de Lumen para ejercicios normales es un máximo de cuatro pistas contextuales y progresivas.

`generationMode` puede ser `authored`, `contextual-ai` o `hybrid`.

`revealSolution` debe ser `false` por default.

El uso de pistas se registra como asistencia. No convierte automáticamente un éxito en fracaso, pero reduce la fuerza de la evidencia de independencia.

## Recommendation policy

El manifest no contiene el score personalizado de recomendación, pero sí puede declarar límites editoriales:

```txt
eligibleContexts
purposes
repeatable
cooldownDays
contentFamilyCooldown
diversityTags
targetDifficultyWindow
```

`purposes` puede incluir:

```txt
learn
practice
reinforce
remediate
review
assess
transfer
prepare-project
```

Esta policy limita o ayuda al Recommendation Engine. No decide por sí sola qué verá un estudiante concreto.

## Test contract

El objeto `testContract` debe conservar todos los campos originales:

```txt
mode
preferred
fallback
allowAdapter
allowAiAdapter
```

Y añadir:

```txt
contractVersion
phases
comparator
normalization
expectedExitCode
deterministic
seedPolicy
scoring
limits
adapterPolicy
testGroups
```

`mode` admite `io`, `function` o `hybrid`.

`allowAdapter` solo permite adapters preconstruidos, revisados y versionados.

`allowAiAdapter` significa que IA puede ayudar a producir un adapter durante curación. Nunca autoriza a generar y ejecutar código arbitrario en runtime sobre la máquina del estudiante.

`adapterPolicy` debe ser `forbidden` o `prebuilt-reviewed` en contenido publicado.

Las combinaciones válidas son:

```txt
adapterPolicy = forbidden
-> allowAdapter = false
-> allowAiAdapter = false

adapterPolicy = prebuilt-reviewed
-> allowAdapter = true
-> allowAiAdapter puede ser true solo como información del proceso de autoría
```

`testGroups` declara IDs estables que luego puede referenciar
`evidenceContract`. Un evidence source no puede apuntar a un grupo inexistente.

Las fases pueden incluir `compile`, `public`, `local-private`, `property` y `style` cuando corresponda.

Los tests distribuidos al cliente son inspeccionables. Lumen no debe llamar secretos a tests incluidos en un paquete offline.

## Evidence contract

La metadata global de skills es insuficiente para interpretar un resultado completo.

`evidenceContract` debe mapear grupos de tests o señales hacia skills y misconceptions.

Cada mapping puede incluir:

```txt
source
skillId
misconceptionId
weight
polarity
confidence
maxEvidencePerAttempt
requiresUnassisted
```

Esto permite que fallar un grupo de casos límite afecte a una skill concreta sin degradar todas las skills del ejercicio.

El mapping debe hacerse por grupos de tests, no necesariamente por cada caso individual, para mantener una carga editorial razonable.

## Execution contract

La persona autora declara requisitos semánticos, no comandos shell.

Campos iniciales:

```txt
languageStandard
compileProfile
executionMode
entrypoint
additionalSources
sourceEncoding
requiredHeaders
requiredLibraries
platformCapabilities
allowedDefines
warningsPolicy
inputModel
outputModel
sandboxProfile
```

Ejemplos de perfiles:

```txt
c17-console
c17-conio-windows
```

`platformCapabilities` puede declarar `windows-console` o `conio` cuando una actividad lo necesite.

No se permiten comandos shell arbitrarios, hooks `preBuild/postBuild`, variables de entorno libres ni URLs de dependencias ejecutables.

El Local Engine traduce perfiles permitidos a GCC/MSYS2 UCRT64 y aplica límites globales.

## Sandbox y capacidades

Una actividad puede solicitar un perfil y límites más estrictos, pero nunca elevar los máximos globales de Lumen.

Campos declarativos:

```txt
network
filesystemScope
childProcesses
stdin
timeLimitMs
memoryLimitMb
outputLimitKb
temporaryDiskMb
processLimit
```

La red debe estar desactivada por default.

El engine debe usar un working directory confinado, environment limpio y cierre del process tree.

## Content map

El manifest debe declarar los archivos lógicos del paquete:

```txt
statement
starter
tests
hints
assets
readme
```

Cada referencia puede indicar:

```txt
path
role
locale
editable
required
mediaType
```

Los hashes y tamaños reales se generan durante build, no se escriben manualmente.

## Procedencia y curación

Se conservan los campos originales:

```txt
source
sourceUrl
```

Y se estructura `origin` con:

```txt
relationship
platform
itemId
originalTitle
originalAuthors
copyrightHolder
license
attribution
modificationsSummary
```

`relationship` puede ser `original`, `adapted` o `inspired-by`.

`source` y `sourceUrl` se conservan como campos compactos de compatibilidad y
búsqueda. `origin` es el registro estructurado de procedencia y atribución.

Una URL no demuestra por sí sola permiso de distribución.

La curación debe poder declarar:

```txt
curators
pedagogicalRationale
qualityReview
aiAssisted
reviewedAt
reviewerRole
```

Notas legales internas, correos, identidad privada de reviewers o scores de riesgo no deben viajar al cliente.

## Localización y accesibilidad

Campos authored:

```txt
defaultLocale
availableLocales
localizedContent
accessibility
```

Los locale IDs deben seguir BCP-47.

`localizedContent` puede referenciar title, summary, statement e hints por idioma.

`accessibility` puede declarar:

```txt
assetAltText
longDescriptions
transcripts
plainTextFallbacks
motionWarnings
colorIndependentInstructions
```

El pipeline valida UTF-8, fallbacks y cobertura de traducción.

Las preferencias de idioma del usuario no pertenecen al manifest.

## Compatibilidad

Campos authored:

```txt
minEngineVersion
supportedPlatforms
requiredCapabilities
taxonomyVersion
migrationNotes
updateCompatibility
```

`updateCompatibility` puede ser `compatible`, `manual-review` o `breaking`.

El pipeline verifica toolchain, headers, libraries, OS y arquitectura probados.

El engine debe rechazar de forma controlada schemas o package formats futuros que no comprende.

## Metadata específica de proyectos

Cuando `kind` es `project`, se añaden:

```txt
requiredSkills
integrationSkills
milestones
deliverables
rubricCriteria
stretchGoals
recommendedPreparation
introducesNovelty
completionEvidence
```

Las skills críticas deben incluir `minimumMastery`, `minimumConfidence` y `criticality`.

El readiness de un proyecto no puede depender solo de un promedio que oculte un prerequisito crítico débil.

## Ejemplo consolidado

Este ejemplo conserva los campos del manifest original y muestra la riqueza añadida. Es conceptual; el JSON Schema ejecutable fijará tipos, enums y obligatoriedad exacta.

```json
{
  "schemaVersion": 1,
  "id": "c.strings.count-lowercase-01",
  "version": "1.0.3",
  "kind": "practice",
  "status": "approved",
  "title": "Contar minúsculas en una línea",
  "summary": "Recorre una cadena terminada en null y cuenta sus letras minúsculas.",
  "language": "c",

  "source": "codewars",
  "sourceUrl": "https://example.com/original",
  "origin": {
    "relationship": "adapted",
    "platform": "codewars",
    "itemId": "source-item-id",
    "originalTitle": "Count lowercase characters",
    "originalAuthors": ["author-id"],
    "license": "LicenseRef-ReviewRequired",
    "attribution": "Adaptado y reescrito para Lumen.",
    "modificationsSummary": "Enunciado, starter, tests y metadata pedagógica propios."
  },

  "primaryTopics": ["strings"],
  "supportTopics": ["loops", "conditionals", "functions"],
  "combinedTopics": ["strings+character-classification"],
  "requiredMastery": [
    { "id": "loops", "kind": "topic", "minimumMastery": 0.60 },
    { "id": "functions", "kind": "topic", "minimumMastery": 0.45 }
  ],
  "newTopicFocus": ["strings"],

  "learningObjectives": [
    {
      "id": "traverse-string-safely",
      "description": "Recorrer una cadena hasta el terminador null.",
      "skillIds": ["strings.traverse-null-terminated"],
      "successCriterion": "Superar los grupos de tests traversal y boundaries.",
      "criticality": "critical"
    }
  ],

  "skills": [
    {
      "id": "strings.traverse-null-terminated",
      "role": "assesses",
      "weight": 1.0,
      "criticality": "critical",
      "evidenceStrength": 0.9
    },
    {
      "id": "chars.classify-character",
      "role": "practices",
      "weight": 0.8,
      "criticality": "major",
      "evidenceStrength": 0.7
    },
    {
      "id": "loops.single-pass-iteration",
      "role": "reinforces",
      "weight": 0.5,
      "criticality": "supporting",
      "evidenceStrength": 0.4
    }
  ],

  "prerequisites": [
    {
      "skillId": "loops.single-pass-iteration",
      "minimumMastery": 0.60,
      "minimumConfidence": 0.35,
      "kind": "hard",
      "rationale": "La actividad requiere recorrer una secuencia completa."
    }
  ],

  "commonErrors": [
    "off-by-one",
    "strlen-vs-capacity",
    "missing-null-terminator"
  ],
  "misconceptions": [
    {
      "id": "strings.iterate-capacity-instead-of-terminator",
      "role": "reveals",
      "diagnosticSignals": ["test-group:boundaries", "error:out-of-bounds"],
      "confidenceCeiling": 0.75
    }
  ],
  "remediates": ["islower-confusion", "char-array-indexing"],
  "preparesFor": ["c.strings.normalize-sentence-hard", "c.quiz.strings-01"],
  "relatedProjects": ["c.project.text-menu-analyzer"],
  "contentFamily": "c.strings.single-pass-classification",
  "variantOf": null,
  "contrastsWith": ["c.strings.count-uppercase-01"],
  "alternativeTo": [],

  "transferProfile": {
    "distance": "near",
    "noveltyDimensions": ["character-classification"],
    "contextShift": "none"
  },
  "solutionSpace": {
    "breadth": "moderate",
    "acceptedStrategies": ["manual-ascii-range", "ctype-islower"],
    "discouragedShortcuts": ["hardcoded-output"],
    "complexityExpectations": "single-pass"
  },

  "route": {
    "routeEligible": true,
    "routeId": "c",
    "moduleId": "strings",
    "orderInModule": 4,
    "role": "required",
    "masteryChallengeEligible": false,
    "freeModeAfterUnlock": true,
    "nodeType": "lesson"
  },

  "visibility": {
    "categoryVisible": true,
    "projectEligible": false,
    "recommendable": true,
    "searchable": true,
    "previewableWhenLocked": true,
    "featuredEligible": true,
    "allowedContexts": ["route", "free"]
  },

  "difficulty": {
    "score": 42,
    "band": "easy+",
    "conceptualLevel": 3,
    "syntaxLoad": 3,
    "stateControl": 1,
    "loopDepth": 1,
    "functionComplexity": 2,
    "arrayComplexity": 2,
    "matrixComplexity": 0,
    "stringComplexity": 4,
    "pointerDepth": 0,
    "dynamicMemoryRisk": 0,
    "structComplexity": 0,
    "fileIoComplexity": 0,
    "inputParsingComplexity": 3,
    "hiddenTraps": 3,
    "debugDifficulty": 2,
    "algorithmicComplexity": 1,
    "dataFlowComplexity": 2,
    "edgeCaseDensity": 3,
    "noveltyLoad": 2,
    "readingLoad": 1,
    "toolingLoad": 1,
    "interactionComplexity": 1,
    "expectedMinutes": 20,
    "expectedMinutesRange": { "min": 12, "max": 30 }
  },

  "unlock": {
    "requiresModules": ["loops", "functions"],
    "requiresExercises": [],
    "requiresQuizScore": null,
    "requiresSkills": [
      { "skillId": "loops.single-pass-iteration", "minimumMastery": 0.60 }
    ],
    "requiresProjects": [],
    "requiresRouteProgress": null,
    "logic": "all"
  },

  "scaffolding": {
    "scaffoldingLevel": 2,
    "starterCompleteness": 0.35,
    "guidedSteps": false,
    "hintPolicy": {
      "maxHints": 4,
      "generationMode": "contextual-ai",
      "progression": "increasing-specificity",
      "revealSolution": false
    }
  },

  "recommendationPolicy": {
    "eligibleContexts": ["route", "free"],
    "purposes": ["learn", "reinforce", "remediate"],
    "repeatable": true,
    "cooldownDays": 3,
    "contentFamilyCooldown": 2,
    "diversityTags": ["text", "single-pass", "classification"],
    "targetDifficultyWindow": { "min": -8, "max": 10 }
  },

  "testContract": {
    "contractVersion": 1,
    "mode": "hybrid",
    "preferred": "function",
    "fallback": "io",
    "allowAdapter": true,
    "allowAiAdapter": true,
    "adapterPolicy": "prebuilt-reviewed",
    "phases": ["compile", "public", "local-additional"],
    "comparator": "exact-after-normalization",
    "normalization": ["crlf-to-lf", "trim-final-newline"],
    "expectedExitCode": 0,
    "deterministic": true,
    "seedPolicy": "fixed",
    "scoring": "weighted-groups",
    "testGroups": [
      { "id": "traversal", "phase": "public", "weight": 0.6 },
      { "id": "boundaries", "phase": "local-additional", "weight": 0.4 }
    ],
    "limits": {
      "timeLimitMs": 2000,
      "memoryLimitMb": 128,
      "outputLimitKb": 256
    }
  },

  "evidenceContract": {
    "groups": [
      {
        "source": "test-group:traversal",
        "skillId": "strings.traverse-null-terminated",
        "misconceptionId": null,
        "weight": 1.0,
        "polarity": "bidirectional",
        "confidence": 0.9,
        "maxEvidencePerAttempt": 1.0,
        "requiresUnassisted": false
      },
      {
        "source": "test-group:boundaries",
        "skillId": "strings.traverse-null-terminated",
        "misconceptionId": "strings.iterate-capacity-instead-of-terminator",
        "weight": 0.8,
        "polarity": "bidirectional",
        "confidence": 0.8,
        "maxEvidencePerAttempt": 0.8,
        "requiresUnassisted": false
      }
    ]
  },

  "execution": {
    "languageStandard": "c17",
    "compileProfile": "c17-console",
    "executionMode": "console",
    "entrypoint": "starter/main.c",
    "additionalSources": [],
    "sourceEncoding": "utf-8",
    "requiredHeaders": ["stdio.h", "ctype.h"],
    "requiredLibraries": [],
    "platformCapabilities": ["windows-console"],
    "allowedDefines": [],
    "warningsPolicy": "recommended",
    "inputModel": "stdin-lines",
    "outputModel": "stdout-text",
    "sandboxProfile": "c-console-default"
  },

  "sandbox": {
    "network": false,
    "filesystemScope": "exercise-directory",
    "childProcesses": false,
    "stdin": true,
    "timeLimitMs": 2000,
    "memoryLimitMb": 128,
    "outputLimitKb": 256,
    "temporaryDiskMb": 32,
    "processLimit": 1
  },

  "content": {
    "statement": { "path": "statement.md", "locale": "es", "required": true },
    "starter": [
      { "path": "starter/main.c", "role": "entrypoint", "editable": true, "required": true }
    ],
    "tests": [
      { "path": "tests/io-cases.json", "role": "test-data", "editable": false, "required": true },
      { "path": "tests/harness.c", "role": "function-harness", "editable": false, "required": true }
    ],
    "hints": [
      { "path": "hints/hints.es.json", "locale": "es", "editable": false, "required": false }
    ],
    "assets": [],
    "readme": { "path": "README.md", "locale": "es", "required": false }
  },

  "localization": {
    "defaultLocale": "es",
    "availableLocales": ["es"],
    "localizedContent": {
      "es": {
        "title": "Contar minúsculas en una línea",
        "summary": "Recorre una cadena terminada en null y cuenta sus letras minúsculas."
      }
    }
  },

  "accessibility": {
    "assetAltText": {},
    "longDescriptions": {},
    "transcripts": {},
    "plainTextFallbacks": {},
    "motionWarnings": false,
    "colorIndependentInstructions": true
  },

  "compatibility": {
    "minEngineVersion": "0.1.0",
    "supportedPlatforms": ["windows-x64"],
    "requiredCapabilities": ["gcc-ucrt64"],
    "taxonomyVersion": 1,
    "migrationNotes": null,
    "updateCompatibility": "compatible"
  },

  "curation": {
    "curators": ["lumen-core"],
    "pedagogicalRationale": "Introduce recorrido seguro de strings sin mezclar memoria dinámica.",
    "qualityReview": "approved",
    "aiAssisted": true,
    "reviewedAt": "2026-07-10",
    "reviewerRole": "content-curator"
  }
}
```

## Datos generados por pipeline

Estos datos no se escriben manualmente como intención pedagógica:

```txt
packageFormatVersion
normalizedFileInventory
fileMediaTypes
fileSizes
fileSha256
compressedSize
uncompressedSize
packageSha256
signature
keyId
builderVersion
builtAt
publishedAt
r2ObjectKey
r2ETag
sourceFingerprint
deduplicationFingerprint
metadataCompleteness
testSkillAlignment
prerequisiteClosure
graphDepth
skillCoverageVector
candidateNeighborhood
reachableProjects
searchTokensByLocale
```

El digest total debe calcularse fuera del propio paquete y entregarse mediante el release record o Workers API.

R2 debe usar objetos inmutables, idealmente content-addressed:

```txt
packages/<id>/<version>/<sha256>.esex
```

## Datos observados

Las estadísticas observadas se guardan por `activityId + version` y nunca sustituyen la metadata authored.

Pueden incluir:

```txt
sampleSize
confidence
completionRate
unassistedSuccessRate
attemptQuantiles
activeTimeQuantiles
hintUsageRate
tutorUsageRate
dropoffRate
errorDistribution
observedDifficulty
skillDiscrimination
testFailureDistribution
```

Solo deben usarse con muestras suficientes, privacidad y consentimiento cuando corresponda.

Con diez usuarios, Lumen debe asumir que gran parte de estas métricas tendrá baja confianza.

## Datos que nunca pertenecen al manifest

Nunca deben incluirse:

- progreso o mastery del estudiante;
- intentos o errores personales;
- recomendaciones personalizadas;
- desbloqueo efectivo del usuario;
- IDs personales o preferencias;
- código del estudiante;
- credenciales, API keys, tokens o signed URLs;
- rutas absolutas locales;
- comandos shell arbitrarios;
- prompts privados del AI Gateway;
- soluciones o answer keys;
- notas legales/editoriales internas;
- analytics agregados como si fueran definición canónica;
- estado mutable de rollout o deprecación como única verdad.

Estos datos pertenecen a SQLite local, al registry privado o a sistemas separados según el caso.

## Registro y publicación

Registrar una actividad significa convertir una definición editorial en contenido consumible por Lumen.

El pipeline debe:

1. Cargar manifest y taxonomía.
2. Validar JSON Schema.
3. Normalizar IDs, enums y defaults.
4. Validar topics, skills, misconceptions y relaciones.
5. Rechazar ciclos en prerequisitos `requires`.
6. Validar coherencia entre `difficulty.score`, `band` y sus dimensiones.
7. Validar que objetivos, skills, test groups y evidence contract estén alineados.
8. Validar coherencia entre `testContract` y los archivos de `content.tests`.
9. Validar archivos, locales y accesibilidad.
10. Resolver un compile profile permitido.
11. Compilar y ejecutar tests en la matriz soportada.
12. Validar sandbox y capacidades.
13. Construir `.esex` reproducible.
14. Calcular inventario, tamaños y SHA-256.
15. Firmar el release cuando la infraestructura lo permita.
16. Subir el objeto inmutable a R2.
17. Escribir el release record y proyección indexada en D1.
18. Compilar nodos/aristas del Knowledge Graph.
19. Publicar snapshot y catalog version de forma atómica.

Si cualquier paso falla, no se publica una versión parcial.

## Instalación segura

Al importar, el Local Engine debe:

1. Resolver una versión compatible.
2. Obtener metadata autorizada y digest desde Workers API.
3. Descargar el paquete.
4. Verificar tamaño, SHA-256 y firma si existe.
5. Extraer en staging.
6. Rechazar path traversal, rutas absolutas, symlinks, hardlinks, device names y zip bombs.
7. Validar schema, package format y engine compatibility.
8. Materializar mediante rename atómico.
9. Registrar la instalación en SQLite.
10. Preservar siempre archivos modificados por el usuario.

Las versiones deben poder coexistir. Un update nunca debe aplicar starter code nuevo encima del trabajo del estudiante sin consentimiento.

## Ejercicios creados por el usuario

Un ejercicio propio puede funcionar con metadata mínima:

```txt
localId
title
kind
language
entrypoint
compileProfile
createdAt
```

Lumen puede compilarlo, registrar intentos y usar Ask Tutor.

Sin metadata pedagógica suficiente, no debe tratarlo como evidencia fuerte de mastery ni como pieza oficial de una ruta.

Si el usuario o un proceso asistido enriquecen su metadata, esa metadata debe marcar origen, confidence y estado de revisión.

## Tech stack del módulo

- **JSON Schema** para el contrato versionado.
- **Rust** para validación, normalización, packaging y registro.
- **`.esex`** como paquete inmutable.
- **SHA-256** y firma opcional para integridad.
- **Cloudflare R2** para paquetes y assets.
- **Cloudflare D1** para release records, índices y grafo normalizado.
- **Cloudflare Workers** como única puerta del cliente al registro remoto.
- **SQLite local** para cache, instalaciones y metadata necesaria offline.

## Reglas deterministas

Toda la riqueza del modelo original debe conservarse.

`primaryTopics`, `supportTopics` y `combinedTopics` no se colapsan.

`commonErrors` y `misconceptions` no son sinónimos.

La dificultad multidimensional authored no se reemplaza por estadísticas observadas.

`route`, `visibility`, `unlock` y `testContract` son objetos contractuales explícitos.

`allowAiAdapter` nunca autoriza código generado en runtime.

El manifest describe intención estable; el pipeline genera integridad y derivados.

El estado del estudiante nunca entra en el paquete.

D1 y el Knowledge Graph se derivan de la misma fuente validada.

Los objetos publicados son inmutables.

Una versión inválida falla completa.

La importación protege primero el trabajo local del usuario.
