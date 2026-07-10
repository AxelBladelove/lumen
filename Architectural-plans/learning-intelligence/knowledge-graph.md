# Knowledge Graph

Archivo: `Architectural-plans/learning-intelligence/knowledge-graph.md`

## Propósito

`Knowledge Graph` define el modelo que conecta conocimientos, skills, errores frecuentes, ejercicios, proyectos, módulos y rutas.

Este grafo permite que Lumen entienda que una actividad no es un elemento aislado. Permite responder preguntas como:

- ¿qué necesita dominar el estudiante antes de este ejercicio?;
- ¿qué skills practica o evalúa?;
- ¿qué error frecuente puede estar mostrando?;
- ¿qué refuerzo conviene recomendar?;
- ¿para qué proyecto se está preparando?;
- ¿por qué una recomendación tiene sentido?;

## No es una red neuronal

El grafo de conocimiento no es una red neuronal y no intenta fingir que lo es.

Es un grafo dirigido, tipado y versionado que representa relaciones pedagógicas explícitas.

La primera versión de Lumen no necesita embeddings, GNN, entrenamiento cloud ni una graph database dedicada. Esas herramientas podrían evaluarse en el futuro si existe evidencia de que mejoran el producto, pero no forman parte del fundamento inicial.

La prioridad actual es un sistema:

```txt
explicable
determinista
local-first
rápido
auditable
```

## Grafo de dominio y modelo del estudiante

Lumen debe separar dos cosas:

```txt
Grafo de dominio:
qué se relaciona con qué dentro del conocimiento y el contenido.

Modelo del estudiante:
qué evidencia existe sobre el dominio de un usuario concreto.
```

El progreso del estudiante no debe modificar el grafo canónico.

El grafo puede decir que `strings.compare-with-strcmp` requiere `strings.null-terminated-model`. El modelo del estudiante puede decir que Axel tiene baja confianza en la primera y mastery medio en la segunda.

La recomendación aparece al combinar ambos modelos.

## Nodos

Los tipos de nodo iniciales son:

- **Concept**: área amplia de conocimiento, como strings, bucles o punteros.
- **Skill**: capacidad concreta y observable.
- **Misconception**: error conceptual o patrón de fallo reconocible.
- **Exercise**: práctica acotada.
- **Challenge**: actividad con menos guía o mayor integración.
- **Project**: actividad integradora de varias skills.
- **Module**: agrupación pedagógica dentro de una ruta.
- **Route**: progresión guiada completa.

No hace falta crear una tabla física diferente para cada tipo. El schema puede usar tablas especializadas donde convenga y una vista unificada para consultas de grafo.

## Relaciones

Las relaciones iniciales son dirigidas y tienen significado explícito:

```txt
requires
introduces
practices
reinforces
assesses
reveals
remediates
prepares_for
contains
belongs_to
part_of
integrates
evidenced_by
diagnosed_by
variant_of
contrasts_with
alternative_to
equivalent_to
deprecated_by
unlocks
related_to
```

Ejemplos:

```txt
exercise -> practices -> skill
exercise -> assesses -> skill
exercise -> reveals -> misconception
exercise -> remediates -> misconception
skill -> requires -> skill
skill -> part_of -> concept
test-group -> evidenced_by -> skill
misconception -> diagnosed_by -> error-signal
exercise -> prepares_for -> project
project -> integrates -> skill
exercise -> variant_of -> exercise
module -> contains -> exercise
route -> contains -> module
```

Las relaciones que aportan evidencia deben poder incluir un peso entre `0.0` y `1.0`.

Una arista también puede conservar `criticality`, `rationale`, `provenance` y
`catalogVersion` cuando esos datos ayuden a validar o explicar la relación.

El peso no tiene el mismo significado para todos los tipos de relación. Por eso debe interpretarse junto con su tipo y no como una fuerza genérica del grafo.

## Fuente del grafo

El grafo no debe editarse como una segunda fuente de verdad separada del registro.

La metadata de actividades y las definiciones de concepts/skills son las
fuentes editoriales. El pipeline compila `primaryTopics`, `supportTopics`,
`combinedTopics`, `skills`, `prerequisites`, `commonErrors`, `misconceptions`,
`remediates`, `preparesFor`, `relatedProjects`, familias y variantes en nodos y
relaciones normalizadas.

`commonErrors` produce señales observables. `misconceptions` produce nodos
pedagógicos. No deben compilarse como si fueran el mismo tipo de entidad.

```txt
manifests + taxonomía pedagógica
-> validación
-> compilación del grafo
-> D1
-> snapshot/cache local
```

Esto evita que un manifest diga una cosa y una tabla de grafo diga otra.

## Taxonomía pedagógica

Los conceptos, skills y misconceptions deben tener IDs estables.

Ejemplos:

```txt
concept: strings
skill: strings.traverse-null-terminated
skill: strings.compare-with-strcmp
misconception: strings.iterate-buffer-capacity-instead-of-terminator
```

Los nombres visibles pueden cambiar o traducirse. Los IDs no deben depender de copy de UI.

Una skill debe ser lo bastante concreta para que una actividad pueda aportar evidencia sobre ella. Si es tan amplia que cubre medio lenguaje C, pertenece al nivel Concept.

## Prerequisitos

La relación `requires` entre skills define un grafo de prerequisitos.

Ese subgrafo debe ser acíclico. Una cadena circular de prerequisitos haría imposible explicar disponibilidad o readiness.

El validador del catálogo debe rechazar ciclos en `requires`.

Otras relaciones, como `related_to`, pueden formar ciclos sin problema.

## Persistencia

Lumen no necesita Neo4j ni otro servicio adicional para la primera versión.

El grafo puede representarse en D1 y SQLite mediante relaciones normalizadas, por ejemplo:

```txt
knowledge_nodes
knowledge_edges
```

Una arista necesita al menos:

```txt
fromId
toId
relationType
weight
catalogVersion
```

Los índices deben cubrir:

```txt
fromId + relationType
toId + relationType
```

SQLite puede recorrer árboles o grafos mediante recursive CTE cuando haga falta. Para el hot path de recomendaciones, el Local Engine debe preferir vecindarios precalculados o cacheados y evitar recorridos completos en cada interacción.

## Distribución local-first

D1 contiene la versión publicada del grafo de dominio.

El cliente sincroniza un snapshot compacto de nodos y relaciones relevantes. SQLite local guarda ese snapshot junto con su `catalogVersion`.

El recomendador debe poder funcionar sin internet usando el grafo local y los ejercicios ya conocidos.

La nube se necesita para recibir nuevas versiones del catálogo, no para calcular cada recomendación.

## Uso para interpretar evidencia

Cuando el estudiante resuelve una actividad, la metadata indica qué skills están implicadas y con qué peso.

El grafo permite ampliar la interpretación de forma controlada:

- una falla en una skill puede señalar un prerequisito débil;
- un error clasificado puede activar una misconception;
- una actividad de remediation puede seleccionarse desde esa misconception;
- una skill dominada puede contribuir al readiness de un proyecto.

La propagación no debe ser ilimitada. La evidencia directa vale más que la inferida y debe existir una profundidad máxima pequeña.

## Uso para recomendaciones

El grafo genera candidatos, pero no decide por sí solo la recomendación final.

Puede producir candidatos desde:

- skills débiles;
- prerequisitos faltantes;
- misconceptions activas;
- ejercicios de refuerzo conectados;
- siguientes actividades de ruta;
- proyectos para los que el estudiante ya está cerca de estar preparado;
- repasos de skills con poca práctica reciente.

El Student Model aporta el estado del usuario. El Recommendation Engine aplica bloqueos, readiness, dificultad y prioridades del modo actual.

## Proyectos

Los proyectos son nodos integradores.

Un proyecto puede requerir varias skills con niveles mínimos y combinar conceptos de distintos módulos.

El grafo permite mostrar:

- qué skills ya están listas;
- cuáles faltan;
- qué ejercicios preparan para el proyecto;
- qué proyecto es un siguiente reto razonable;
- por qué todavía no se recomienda un proyecto más avanzado.

Un proyecto no debe desbloquearse solo por cercanía visual o porque comparte un concepto amplio.

## Explicabilidad

Toda recomendación debe poder convertirse en una explicación legible.

Ejemplos:

```txt
Te recomendamos este ejercicio porque fallaste recientemente al recorrer cadenas y este ejercicio practica esa skill sin añadir memoria dinámica.

Este proyecto ya es apropiado porque dominas entrada de texto, bucles y funciones; solo introduce una dificultad nueva: organización con structs.
```

Si el sistema no puede producir una razón concreta a partir del grafo y la evidencia, no debe presentar la recomendación como altamente personalizada.

## Validación

El pipeline debe validar:

- IDs duplicados;
- referencias a nodos inexistentes;
- tipos de relación inválidos;
- pesos fuera de rango;
- ciclos en prerequisitos;
- actividades sin skills pedagógicas;
- proyectos sin requisitos principales;
- nodos huérfanos no intencionales.

El catálogo no debe publicarse con un grafo inválido.

## Versionado

El grafo debe tener una versión asociada a la versión del catálogo.

Los eventos históricos del estudiante deben conservar los IDs y versiones de actividad que existían cuando ocurrieron.

Si una skill se divide o depreca, debe existir una migración o mapping explícito. No se deben reinterpretar intentos antiguos silenciosamente con una taxonomía distinta.

## Tech stack del módulo

- **Rust** para validar, compilar y consultar el grafo en el Local Engine.
- **Cloudflare D1** para el grafo de dominio publicado y consultable.
- **SQLite local** para el snapshot y las consultas offline.
- **SQL relacional** con tablas de nodos/aristas e índices; recursive CTE solo cuando aporte valor.
- **JSON estructurado** para transportar snapshots y explicaciones.

## Reglas deterministas

El grafo de conocimiento no es una red neuronal.

El grafo de dominio no contiene el progreso mutable del usuario.

El grafo se compila desde metadata versionada.

No se añade una graph database en la primera versión.

La relación `requires` entre skills no puede contener ciclos.

La evidencia directa pesa más que la inferida.

La recomendación se calcula localmente combinando grafo y Student Model.

Toda recomendación importante debe poder explicar su camino dentro del grafo.
