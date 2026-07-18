# Contar palabras

Lee una línea desde la entrada estándar y cuenta cuántas palabras contiene.

Una palabra es una secuencia máxima de caracteres que no son el espacio `' '`.

## Entrada

Una sola línea de texto de hasta 200 caracteres, sin contar el salto de línea final. Puede estar vacía y puede contener letras, dígitos, espacios y símbolos.

## Salida

Un único número entero: la cantidad de palabras de la línea, seguido de un salto de línea.

## Ejemplos

| Entrada           | Salida |
| ----------------- | ------ |
| `Hola Mundo`      | `2`    |
| `  uno   dos  `   | `2`    |
| *(vacía)*         | `0`    |
| `      `          | `0`    |

## Notas

- Solo el carácter espacio `' '` separa palabras. La puntuación y los dígitos pueden formar parte de una palabra.
- Los espacios consecutivos no crean palabras vacías.
- Los espacios al inicio o al final de la línea no deben sumarse.
- El salto de línea final no forma parte de ninguna palabra.
