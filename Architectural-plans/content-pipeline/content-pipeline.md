# Content Pipeline

Estado: `planned`

## Propósito

El Content Pipeline convierte fuentes brutas en actividades oficiales de Lumen con metadata, tests, relaciones pedagógicas y paquetes importables.

## Fuentes posibles

- contenido propio;
- ejercicios universitarios;
- PDFs y parciales;
- bancos públicos;
- proyectos existentes;
- scraping autorizado;
- variantes generadas por IA.

## Flujo

```txt
fuente bruta
-> extracción
-> normalización
-> deduplicación
-> clasificación pedagógica
-> autoría o adaptación
-> tests
-> hints
-> metadata
-> revisión
-> paquete .esex
-> publicación
```

## Curación

Cada actividad debe revisarse por:

- claridad del enunciado;
- dificultad real;
- dependencia de conocimientos;
- validez de tests;
- originalidad o relación con una familia existente;
- errores comunes esperables;
- valor pedagógico;
- compatibilidad con la ruta.

## Duplicados y familias

Dos ejercicios pueden usar historias distintas y practicar exactamente el mismo patrón. El pipeline debe distinguir:

- duplicado;
- variante;
- alternativa;
- progresión;
- contraste;
- refuerzo.

## Uso de IA

La IA puede ayudar a extraer, reescribir, clasificar, generar variantes y proponer tests. No puede publicar automáticamente una actividad oficial sin validación estructural y pedagógica.

## Publicación

Una versión aprobada produce un artefacto inmutable, checksum, release record y metadata consultable. Cambios posteriores crean una versión nueva.

## Reglas

- Nunca sobrescribir una versión publicada.
- No mezclar datos observados del estudiante con metadata canónica.
- No publicar ejercicios sin tests suficientes cuando sean automatizables.
- Conservar procedencia y transformación editorial internamente.
