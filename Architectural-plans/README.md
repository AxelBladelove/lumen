# Lumen Architectural Plans

Esta carpeta es la base de conocimiento arquitectónica de Lumen.

## Propósito

Los documentos describen qué es cada parte del producto, cómo debe sentirse, qué reglas la gobiernan, qué estados existen y cómo se relaciona con el resto de Lumen.

## Organización

- `philosophy.md`: filosofía general del producto.
- `Tech Stack.md`: tecnologías y decisiones técnicas base.
- `lumen-modes/`: Route Mode y Free Mode.
- `learning/`: módulos, Ruta C, quizzes y proyectos.
- `collaboration/`: Duo Programming, Race 1v1 y sistemas sociales.
- `gamification/`: XP, niveles, rachas, logros y feedback de progreso.
- `exercise-system/`: validación de soluciones y testing.
- `content-pipeline/`: recopilación, curación y publicación de ejercicios.
- `accounts/`: cuenta Lumen y sincronización.
- `ux/`: Command Coach, shortcuts y experiencia de producto.
- `notifications/`: notificaciones y recomendaciones.
- `installer-control-center/`: instalación, toolchain, reparación y actualización.
- `future/`: standalone y evolución fuera de VS Code.
- `contracts/`: contratos estables de datos y sesiones.
- `decisions/`: decisiones arquitectónicas importantes y sus razones.

## Regla de lectura

Cada agente debe:

1. Leer `philosophy.md`.
2. Leer el documento principal del módulo que va a tocar.
3. Leer los contratos relacionados.
4. Respetar las relaciones con Local Engine, Extension Host, frontend, SQLite y cloud.
5. No inventar una arquitectura paralela.

## Estados de documentación

Cada documento puede declarar uno de estos estados:

- `implemented`
- `partial`
- `planned`
- `future`

Un documento describe el producto objetivo aunque la implementación todavía no exista.
