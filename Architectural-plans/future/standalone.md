# Lumen Standalone

Estado: `future`

## Propósito

Lumen Standalone convierte la experiencia validada como extensión en un entorno de programación propio, más enfocado y ligero, sin perder el Local Engine ni el modelo educativo.

## Principio

La extensión es el primer host. No debe convertirse en una prisión arquitectónica.

## Capacidades que deben conservarse

- editor de código;
- terminal;
- gestor de archivos;
- keybindings;
- diagnósticos;
- compilación y tests;
- Route Mode;
- Free Mode;
- Ask Tutor;
- Command Coach;
- Duo y Race;
- workspace local;
- extensibilidad necesaria.

## Opciones de implementación

- Tauri + Svelte + Monaco;
- fork de Code-OSS reducido;
- shell Rust nativo con un editor propio o GPUI.

La elección final debe evaluarse por rendimiento, peso, mantenimiento, compatibilidad de extensiones y control de UX.

## Migración

El Local Engine, SQLite, formatos de ejercicios, cloud APIs y contratos de producto deben sobrevivir sin depender de VS Code.

La migración debe ser gradual:

1. separar lógica de VS Code;
2. estabilizar contratos del engine;
3. abstraer editor y workspace;
4. construir host standalone;
5. permitir importar el estado local existente;
6. mantener compatibilidad durante transición.

## Reglas

- No clonar VS Code completo sin una razón.
- No sacrificar funciones esenciales por una interfaz vacía.
- No crear dos motores de progreso.
- La cuenta y los ejercicios del usuario deben migrar.
- El standalone debe sentirse más rápido y enfocado que el host anterior.
