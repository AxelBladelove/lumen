# Contar vocales minúsculas

Lee una línea y cuenta cuántos de sus caracteres son vocales minúsculas.

## Entrada

Una sola línea de texto de hasta 1000 caracteres. Puede contener letras,
dígitos, espacios y símbolos, o estar vacía.

## Salida

Un único entero: la cantidad de caracteres que son exactamente `a`, `e`, `i`,
`o` o `u`, seguido de un salto de línea.

## Ejemplos

| Entrada      | Salida |
| ------------ | ------ |
| `Hola Mundo` | `4`    |
| `rhythms`    | `0`    |
| `aeiou`      | `5`    |

## Notas

- Las vocales mayúsculas no cuentan.
- Recorre la cadena hasta su terminador nulo `\0`, no hasta el tamaño total
  del buffer.
- Cada posición cuenta por separado: si una vocal se repite, suma otra vez.
