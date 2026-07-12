# Convertir a mayúsculas

Lee una línea y escribe la misma línea con cada letra minúscula convertida a mayúscula.

## Entrada

Una sola línea de texto de hasta 1000 caracteres. Puede contener letras, dígitos, espacios y símbolos, o estar vacía.

## Salida

La línea transformada: cada carácter entre `'a'` y `'z'` debe convertirse a su versión mayúscula. El resto de los caracteres se imprime igual.

## Ejemplos

| Entrada      | Salida       |
| ------------ | ------------ |
| `Hola Mundo` | `HOLA MUNDO` |
| `abc 123!`   | `ABC 123!`   |
| `AZaz@[`     | `AZAZ@[`     |

## Notas

- Solo transforma las letras minúsculas del alfabeto inglés: `'a'` a `'z'`.
- Las mayúsculas, dígitos, espacios y símbolos se conservan.
- Recorre la cadena hasta `'\0'` y conserva el salto de línea si fue leído.
