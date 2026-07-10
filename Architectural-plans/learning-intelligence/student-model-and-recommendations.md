# Student Model and Recommendations

Archivo: `Architectural-plans/learning-intelligence/student-model-and-recommendations.md`

## Propósito

Este documento define cómo Lumen transforma actividad real del estudiante en un modelo de rendimiento y cómo usa ese modelo para recomendar ejercicios, refuerzos y proyectos.

La primera versión debe ser explicable y determinista. No necesita una red neuronal.

La arquitectura debe conservar eventos suficientes para que el algoritmo pueda evolucionar más adelante sin perder el historial original.

## Separación de responsabilidades

El sistema tiene cuatro piezas:

```txt
Exercise Metadata:
declara qué conocimientos implica una actividad.

Knowledge Graph:
conecta conocimientos, errores, actividades y proyectos.

Student Model:
estima el estado del estudiante a partir de evidencia.

Recommendation Engine:
elige el siguiente contenido útil y explica por qué.
```

El frontend muestra resultados. El Local Engine registra evidencia, actualiza el modelo y calcula recomendaciones. SQLite persiste. D1 distribuye las definiciones pedagógicas, no el progreso obligatorio del usuario.

## Evidencia, no telemetría decorativa

Lumen no debe confundir cualquier interacción con aprendizaje.

Abrir un archivo no demuestra dominio.

Permanecer mucho tiempo en un ejercicio tampoco demuestra esfuerzo o comprensión por sí solo.

La evidencia inicial puede provenir de:

- resultados de tests;
- finalización válida de una actividad;
- compilaciones exitosas o fallidas;
- errores clasificados;
- número y tipo de intentos;
- uso de pistas;
- uso de Ask Tutor;
- tiempo activo aproximado;
- repetición posterior sin ayuda;
- quizzes o gates.

Cada tipo de evidencia debe tener una fuerza y una confiabilidad diferentes.

Un test correcto aporta evidencia positiva fuerte sobre las skills que realmente evalúa. Un build exitoso solo demuestra que el programa compila. Un error de sintaxis aporta evidencia débil y localizada; no demuestra que el estudiante no entienda todo el concepto.

## Event log local

El Local Engine debe registrar eventos pedagógicos estructurados antes de resumirlos.

Eventos iniciales:

```txt
attempt.started
compile.completed
tests.completed
hint.requested
tutor.requested
exercise.completed
quiz.completed
project.milestone_completed
```

Cada evento debe incluir lo necesario para reconstruir su significado:

```txt
eventId
timestamp
activityId
activityVersion
mode
attemptId
outcome
assistanceLevel
errorCodes
durationActive
```

No debe guardar el código completo del usuario por default.

El event log permite recalcular el modelo con una versión nueva del algoritmo y auditar por qué cambió una estimación.

## Estado por skill

El Student Model debe mantener un estado agregado por skill.

Campos conceptuales:

```txt
skillId
mastery
confidence
positiveEvidence
negativeEvidence
exposures
assistedSuccesses
unassistedSuccesses
recentFailureCount
lastPracticedAt
retentionStability
independence
transferEvidence
fluency
trend
modelVersion
```

`mastery` estima el dominio actual entre `0.0` y `1.0`.

`confidence` expresa cuánta evidencia respalda esa estimación. Un mastery alto con una sola observación no equivale a mastery alto con diez observaciones separadas.

Lumen debe mostrar ambos conceptos de forma diferente cuando importe. No debe presentar una estimación incierta como una verdad.

## Modelo inicial

La primera versión debe usar acumulación bayesiana de evidencia por skill, no deep learning.

Cada skill puede representarse con dos acumuladores positivos:

```txt
alpha = evidencia positiva acumulada
beta  = evidencia negativa acumulada
mastery = alpha / (alpha + beta)
```

Los priors iniciales, pesos de evento y umbrales deben vivir en una configuración versionada del modelo, no dispersos como números mágicos.

Cuando llega un evento:

1. El engine carga la metadata y el `evidenceContract` de la actividad.
2. Identifica qué grupos de tests o señales produjeron el resultado.
3. Resuelve las skills y misconceptions conectadas a esas señales.
4. Convierte el resultado en evidencia positiva y/o negativa.
5. Multiplica esa evidencia por peso, polaridad, confidence y límite por intento.
6. Reduce la fuerza de un éxito si necesitó ayuda intensa.
7. Actualiza solo las skills y misconceptions afectadas.
8. Recalcula recomendaciones conectadas a ese vecindario del grafo.

Este modelo es deliberadamente simple, incremental y explicable. Está inspirado por la idea de knowledge tracing, pero no debe llamarse BKT completo mientras no use y calibre formalmente sus parámetros de aprendizaje, guess y slip.

Conservar el event log permite sustituir el acumulador por BKT, IRT u otro modelo más adelante sin cambiar la arquitectura del producto.

## Recencia y olvido

La falta de práctica debe afectar readiness y recomendaciones, pero no debe borrar evidencia histórica.

Lumen debe calcular una `freshness` derivada de `lastPracticedAt` y usarla al rankear repasos.

El mastery almacenado representa la evidencia acumulada. El `effectiveMastery` usado para una recomendación puede aplicar una penalización suave por recencia.

Los parámetros de recencia deben ser versionados y ajustables por skill o grupo de skills.

## Misconceptions y errores

Los errores del compilador no deben convertirse directamente en conceptos débiles mediante texto libre.

El Local Engine debe clasificar errores en códigos normalizados cuando sea posible.

Ejemplos:

```txt
syntax.missing-semicolon
strings.missing-null-terminator
arrays.index-out-of-bounds
input.scanf-format-mismatch
```

La metadata y el grafo conectan esos códigos con misconceptions y skills.

Una misconception se considera activa cuando existe evidencia reciente suficiente. No debe quedar marcada para siempre por un único fallo.

## Generación de candidatos

El recomendador no debe puntuar toda la colección sin criterio en cada interacción.

Primero genera un conjunto pequeño de candidatos desde:

- el siguiente paso válido de Route Mode;
- skills con mastery bajo o confidence insuficiente;
- misconceptions activas;
- prerequisitos débiles de una actividad bloqueada;
- actividades de repaso por recencia;
- ejercicios relacionados con el objetivo elegido en Free Mode;
- proyectos cercanos al readiness del estudiante.

Después aplica filtros obligatorios:

- disponibilidad;
- bloqueo de ruta;
- lenguaje;
- versión válida;
- paquete accesible o ya importado;
- prerequisitos mínimos;
- modo actual.

Un recomendador nunca puede saltarse un bloqueo definido por Route Mode.

## Ranking inicial

Los candidatos se ordenan mediante una suma ponderada explicable.

Factores iniciales:

```txt
learningGap
prerequisiteReadiness
misconceptionRemediation
difficultyFit
recencyNeed
routePriority
novelty
projectReadiness
repetitionPenalty
contentFamilyFatigue
transferOpportunity
```

Los pesos deben estar centralizados y versionados.

El historial de recomendaciones debe evitar la repetición excesiva de una
misma `contentFamily`, incluso cuando todos sus ejercicios tengan scores altos
por practicar la misma skill.

No deben fijarse como verdad pedagógica eterna. Deben poder probarse y ajustarse con fixtures, datos anonimizados voluntarios o revisión pedagógica.

La recomendación debe buscar una zona de dificultad útil: no repetir contenido trivial ni sugerir una actividad cuyos prerequisitos principales estén demasiado débiles.

## Recomendación de proyectos

Un proyecto es recomendable cuando:

- sus skills obligatorias superan el readiness mínimo;
- no existe un prerequisito crítico sin evidencia;
- introduce una cantidad controlada de dificultad nueva;
- integra conocimientos que conviene consolidar;
- no está bloqueado por la ruta o política actual.

El readiness de un proyecto no debe calcularse solo con el promedio. Una skill crítica muy débil no puede ocultarse detrás de varias skills fuertes.

La explicación debe poder indicar:

```txt
skills listas
skills que el proyecto reforzará
skill nueva o más desafiante
prerequisito que todavía bloquea el proyecto
```

## Route Mode

Route Mode conserva la autoridad sobre progresión y desbloqueos.

El recomendador puede:

- elegir entre refuerzos permitidos;
- sugerir repaso antes de un gate;
- explicar por qué una actividad es el siguiente paso;
- detectar que un prerequisito necesita atención;
- recomendar un proyecto integrador cuando la ruta lo permita.

No puede desbloquear contenido arbitrariamente ni sustituir requisitos obligatorios.

Los intentos de Route Mode y Free Mode deben conservar su contexto. Practicar libremente puede aportar evidencia al Student Model sin falsear el número de intentos oficiales de una ruta.

## Free Mode y colección

En Free Mode, el usuario mantiene el control.

El recomendador puede destacar:

- recomendado para ti;
- refuerzo sugerido;
- repaso pendiente;
- proyecto apropiado;
- siguiente dificultad razonable.

Solo puede recomendar ejercicios de ruta que ya estén desbloqueados para práctica libre.

El usuario puede ignorar una recomendación sin penalización.

## Ask Tutor

Ask Tutor puede recibir un resumen compacto del Student Model:

- skills relevantes para el ejercicio;
- errores recientes;
- misconceptions activas;
- nivel de ayuda ya utilizado;
- intentos recientes;
- partes que no debe revelar directamente.

No debe recibir todo el historial ni la base completa.

La respuesta del tutor no actualiza mastery por sí sola. El uso de ayuda se registra como contexto; el aprendizaje debe confirmarse después con evidencia de desempeño.

## Explicaciones estructuradas

Cada recomendación debe devolver una explicación estructurada, no solo un score.

Ejemplo conceptual:

```json
{
  "itemId": "c.strings.count-lowercase",
  "kind": "exercise",
  "score": 0.84,
  "reasonCode": "remediate_recent_skill_gap",
  "skills": ["strings.traverse-null-terminated"],
  "evidence": ["2 recent failures", "low unassisted confidence"],
  "message": "Refuerza el recorrido de cadenas antes de avanzar a comparación de texto."
}
```

La UI puede adaptar el mensaje, pero no debe inventar una razón diferente.

## Cold start

Antes de tener evidencia suficiente, Lumen no debe fingir personalización.

En cold start debe usar:

- orden editorial de la ruta;
- dificultad declarada;
- prerequisitos;
- objetivo elegido por el usuario;
- un diagnóstico inicial opcional.

La UI puede decir `Sugerido para empezar`, no `Recomendado por tu rendimiento` si todavía no existe rendimiento suficiente.

## Persistencia local

SQLite debe contemplar entidades conceptuales como:

```txt
learning_events
skill_state
misconception_state
recommendation_cache
recommendation_history
model_versions
```

El event log es append-only salvo políticas explícitas de retención o privacidad.

Los agregados pueden reconstruirse desde eventos y deben indicar qué versión del modelo los produjo.

D1 no es la fuente principal del Student Model.

## Performance-first

El sistema debe actualizarse incrementalmente.

Después de un intento, solo se recalculan:

- las skills afectadas;
- misconceptions relacionadas;
- prerequisitos cercanos;
- candidatos conectados a ese vecindario.

No se recorre el catálogo completo ni se consulta cloud por cada evento.

El Local Engine puede mantener en memoria adjacency lists y candidatos frecuentes mientras Lumen está activo. SQLite conserva el estado entre sesiones.

## Privacidad y sincronización

El rendimiento del estudiante vive localmente por default.

La nube no necesita recibir código, errores completos ni event logs para que el recomendador funcione.

Una sincronización futura debe ser opcional y definir por separado:

- qué datos se sincronizan;
- cómo se anonimizan;
- cómo se resuelven conflictos;
- cuánto tiempo se conservan;
- cómo se eliminan.

## Verificación del modelo

El recomendador debe probarse con escenarios reproducibles.

Fixtures mínimos:

- estudiante nuevo;
- estudiante con prerequisito débil;
- estudiante con failures repetidos en una misconception;
- estudiante con éxito asistido pero no independiente;
- estudiante listo para proyecto;
- estudiante en Route Mode frente al mismo ejercicio en Free Mode;
- estudiante offline.

El mismo event log y la misma versión de configuración deben producir el mismo Student Model y el mismo ranking.

Antes de activar cambios grandes del algoritmo, Lumen debe poder ejecutarlos en shadow mode sobre fixtures o datos locales de prueba y comparar resultados.

## Tech stack del módulo

- **Rust** para registrar eventos, actualizar el modelo y calcular recomendaciones.
- **SQLite local** para events, estado por skill, misconceptions y cache.
- **Knowledge Graph local** derivado del catálogo para candidatos y explicaciones.
- **Cloudflare D1** solo para definiciones publicadas de contenido y grafo.
- **JSON estructurado** para requests, responses y explicaciones.

## Reglas deterministas

Lumen registra evidencia; no trata cualquier click como aprendizaje.

El Student Model está separado del Knowledge Graph.

La primera versión no usa una red neuronal.

El event log se conserva para poder recalcular modelos futuros.

Mastery y confidence son valores diferentes.

La ayuda reduce la fuerza de un éxito, pero no lo convierte automáticamente en fracaso.

Route Mode conserva la autoridad sobre bloqueos.

Free Mode puede aportar evidencia sin falsear intentos oficiales de ruta.

Las recomendaciones se calculan localmente y deben ser explicables.

Cold start no debe fingir personalización.

Un proyecto requiere readiness en sus skills críticas, no solo un promedio alto.
