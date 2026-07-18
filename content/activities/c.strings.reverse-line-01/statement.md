# Invertir una línea

Lee una línea desde la entrada estándar e imprime sus caracteres en orden inverso.

## Entrada

Una sola línea de texto de 1 a 200 caracteres. Puede contener letras, dígitos, espacios y símbolos.

## Salida

La misma línea, pero invertida, seguida de un salto de línea.

## Ejemplos

| Entrada      | Salida       |
| ------------ | ------------ |
| `lumen`      | `nemul`      |
| `Hola Mundo` | `odnuM aloH` |
| `A`          | `A`          |

## Notas

- Si lees con `fgets`, la cadena puede conservar el salto de línea final. No lo cuentes como parte del texto a invertir.
- La cadena termina en el carácter nulo `'\0'`. Ese terminador marca el final, pero no es un carácter imprimible de la línea.
- Calcula primero cuántos caracteres reales tiene la línea y luego recórrela desde el último carácter real hasta el primero.
