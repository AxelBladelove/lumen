# Detectar palíndromos

Lee una línea desde la entrada estándar y decide si es un palíndromo.

Un palíndromo se lee igual de izquierda a derecha que de derecha a izquierda. En esta actividad la comparación es exacta carácter a carácter: las mayúsculas, minúsculas, espacios, dígitos y símbolos se comparan tal como aparecen.

## Entrada

Una sola línea de texto de 1 a 200 caracteres. Puede contener letras, dígitos, espacios y símbolos.

## Salida

Imprime exactamente `SI` si la línea es un palíndromo, o `NO` si no lo es, seguido de un salto de línea.

## Ejemplos

| Entrada   | Salida |
| --------- | ------ |
| `radar`   | `SI`   |
| `reconocer` | `SI` |
| `Radar`   | `NO`   |
| `a b a`   | `SI`   |

## Notas

- Compara solo los caracteres de la línea, antes del salto de línea final y antes del terminador nulo `'\0'`.
- Un solo carácter siempre es palíndromo.
- Una forma natural de resolverlo es comparar el primer carácter con el último, luego el segundo con el penúltimo, y así sucesivamente hasta que los índices se crucen o se encuentren.
