# Quizzes

Estado: `planned`

## Propósito

Los quizzes comprueban comprensión conceptual y lectura de código. Complementan los ejercicios prácticos; no los reemplazan.

## Tipos

- opción múltiple;
- verdadero o falso con explicación;
- predecir salida;
- detectar error;
- ordenar pasos;
- completar fragmentos;
- respuesta corta;
- quiz acumulativo;
- simulación de parcial.

## Flujo

1. Lumen presenta instrucciones y alcance.
2. El usuario responde sin recibir la solución inmediata.
3. Se registra respuesta, tiempo y confianza opcional.
4. Al terminar, Lumen explica errores y conceptos relacionados.
5. El Student Model recibe evidencia por skill.
6. Route Mode decide si el quiz afecta un gate.

## Reglas

- Un quiz puede tener límite de tiempo, pero no todos deben tenerlo.
- Las preguntas deben estar versionadas.
- Los reintentos no deben repetir siempre las mismas preguntas.
- La nota no debe reducirse a porcentaje cuando importa qué concepto falló.
- Una respuesta correcta por azar aporta menos evidencia que una respuesta correcta consistente.
- Los quizzes de gate deben tener política explícita de reintento.

## Estados

- `not_started`
- `in_progress`
- `submitted`
- `passed`
- `failed`
- `reviewed`

## Relación con módulos

Un módulo puede incluir quizzes cortos durante la práctica y uno acumulativo antes del reto de dominio. Fallar no siempre bloquea: puede generar refuerzo dirigido.
