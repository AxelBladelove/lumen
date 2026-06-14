# AI Gateway

Archivo: `Architectural-plans/cloud/ai-gateway/ai-gateway.md`

## Propósito

`AI Gateway` define la capa cloud que conecta Ask Tutor con proveedores de IA.

La extensión, la webview y el Local Engine no deben tener claves privadas de IA.

El Gateway recibe contexto preparado por Lumen, aplica reglas de tutoría, elige proveedor disponible y devuelve una respuesta estable.

La regla principal es:

```txt
Ask Tutor pide ayuda.
AI Gateway protege claves y maneja proveedores.
El modelo responde como tutor, no como solucionador.
```

## Qué es AI Gateway

AI Gateway es un servicio cloud, probablemente implementado como Worker o conjunto de Workers.

Su trabajo es:

- recibir solicitudes de Ask Tutor
- validar payload
- aplicar prompt del sistema
- escoger proveedor
- manejar rate limits
- usar fallback
- devolver respuesta estructurada
- ocultar detalles del proveedor al cliente

## Tech stack del submódulo

- **Cloudflare Workers**: runtime serverless del Gateway.
- **TypeScript**: implementación.
- **Cloudflare secrets**: almacenamiento de API keys.
- **Gemini API**: proveedor principal inicial.
- **Gemini API secundaria**: fallback con otra cuenta/proyecto.
- **Groq API**: fallback adicional.
- **Openrouter API**: fallback final si está disponible/configurado.
- **KV**: posible cache o estado ligero de rate limit si hace falta.
- **D1**: posible registro estructurado mínimo de eventos si se decide.
- **JSON estructurado**: formato de requests y responses.

## Cadena de proveedores

Cadena inicial:

```txt
1. Gemini principal.
2. Gemini secundario.
3. Groq.
4. Openrouter fallback.
```

El orden puede cambiar si cambian límites, costos o calidad, pero Ask Tutor no debe depender de un solo proveedor.

La webview no debe saber qué proveedor respondió.

## Secrets

Las claves API deben vivir como secrets del entorno cloud.

No deben vivir:

- en la extensión
- en la webview
- en el repo público
- en `.lumen`
- en SQLite local

Si una clave cambia, se rota en Cloud sin reinstalar Lumen.

## Request de Ask Tutor

Payload conceptual:

```json
{
  "kind": "question",
  "mode": "route",
  "helpLevel": 1,
  "question": "No entiendo este while",
  "context": {
    "exerciseId": "...",
    "selectedCode": "...",
    "currentCode": "...",
    "compileErrors": [],
    "attemptsSummary": [],
    "route": "...",
    "module": "..."
  }
}
```

El contexto debe ser mínimo pero suficiente.

No se debe mandar todo el workspace si no hace falta.

## Tipos de solicitud

Tipos iniciales:

```txt
question
hint
explain_compile_error
```

`question` responde una duda escrita.

`hint` genera una pista limitada.

`explain_compile_error` ayuda a entender errores de GCC.

## Pistas

El Gateway debe respetar el límite de cuatro pistas por ejercicio.

Debe recibir qué pistas ya fueron usadas.

La pista debe adaptarse al contexto actual.

No debe repetir ayuda inútil.

No debe entregar la solución final.

## Prompt del sistema

El prompt del sistema debe imponer la filosofía de Lumen:

```txt
No dar código final por default.
Guiar con preguntas.
Dar pistas progresivas.
Respetar el nivel del usuario.
Respetar restricciones del ejercicio.
No inventar contexto.
Ser claro y breve.
```

La respuesta debe sentirse como tutor, no como generador de solución.

## Fallback

Si el proveedor principal falla por límite, timeout o error recuperable, el Gateway debe intentar el siguiente proveedor.

El cliente no debe recibir errores crudos como:

```txt
quota exceeded
rate limit
invalid provider response
```

Debe recibir un mensaje controlado o una respuesta si algún fallback funciona.

## Respuesta estructurada

Respuesta conceptual:

```json
{
  "ok": true,
  "kind": "hint",
  "message": "...",
  "providerSlot": "gemini-primary",
  "fallbackUsed": false
}
```

Si falla:

```json
{
  "ok": false,
  "error": {
    "code": "ALL_PROVIDERS_FAILED",
    "message": "La Guía no está disponible ahora.",
    "recoverable": true
  }
}
```

La UI debe poder mostrar esto sin parsear texto técnico.

## Privacidad

El Gateway debe recibir solo el contexto necesario.

No debe guardar código completo por default.

No debe guardar conversaciones completas por default.

Puede registrar métricas mínimas:

- proveedor usado
- fallback usado
- duración
- tipo de solicitud
- error code
- tokens aproximados si aplica

Sin guardar contenido sensible salvo política explícita.

## Relación con Ask Tutor

Ask Tutor prepara la experiencia de usuario.

Local Engine prepara contexto.

AI Gateway genera la ayuda usando proveedores externos.

La respuesta vuelve a Ask Tutor para mostrarse.

## Relación con KV y D1

KV puede ayudar con flags, cache ligero o estado temporal.

D1 puede registrar eventos mínimos si hace falta.

Ninguno debe guardar contenido sensible por default.

## Sin internet

Si el usuario no tiene internet, AI Gateway no estará disponible.

Lumen debe permitir seguir trabajando.

Ask Tutor debe mostrar un estado claro y no bloquear compilación ni edición.

## Reglas deterministas

Las claves viven en Cloud.

El cliente no rota proveedores.

El Gateway rota proveedores.

Gemini principal va primero.

Gemini secundario es fallback.

Groq es fallback.

Openrouter es fallback final configurado.

El Gateway aplica prompt de tutoría.

No se da código final por default.

La respuesta es estructurada.

Si todos fallan, Lumen degrada de forma segura.

## Resultado esperado

Ask Tutor puede ofrecer ayuda con IA sin exponer claves.

El usuario recibe guía socrática.

Los límites de proveedores se manejan detrás del Gateway.

Lumen puede cambiar proveedor sin reescribir la UI ni el Local Engine.
