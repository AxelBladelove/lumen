# Modules

Estado: `planned`

## Propósito

Los módulos son la unidad curricular principal de una ruta. Agrupan actividades relacionadas y convierten una lista de ejercicios en una progresión entendible.

## Qué es un módulo

Un módulo contiene un objetivo pedagógico claro, prerequisitos, actividades, criterios de dominio y una relación explícita con otros módulos.

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
- Un módulo no se completa solo por terminar todos los nodos visibles.
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

Route Path View muestra el módulo como un tramo del camino. El usuario debe entender:

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
