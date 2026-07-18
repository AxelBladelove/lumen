# Solution Testing

Estado: `partial`

## Propósito

Solution Testing decide si una solución cumple el ejercicio. Compilar no significa completar.

## Estado actual del repo

El protocolo v5 implementa el modo `io`: F10 compila el entrypoint de la
working copy activa, carga manifest y casos desde la instalación validada,
ejecuta grupos públicos y `local-private`, registra el intento y conserva el
progreso completado. Los resultados ocultos no revelan entrada ni salida.

Los modos `function`, `hybrid`, `project` y `manual-assisted` siguen planeados.
El runner limita tiempo y salida según su implementación actual, pero todavía
no garantiza por completo todas las propiedades declarativas de `sandbox`
(red, filesystem, memoria y árbol de procesos).

## Modos de validación

- `io`: entrada y salida del programa;
- `function`: llamadas directas a funciones;
- `hybrid`: combina ambos;
- `project`: valida múltiples archivos, escenarios o milestones;
- `manual-assisted`: automatiza lo posible y marca revisión pendiente.

## Libertad de implementación

La norma es validar comportamiento observable, principalmente entrada y salida,
sin imponer la estructura interna de la solución. Si el programa satisface el
contrato, el estudiante puede resolverlo a su manera.

Algunos ejercicios exigen deliberadamente una función, firma o `struct`
concretos porque esa estructura es el objetivo formativo. Son una minoría y el
enunciado debe declararlo de forma explícita; fuera de esos casos, los tests no
pueden convertir una estrategia interna particular en requisito oculto.

## Tests de entrada/salida

Cada caso define stdin, salida esperada, normalización, timeout y peso. La normalización puede ignorar diferencias irrelevantes, pero nunca debe esconder errores semánticos.

## Tests de funciones

Lumen solo debe obligar al estudiante a usar un nombre o firma de función concretos cuando el objetivo pedagógico declarado lo exige.

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
