# Decision 0001: Documentation Model

Estado: `accepted`

## Contexto

Lumen crecerá mediante trabajo humano y agentes de IA. La documentación necesita separar visión de producto, contratos estables y razones históricas.

## Decisión

Usar tres capas:

```txt
Architectural-plans/
  documentos de producto y arquitectura

Architectural-plans/contracts/
  formas de datos y contratos normativos

Architectural-plans/decisions/
  decisiones y consecuencias
```

## Consecuencias

- Un plan explica qué es una función y cómo se relaciona con Lumen.
- Un contrato define campos, estados, mensajes o invariantes.
- Una decisión explica por qué se eligió una dirección y qué alternativas se descartaron.
- No se debe duplicar una definición normativa en varios documentos.
- Los documentos existentes pueden migrar gradualmente; no hace falta reescribirlos todos de una vez.

## Regla

Cuando exista conflicto:

1. el contrato normativo gana sobre ejemplos;
2. una decisión aceptada gana sobre una preferencia informal anterior;
3. el estado actual del repo debe declararse explícitamente;
4. la filosofía global sigue limitando cualquier implementación.
