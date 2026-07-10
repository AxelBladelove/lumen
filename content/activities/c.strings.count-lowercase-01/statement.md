# Contar minúsculas en una línea

Lee una línea desde la entrada estándar y cuenta cuántas letras minúsculas contiene.

## Entrada

Una sola línea de texto de hasta 1000 caracteres. Puede estar vacía y puede contener letras, dígitos, espacios y símbolos.

## Salida

Un único número entero: la cantidad de caracteres que son letras minúsculas del alfabeto inglés (`'a'` a `'z'`), seguido de un salto de línea.

## Ejemplos

| Entrada      | Salida |
| ------------ | ------ |
| `Hola Mundo` | `7`    |
| `ABC 123!`   | `0`    |
| *(vacía)*    | `0`    |

## Notas

- La cadena que recibes termina en el carácter nulo `'\0'`. Recorre hasta ahí, no hasta el tamaño del buffer.
- Solo cuentan `'a'`–`'z'`. Las mayúsculas, dígitos y símbolos no suman.
