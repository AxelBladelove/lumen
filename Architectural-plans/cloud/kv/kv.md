# KV

Archivo: `Architectural-plans/cloud/kv/kv.md`

## Propósito

`KV` define la capa de cache remoto de Lumen.

KV no es la fuente de verdad de Lumen.

KV se usa para acelerar lecturas frecuentes de metadata que cambia poco o que puede reconstruirse desde D1/R2.

La regla principal es:

```txt
D1 es fuente de verdad de metadata.
R2 es fuente de objetos.
KV es cache.
```

## Qué es KV en Lumen

KV es un almacenamiento key-value global para datos simples y de lectura frecuente.

En Lumen puede servir para cachear manifests, índices ligeros, flags remotos y metadata que se consulta mucho.

KV ayuda a reducir consultas repetidas a D1 cuando la información no cambia a cada momento.

## Qué puede guardar KV

KV puede guardar:

- collection manifest cacheado
- route manifest cacheado
- module manifest cacheado
- assets manifest
- feature flags remotos
- configuración remota no sensible
- versión actual de colección
- índices ligeros de búsqueda
- respuestas precalculadas de metadata

## Qué no debe guardar KV

KV no debe guardar:

- progreso local del usuario
- intentos
- errores personales
- paquetes de ejercicios completos
- assets grandes
- claves privadas
- estado crítico que no pueda reconstruirse
- desbloqueos locales como fuente principal

KV no debe usarse como base de datos principal.

## Tech stack del submódulo

- **Cloudflare Workers KV**: almacenamiento key-value global.
- **Workers KV binding**: acceso desde Workers API.
- **Wrangler KV commands**: administración y desarrollo.
- **JSON cacheado**: formato principal de valores.
- **TTL / cache invalidation**: estrategia para refrescar datos.

## Uso principal

Uso principal de KV:

```txt
Worker recibe request.
Worker busca manifest en KV.
Si existe y está vigente:
  responde desde KV.
Si no existe:
  consulta D1.
  genera manifest.
  guarda en KV.
  responde.
```

Esto mantiene D1 como fuente de verdad y KV como cache.

## Manifests cacheados

Manifests candidatos:

```txt
collection:manifest:latest
route:c:manifest:latest
module:c:strings:manifest:latest
assets:manifest:latest
```

Cada manifest debe tener versión o timestamp para evitar servir datos viejos de forma peligrosa.

## Feature flags

KV puede guardar flags remotos simples.

Ejemplos:

```txt
ai.gateway.enabled
collection.remote.enabled
route.c.enabled
race.preview.enabled
```

Los flags no deben controlar seguridad crítica por sí solos.

Sirven para activar/desactivar comportamiento remoto de forma simple.

## Invalidation

KV necesita estrategia de invalidación.

Si cambia una ruta, módulo, ejercicio o asset importante, el cache debe actualizarse o expirar.

Opciones:

- usar keys versionadas
- usar TTL
- purgar manualmente en deploy
- escribir nueva versión de manifest

La opción más segura es usar keys versionadas cuando el contenido cambia.

## Relación con D1

D1 es la fuente de verdad de metadata estructurada.

KV puede guardar copias derivadas.

Si KV y D1 no coinciden, D1 gana.

Workers API debe poder regenerar KV desde D1.

## Relación con R2

KV puede guardar manifests que apuntan a objetos R2.

No debe guardar el objeto grande.

Ejemplo:

```json
{
  "assetKey": "assets/routes/c/strings/node-active/v1.png",
  "version": 1
}
```

## Relación con Workers API

Workers API lee KV para acelerar respuestas.

El cliente no debe depender de saber si una respuesta vino de KV o D1.

La API debe mantener el mismo formato.

## Relación con Local Engine

El Local Engine puede recibir metadata que vino de KV sin saberlo.

Lo importante es que Workers API devuelva datos estructurados y versionados.

El engine debe seguir validando localmente.

## Fallos esperados

KV puede fallar o tener datos viejos.

Casos:

- key no encontrada
- manifest viejo
- JSON inválido
- cache inconsistente
- KV no disponible temporalmente

En esos casos, Workers API debe intentar volver a D1 cuando sea posible.

## Reglas deterministas

KV es cache.

KV no es fuente de verdad.

KV no guarda progreso local.

KV no guarda paquetes grandes.

KV no guarda secrets.

D1 gana sobre KV.

R2 guarda objetos.

Workers API puede regenerar KV.

## Resultado esperado

KV hace que la nube de Lumen sea más rápida y barata para lecturas frecuentes.

Permite cachear manifests y metadata común.

Reduce carga sobre D1.

Pero si KV falla, Lumen debe poder seguir consultando D1 o degradar de forma segura.
