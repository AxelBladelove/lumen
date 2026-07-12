# Longitud de una línea

Lee una línea desde la entrada estándar e imprime cuántos caracteres tiene antes del salto de línea.

## Entrada

Una sola línea de texto de hasta 1000 caracteres. Puede estar vacía y puede contener letras, dígitos, espacios y símbolos.

## Salida

Un único número entero: la cantidad de caracteres antes de `'\n'` o `'\0'`, seguido de un salto de línea.

## Ejemplos

| Entrada      | Salida |
| ------------ | ------ |
| `Hola Mundo` | `10`   |
| `abc 123!`   | `8`    |
| *(vacía)*    | `0`    |

## Notas

- No cuentes el salto de línea.
- Recorre la cadena hasta encontrar `'\n'` o el terminador nulo `'\0'`.
- No uses el tamaño del buffer como si fuera la longitud del texto leído.
