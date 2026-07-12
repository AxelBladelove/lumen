# Leer y repetir una línea

Lee una línea desde la entrada estándar y vuelve a imprimirla.

## Entrada

Una sola línea de texto de hasta 1000 caracteres. Puede estar vacía y puede contener letras, dígitos, espacios y símbolos.

## Salida

La misma línea leída, seguida de un salto de línea. Si no hay entrada, imprime una línea vacía.

## Ejemplos

| Entrada      | Salida       |
| ------------ | ------------ |
| `Hola Mundo` | `Hola Mundo` |
| `abc 123!`   | `abc 123!`   |
| *(vacía)*    | *(vacía)*    |

## Notas

- Usa un buffer de caracteres y `fgets` para leer la línea completa.
- `fgets` conserva el salto de línea si cabe en el buffer.
- Si `fgets` indica que no leyó nada, la salida debe ser una línea vacía.
