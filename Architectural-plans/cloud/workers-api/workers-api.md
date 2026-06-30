# Workers API

Archivo: `Architectural-plans/cloud/workers-api/workers-api.md`

## Propósito

`Workers API` define la entrada HTTP principal de la nube de Lumen.

## Estado actual del repo

Workers API no está implementada en este repositorio. No hay proyecto
Cloudflare Worker, `wrangler.toml`, endpoints HTTP, bindings ni código cloud.
Este documento describe la arquitectura objetivo.

Este submódulo no guarda paquetes, no guarda objetos grandes, no reemplaza la base local y no renderiza la UI. Su responsabilidad es exponer endpoints pequeños, claros y seguros para que el Local Engine pueda consultar metadata, pedir descargas autorizadas y usar servicios remotos como la Guía.

La regla principal es:

```txt
Workers API coordina la nube.
D1 guarda metadata.
R2 guarda paquetes y assets.
KV cachea lecturas frecuentes.
AI Gateway maneja proveedores de IA.
```

## Qué es Workers API

Workers API es la capa serverless de Lumen en Cloudflare Workers.

El Local Engine llama esta API cuando necesita información remota.

Ejemplos:

```txt
consultar versión de la colección
consultar rutas disponibles
consultar metadata de un módulo
pedir URL o stream autorizado de un paquete
pedir assets de un módulo
enviar solicitud a la Guía
```

La webview no debe saltarse al Local Engine para descargar paquetes o decidir permisos importantes.

## Tech stack del submódulo

- **Cloudflare Workers**: runtime serverless principal.
- **TypeScript**: lenguaje del Worker.
- **Wrangler**: desarrollo, configuración y deploy.
- **Bindings de Cloudflare**: acceso a D1, R2, KV y secrets.
- **JSON versionado**: formato de entrada y salida.
- **D1 binding**: lectura de metadata estructurada.
- **R2 binding**: acceso a paquetes y assets.
- **KV binding**: cache de manifests y respuestas frecuentes.
- **Secrets**: claves privadas del AI Gateway y configuración sensible.

## Responsabilidades

Workers API debe:

- Exponer endpoints de lectura para colección, rutas, módulos y versiones.
- Pedir metadata a D1.
- Pedir objetos a R2 cuando corresponda.
- Usar KV como cache cuando sea seguro.
- Proteger descargas de paquetes privados.
- Validar versiones del cliente cuando haga falta.
- Devolver errores estructurados.
- Enviar solicitudes al AI Gateway o vivir junto a él si se decide así.

Workers API no debe:

- Guardar progreso local del usuario como fuente principal.
- Compilar código.
- Ejecutar programas.
- Decidir el layout de VS Code.
- Decidir por sí solo desbloqueos locales.
- Exponer buckets R2 directamente como públicos por default.

## Endpoints iniciales

Endpoints conceptuales:

```txt
GET /health
GET /collection/manifest
GET /routes
GET /routes/:routeId
GET /routes/:routeId/modules/:moduleId
GET /exercises/:exerciseId
POST /packages/:packageId/authorize
POST /ai/ask
POST /ai/hint
```

El nombre exacto puede cambiar, pero los endpoints deben ser simples y versionados.

## Versionado de API

Workers API debe tener versión.

Ejemplo:

```txt
/api/v1/collection/manifest
/api/v1/routes/c
```

La versión evita romper clientes antiguos cuando cambie la estructura de metadata.

El Local Engine debe poder saber si la API remota es compatible con su versión.

## Responses estructuradas

Toda respuesta importante debe ser JSON estructurado.

Ejemplo de éxito:

```json
{
  "ok": true,
  "data": {}
}
```

Ejemplo de error:

```json
{
  "ok": false,
  "error": {
    "code": "PACKAGE_NOT_FOUND",
    "message": "El paquete no existe.",
    "recoverable": true
  }
}
```

La UI no debe depender de parsear texto humano para entender fallos.

## Seguridad

Workers API debe validar solicitudes.

No debe permitir descargar paquetes privados sin pasar por reglas de acceso.

No debe exponer secrets.

No debe confiar en parámetros del cliente para decidir acceso sin validar.

No debe devolver metadata interna innecesaria.

## Relación con D1

Workers API consulta D1 para metadata estructurada:

- rutas
- módulos
- ejercicios
- manifests
- versiones
- referencias a assets
- referencias a paquetes
- reglas de desbloqueo

Workers API no debe guardar esos datos duplicados en código.

## Relación con R2

Workers API usa R2 para servir paquetes y assets.

El Worker decide si el cliente puede acceder a un objeto.

R2 no debe exponerse como público por default.

## Relación con KV

Workers API puede usar KV para cachear manifests y metadata de lectura frecuente.

KV no debe ser la fuente de verdad para datos críticos.

## Relación con AI Gateway

Workers API puede exponer los endpoints de la Guía o delegarlos a un Worker separado.

La regla es que el cliente solo ve una API estable.

El Gateway decide proveedor, fallback y manejo de límites.

## Reglas deterministas

Workers API coordina la nube.

D1 es metadata.

R2 es objetos.

KV es cache.

AI Gateway es proveedores de IA.

Workers API no compila.

Workers API no guarda progreso local como fuente principal.

Workers API devuelve JSON estructurado.

Workers API debe ser versionada.

## Resultado esperado

El Local Engine puede hablar con una API remota clara.

Puede descubrir contenido.

Puede descargar paquetes autorizados.

Puede obtener metadata de rutas.

Puede pedir ayuda de IA.

Y si la nube falla, el usuario sigue trabajando con contenido local ya importado.
