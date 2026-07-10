# Solution Testing

Estado: `planned`

## Propósito

Solution Testing decide si una solución cumple el ejercicio. Compilar no significa completar.

## Modos de validación

- `io`: entrada y salida del programa;
- `function`: llamadas directas a funciones;
- `hybrid`: combina ambos;
- `project`: valida múltiples archivos, escenarios o milestones;
- `manual-assisted`: automatiza lo posible y marca revisión pendiente.

## Tests de entrada/salida

Cada caso define stdin, salida esperada, normalización, timeout y peso. La normalización puede ignorar diferencias irrelevantes, pero nunca debe esconder errores semánticos.

## Tests de funciones

Lumen no debe obligar al estudiante a usar un nombre de función concreto cuando el objetivo pedagógico no lo exige.

El sistema puede usar:

- firmas declaradas;
- Tree-sitter para detectar candidatos;
- wrappers temporales;
- selección asistida si hay ambigüedad;
- fallback a I/O;
- adapters generados de forma controlada.

La IA puede proponer un adapter, pero una respuesta de IA no debe convertirse por sí sola en veredicto final.

## Resultados

- `passed`
- `failed`
- `compile_error`
- `runtime_error`
- `timeout`
- `invalid_structure`
- `inconclusive`

Cada resultado debe incluir evidencia estructurada y tests afectados.

## Tests públicos y ocultos

Los públicos enseñan el contrato. Los ocultos comprueban generalización y edge cases. Ningún test oculto debe exigir algo que el enunciado no permite inferir.

## Seguridad

- límites de tiempo;
- límites de salida;
- directorio de ejecución controlado;
- separación entre archivos del usuario y harness;
- procesos hijos controlados;
- limpieza de artefactos temporales.

## Relación pedagógica

El resultado alimenta intentos, mastery, misconceptions, hints, gates y recomendaciones. Un fallo debe explicar qué se observó sin revelar necesariamente el test oculto completo.
