# Modules

Estado: `planned`

## Propósito

Los módulos son la unidad curricular principal de una ruta. Agrupan actividades relacionadas y convierten una lista de ejercicios en una progresión entendible.

## Qué es un módulo

Un módulo contiene un objetivo pedagógico claro, prerequisitos, actividades, criterios de dominio y una relación explícita con otros módulos.

Cada módulo contiene una cantidad amplia de ejercicios, normalmente decenas. La referencia de Cadenas, por ejemplo, expresa el progreso como `18/64 ejercicios`.

Puede incluir:

- ejercicios de introducción;
- práctica principal;
- refuerzos;
- ejercicios combinados;
- quiz;
- reto de dominio;
- proyecto integrador.

## Estados

- `locked`
- `available`
- `active`
- `completed`
- `mastered`

`completed` significa que se cumplieron los requisitos mínimos. `mastered` exige evidencia adicional de dominio y puede alcanzarse después.

## Reglas

- Abrir archivos no completa actividades.
- Completar los ejercicios del módulo con la evidencia exigida habilita la promoción al módulo siguiente.
- Terminar todos los nodos visibles de un tramo no completa el módulo: los ejercicios se recorren por tramos hasta agotar el total del módulo.
- Los gates dependen de evidencia real: tests, intentos, quizzes, retos y proyectos.
- Los ejercicios libres no alteran automáticamente el historial oficial de ruta.
- Un módulo puede recomendar refuerzo sin bloquear el avance cuando la debilidad no sea crítica.

## Módulos combinados

Un módulo combinado mezcla conocimientos deliberadamente. No equivale a añadir varias etiquetas a un ejercicio.

Ejemplos:

- funciones + arrays;
- cadenas + matrices;
- punteros + memoria dinámica;
- structs + archivos.

Debe declarar qué skills se integran, qué conocimiento es principal y qué prerequisitos son obligatorios.

## Relación con la UI

Route Path View muestra un tramo del módulo a la vez. El usuario recorre tramos sucesivos, pero el progreso y la promoción siempre corresponden al módulo completo. Debe entender:

- dónde está;
- qué está aprendiendo;
- qué actividad sigue;
- qué está bloqueado;
- qué falta para avanzar.

## Relación con otros sistemas

- Route Mode controla la progresión.
- Local Engine evalúa gates y actualiza estado.
- Student Model interpreta evidencia.
- Exercise Collection refleja bloqueos y desbloqueos.
- Gamification entrega feedback, pero no decide dominio.
