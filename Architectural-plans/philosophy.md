# Lumen Philosophy

Archivo: `Architectural-plans/philosophy.md`

## Propósito

Este documento define la filosofía base de Lumen.

No es un documento técnico de implementación.

No define módulos, APIs, tablas, carpetas ni features concretos.

Su función es dejar claro cómo debe pensar cualquier persona o AI agent antes de construir algo dentro de Lumen.

## Idea central

Lumen debe sentirse simple para el usuario y serio por dentro.

El usuario no debe ver complejidad innecesaria.

La arquitectura, en cambio, debe estar bien separada, ser mantenible y estar pensada para crecer.

La regla base es:

```txt
Simple por fuera.
Sólido por dentro.
Rápido siempre.
```

## Performance-first

Lumen es performance-first.

Esto significa que la rapidez no es un detalle final ni un polish opcional.

La velocidad debe influir en las decisiones desde el principio.

Si una solución se siente pesada, lenta, frágil o difícil de optimizar, no es una buena solución para Lumen.

Performance-first no significa complicar todo prematuramente.

Significa construir de forma que el producto pueda sentirse inmediato, fluido y confiable.

La UI debe responder rápido.

El engine debe responder rápido.

La compilación debe sentirse directa.

Las animaciones no deben tapar lentitud real.

Los efectos visuales deben estar al servicio de la experiencia, no en contra de ella.

## Modularidad

Lumen debe ser modular.

Modular no significa crear archivos infinitos.

Modular significa que cada parte debe tener una responsabilidad clara.

Una capa no debe hacer el trabajo de otra.

El frontend no debe decidir reglas de progreso.

El Extension Host no debe convertirse en el cerebro del producto.

Cloud no debe reemplazar la lógica local.

La base de datos no debe contener lógica de UI.

El engine no debe renderizar pantallas.

Cada pieza debe poder cambiar sin romper todo el sistema.

## Local-first

Lumen debe funcionar primero en la máquina del usuario.

La nube puede ayudar, actualizar, descargar, servir contenido o conectar servicios, pero no debe ser la base de todo.

Un ejercicio que ya está en la máquina debe poder abrirse y trabajarse sin depender de internet.

El progreso local debe tener valor propio.

El usuario no debe sentir que Lumen se rompe porque un servicio remoto falló.

La nube complementa.

Lo local sostiene.

## Rust-first cuando aporte valor

Lumen debe favorecer Rust para las partes críticas.

Rust tiene sentido donde hay lógica local, filesystem, compilación, parsing, procesamiento, estado persistente, validación, tooling o rendimiento sensible.

Rust no debe usarse como adorno.

Tampoco debe forzarse para cambios puramente visuales.

La regla es:

```txt
Si afecta robustez, rendimiento o lógica central, piensa en Rust.
Si es UI visual directa, usa la herramienta visual correcta.
```

## UI con intención

Lumen debe verse bien porque la experiencia visual también enseña.

La UI no debe sentirse como una demo genérica.

Debe sentirse como un producto moderno, enfocado y premium.

Pero la estética no puede destruir la arquitectura.

Un buen resultado visual debe construirse con criterio:

- componentes claros;
- assets bien preparados;
- efectos controlados;
- jerarquía visual;
- sombras consistentes;
- animaciones con propósito;
- materiales que no parezcan pegados.

Si algo se ve mal, no se acepta solo porque compila.

Si algo se ve bien pero está mal estructurado, tampoco es suficiente.

## Prototipos como aprendizaje, no como deuda

Los prototipos son útiles.

Sirven para descubrir materiales, layouts, interacciones y límites técnicos.

Pero un prototipo no debe convertirse automáticamente en arquitectura final.

Se conserva lo valioso.

Se descarta lo que arrastra deuda.

La filosofía es:

```txt
Reutilizar aprendizajes.
No heredar desorden.
```

## AI agents

Un AI agent que trabaje en Lumen debe construir con intención.

No debe crear código por llenar espacio.

No debe duplicar componentes sin entender lo existente.

No debe inventar una arquitectura paralela.

No debe reescribir todo por comodidad.

No debe confundir un mock con una base final.

Antes de construir, debe entender qué problema está resolviendo y qué parte del sistema está tocando.

Después de construir, debe poder explicar qué cambió y por qué.

## Calidad sobre cantidad

Lumen no necesita más archivos por parecer más profesional.

Necesita mejores decisiones.

Un documento corto puede valer más que diez documentos largos.

Un componente limpio puede valer más que una arquitectura enorme.

Una solución simple puede ser mejor que una abstracción prematura.

La pregunta correcta no es:

```txt
¿Esto se ve más grande?
```

La pregunta correcta es:

```txt
¿Esto hace que Lumen sea más claro, rápido y mantenible?
```

## Anti-filosofía

Lumen no debe seguir estos patrones:

- hacer algo rápido y dejar deuda sin control;
- mezclar UI con lógica central;
- meter hacks frágiles;
- duplicar sistemas;
- depender de internet para lo que debe ser local;
- crear ejercicios en carpetas personales del usuario;
- aceptar SVGs o assets feos solo porque son técnicamente válidos;
- reescribir partes difíciles sin respetar lo que ya funciona;
- usar tecnología por moda en vez de por necesidad;
- construir como si fuera una demo temporal.

## Mantra

```txt
Performance-first.
Local-first.
Modular.
Visualmente intencional.
Técnicamente sólido.
Preparado para crecer.
```

Lumen debe construirse como una base para años de trabajo, no como un experimento suelto.
