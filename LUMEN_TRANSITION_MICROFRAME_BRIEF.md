# Lumen transition microframe brief

## Intent

La entrada a Lumen debe sentirse como una única transición premium y causal:

1. La pantalla de carga ocupa visualmente el editor completo.
2. Al terminar la carga, el lockup de Lumen ejecuta un punch-in rápido hasta llenar el encuadre.
3. Sólo después aparece la geometría final: editor a la izquierda y UI de Lumen a la derecha.
4. El primer frame visible de esa geometría ya pertenece al zoom-out de la UI final.

## Regression to eliminate

En algunas entradas existe un microframe donde el split final ya está visible, pero el panel derecho todavía pinta el logo/wordmark en el máximo zoom del punch-in. Aunque dure pocos milisegundos, ese orden es inválido.

## Non-negotiable acceptance criteria

- Ningún frame puede mostrar simultáneamente el split final y el lockup de Lumen todavía en punch-in.
- El primer frame visible del panel derecho tras el cambio geométrico debe ser la UI final, ya dentro de su zoom-out.
- No pueden reaparecer los fallos previamente corregidos: fondo de carga desnudo, logo/wordmark ausentes durante la carga, barra reiniciada o UI final revelada antes del velo.
- La corrección no puede depender de que un `ResizeObserver`, timer del iframe o mensaje entre procesos gane una carrera antes del paint.
- El punch-in y el zoom-out siguen siendo rápidos; no se introduce una pausa perceptible en el pico.
- Se conserva la arquitectura documentada de Lumen y se actualizan sus contratos si cambia el mecanismo.
- La extensión se compila, empaqueta e instala localmente; la validación final se realiza sobre VS Code real, incluyendo entradas frías y calientes con muestreo frame a frame.

## Scope

El alcance se limita al protocolo de entrada, la cortina/animación inicial, sus pruebas contractuales, telemetría y documentación arquitectónica asociada. No se rediseña la UI de ruta ni se modifica el engine.
