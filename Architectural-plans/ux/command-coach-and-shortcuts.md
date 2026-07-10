# Command Coach and Shortcuts

Estado: `planned`

## Propósito

Command Coach enseña a usar el editor con fluidez mientras el usuario programa. No es una lista estática de atajos: ofrece ayuda contextual, progresiva y no intrusiva.

## Objetivos

- enseñar shortcuts útiles en el momento correcto;
- reducir dependencia del mouse;
- ayudar a navegar, seleccionar, editar y depurar más rápido;
- reforzar hábitos de editor sin interrumpir el ejercicio;
- respetar keybindings personalizados.

## Capacidades iniciales

- Command Palette;
- buscar y reemplazar;
- seleccionar línea o palabra;
- mover o duplicar líneas;
- comentar código;
- multicursor;
- seleccionar siguiente ocurrencia;
- navegar entre archivos y errores;
- abrir terminal;
- ejecutar compilación con F9;
- abrir Ask Tutor;
- entrar y salir de Lumen Mode.

## Experiencia

Lumen puede mostrar una sugerencia pequeña cuando detecta una acción repetitiva que tiene un shortcut más eficiente.

Ejemplo:

```txt
Has movido esta línea con cortar y pegar varias veces.
Prueba Alt + ↑ / ↓ para moverla directamente.
```

La sugerencia debe poder cerrarse, posponerse o marcarse como aprendida.

## Estados por shortcut

- `unknown`
- `introduced`
- `practicing`
- `learned`
- `dismissed`

Estos estados no representan dominio pedagógico de programación.

## Reglas

- No mostrar una sugerencia durante cada acción.
- No castigar al usuario por usar mouse.
- No asumir keybindings default si fueron modificados.
- Consultar comandos reales del host cuando sea posible.
- Las sugerencias nunca deben tapar código importante.
- El usuario puede desactivar Command Coach.
- No usar hacks sobre el DOM interno de VS Code.

## Relación con gamificación

Puede existir reconocimiento ligero por aprender herramientas del editor, pero no debe generar XP explotable ni alterar progreso de ruta.
