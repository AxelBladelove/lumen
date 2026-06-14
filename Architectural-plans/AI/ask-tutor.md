# Ask Tutor

Archivo: `Architectural-plans/AI/ask-tutor.md`

## Propósito

`Ask Tutor` define la función de asistencia inteligente de Lumen.

En la UI puede llamarse `Guía`, `Ask Tutor` o un nombre equivalente de producto, pero su objetivo es el mismo: ayudar al usuario a avanzar sin regalarle directamente el código.

Ask Tutor existe para acompañar al estudiante mientras programa. Debe usar el ejercicio activo, el código actual, la selección del usuario, sus errores de compilación, sus intentos y el contexto del modo actual para dar una ayuda útil.

La regla principal es:

```txt
Ask Tutor guía.
Ask Tutor no resuelve por el usuario.
```

## Qué es Ask Tutor

Ask Tutor es una experiencia contextual de ayuda.

El usuario puede activarla con:

```txt
Ctrl + Shift + R
```

Al activarla, Lumen debe abrir una entrada pequeña de texto cerca del editor o integrada visualmente en la experiencia de edición.

La inspiración visual es el cuadro pequeño que aparece en VS Code cuando el usuario usa funciones como buscar o reemplazar. No debe sentirse como abrir un chat gigante por default.

La experiencia debe ser rápida, ligera y enfocada.

## Limitación técnica de VS Code

La intención visual es tener un pequeño cuadro de texto en el editor.

Sin embargo, Lumen no debe depender de hacks sobre el DOM interno de VS Code.

Si VS Code no permite insertar exactamente ese input flotante dentro del editor usando APIs oficiales, Lumen debe usar la alternativa oficial más cercana:

- Quick Input compacto.
- Mini card en el panel derecho.
- Webview pequeña dentro de la UI de Lumen.
- Experiencia contextual asociada al editor mediante APIs oficiales.

La regla es:

```txt
La experiencia debe sentirse como un input contextual del editor.
La implementación debe usar APIs oficiales de VS Code.
No se debe hackear el DOM interno de VS Code.
```

## Qué no es Ask Tutor

Ask Tutor no es un solucionador automático.

No es un generador de código final.

No es un botón para hacer el ejercicio por el usuario.

No debe ignorar las restricciones del ejercicio.

No debe enseñar caminos que contradigan la ruta actual.

No debe depender de que el ejercicio sea oficial.

Ask Tutor debe funcionar en Route Mode, Free Mode, ejercicios importados y ejercicios propios.

## Tech stack del módulo

Este módulo usa estas tecnologías del tech stack de Lumen:

- **VS Code Extension API**: para leer editor activo, selección del usuario, archivo actual y comando `Ctrl + Shift + R`.
- **Webview Frontend**: para mostrar la experiencia visual de la Guía, respuestas, pistas y estados.
- **Webview message passing**: para comunicar la UI de la Guía con el Extension Host.
- **Local Engine en Rust**: para preparar contexto real del ejercicio, errores, intentos, metadata y estado local.
- **SQLite**: para consultar errores recientes, intentos, progreso, pistas usadas y estado del ejercicio.
- **Tree-sitter**: para analizar código C, funciones, bloques, selección y contexto cercano.
- **AI Gateway**: backend que recibe las solicitudes de Lumen y decide qué proveedor de IA usar.
- **Gemini API**: proveedor principal inicial de la Guía.
- **Grok / xAI API**: proveedor fallback si Gemini no está disponible o llega a límite.
- **OpenAI API**: proveedor fallback final si está configurado y disponible.
- **JSON estructurado**: formato para enviar contexto, pregunta, modo, nivel de ayuda y respuesta.

Tecnologías que no pertenecen al cliente:

- **API keys privadas**: no deben vivir dentro de la extensión ni dentro de la webview.
- **Rotación de proveedores desde el cliente**: la selección de proveedor debe ocurrir en el Gateway.
- **Prompts sensibles hardcodeados en UI**: las reglas fuertes del tutor deben vivir en el backend o en configuración protegida.

## Entrada principal

La entrada principal es:

```txt
Ctrl + Shift + R
```

También debe existir un botón visible cuando el estado actual lo permita.

El botón debe mostrar el shortcut.

Al activarse, Ask Tutor abre una entrada compacta donde el usuario puede escribir su duda.

Ejemplos:

```txt
¿Por qué este while nunca termina?
¿Por qué me marca error aquí?
No entiendo qué pide el ejercicio.
¿Estoy usando bien esta función?
```

## Uso con selección de código

Si el usuario selecciona código y presiona `Ctrl + Shift + R`, esa selección se convierte en el contexto principal.

La selección puede ser:

- Una línea.
- Varias líneas.
- Una función.
- Un bloque.
- Una expresión.
- Un fragmento incompleto.

El input debe dejar claro que la pregunta se hará sobre la selección actual.

Si el usuario escribe una pregunta, Lumen envía:

```txt
pregunta del usuario
código seleccionado
ejercicio activo
errores recientes
modo activo
metadata relevante
```

Si el usuario no escribe una pregunta y elige pedir pista, Lumen genera una pista sobre esa selección.

## Uso sin selección

Si el usuario no selecciona nada y presiona `Ctrl + Shift + R`, Ask Tutor debe usar el contexto general del ejercicio activo.

Ese contexto puede incluir:

- Enunciado del ejercicio.
- Código actual.
- Archivo principal.
- Último error de compilación.
- Intentos recientes.
- Modo activo.
- Ruta y módulo, si aplica.
- Conceptos esperados.
- Restricciones del ejercicio.
- Pistas ya usadas.

Ask Tutor no debe responder como si no supiera qué está pasando.

## Dos funciones relacionadas

Ask Tutor tiene dos funciones relacionadas, pero no iguales:

```txt
Asistencia escrita.
Pistas.
```

La asistencia escrita ocurre cuando el usuario escribe una duda.

Las pistas ocurren cuando el usuario pide ayuda sin escribir una pregunta larga o cuando quiere una orientación progresiva.

Ambas usan IA y contexto.

Pero tienen reglas diferentes.

## Asistencia escrita

La asistencia escrita responde a una pregunta del usuario.

Debe tener en cuenta:

- Qué preguntó.
- Qué código seleccionó, si seleccionó algo.
- Qué ejercicio está resolviendo.
- Qué lleva escrito.
- Qué errores ha tenido.
- Qué intentos recientes existen.
- Qué modo está usando.
- Qué conceptos debería practicar.

La respuesta debe ser socrática.

Debe guiar al usuario hacia el razonamiento correcto.

No debe entregar el código final salvo que una política futura lo permita explícitamente.

## Pistas

Las pistas son ayudas limitadas y progresivas.

Cada ejercicio debe tener como máximo cuatro pistas disponibles.

Las pistas no deben ser necesariamente textos estáticos prehechos.

La mejor versión de Lumen debe generar pistas inteligentes usando el contexto real del usuario.

Una pista debe considerar:

- El ejercicio.
- La dificultad.
- El código actual del usuario.
- Los errores de compilación.
- Los intentos previos.
- Errores comunes del usuario.
- Conceptos esperados.
- Pistas ya usadas.

Las pistas deben ayudar más a medida que el usuario avanza por ellas.

## Cuatro pistas por ejercicio

Cada ejercicio debe limitarse a cuatro pistas.

La idea no es que el usuario pueda pedir ayuda infinita hasta llegar a la solución.

La progresión de pistas puede ser:

```txt
Pista 1: orientación suave.
Pista 2: concepto clave.
Pista 3: ubicación o patrón del error.
Pista 4: guía bastante directa, sin entregar solución completa.
```

Incluso la cuarta pista debe evitar dar el código final si no es estrictamente necesario.

## Cuándo se generan las pistas

Las pistas pueden generarse en dos momentos.

Primero, al importar o preparar un ejercicio, Lumen puede generar una base de pistas si ya tiene suficiente contexto del usuario, como errores comunes históricos o perfil de aprendizaje.

Segundo, si no existe contexto suficiente al importar, las pistas pueden generarse cuando el usuario las pide.

La regla preferida es:

```txt
Si hay contexto útil del usuario:
  generar o preparar pistas adaptadas al importar/preparar el ejercicio.
Si no hay contexto suficiente:
  generar pistas bajo demanda al pedirlas.
```

Las pistas no deben ser totalmente genéricas si Lumen tiene contexto real para personalizarlas.

## Pistas bajo demanda

Cuando el usuario pide una pista, Lumen debe mirar el estado actual.

No debe dar una pista como si el usuario todavía no hubiera escrito nada si ya escribió mucho código.

No debe repetir una pista que ya no sirve.

No debe ignorar errores de compilación recientes.

La pista debe responder a la situación actual del usuario.

Si el usuario cambió mucho el código desde la pista anterior, la siguiente pista debe adaptarse.

## Pistas y progreso

Usar pistas puede registrarse localmente.

Esto no debe sentirse como castigo, pero sí puede ayudar a medir progreso real.

Route Mode puede usar el número de pistas usadas como parte del contexto de dominio.

Free Mode puede registrar pistas usadas como memoria de práctica.

El sistema de progreso decide si usar pistas afecta gates, mastery o recomendaciones.

Ask Tutor solo debe registrar el evento y entregar la ayuda.

## AI Gateway

Ask Tutor debe usar un Gateway.

El Gateway es el backend que recibe la solicitud desde Lumen y decide qué proveedor de IA usar.

Las API keys no deben estar dentro de la extensión ni dentro de la webview.

El Gateway debe proteger las claves, manejar límites y hacer fallback cuando un proveedor no esté disponible.

La extensión envía una solicitud al Gateway.

El Gateway responde con la ayuda.

## Cadena de proveedores

La cadena inicial de proveedores debe ser:

```txt
1. Gemini API - cuenta/proyecto principal.
2. Gemini API - cuenta/proyecto secundario.
3. Groq - modelo gratuito o disponible.
4. Openrouter - modelo gratuito o fallback disponible, si está configurado.
```

La cadena exacta puede cambiar con el tiempo porque los límites y modelos gratuitos cambian.

La regla importante es que Ask Tutor debe ser provider-agnostic.

Lumen no debe quedar amarrado a un solo proveedor.

## Rate limits

El Gateway debe manejar rate limits.

Si Gemini principal llega a su límite, el Gateway debe intentar Gemini secundario.

Si Gemini secundario llega a su límite, debe intentar Grok.

Si Grok llega a su límite, debe intentar OpenAI si existe un modelo o cuota configurada.

Si todos los proveedores fallan, Lumen debe mostrar un estado claro:

```txt
La Guía no está disponible ahora.
Puedes seguir trabajando y compilar con F9.
```

El usuario no debe ver errores técnicos crudos de proveedores.

## Importante sobre Gemini

La rotación de Gemini no debe asumirse como “dos keys del mismo proyecto”.

Gemini aplica límites por proyecto.

Por eso, si Lumen usa dos claves Gemini como fallback, deben estar asociadas a proyectos o cuentas realmente separadas según la configuración disponible.

El Gateway debe tratar cada proveedor/cuenta/proyecto como un slot independiente de fallback.

## Prompt del sistema

El Gateway debe aplicar reglas fuertes de tutoría.

La regla principal del prompt es:

```txt
No dar el código final.
Guiar al estudiante.
Hacer preguntas.
Dar pistas progresivas.
Respetar el ejercicio.
Respetar el nivel del usuario.
```

El prompt debe decirle al modelo que responda como tutor, no como generador de soluciones.

La respuesta debe ser útil, pero no debe robarle al estudiante el aprendizaje.

## Respuesta socrática

La respuesta de la Guía debe seguir estilo socrático.

Debe:

- Hacer preguntas útiles.
- Señalar qué revisar.
- Explicar conceptos cuando haga falta.
- Relacionar el error con el código del usuario.
- Evitar saltar directo a la solución.
- Dar pasos razonables.
- Adaptarse al nivel del ejercicio.

No debe:

- Dar el código completo.
- Reescribir toda la solución.
- Ignorar las restricciones.
- Responder con teoría larga si el usuario pidió una pista breve.
- Inventar contexto que no tiene.

## Relación con errores de compilación

Ask Tutor debe usar errores de compilación cuando existan.

Si el usuario acaba de presionar `F9` y la compilación falló, esa información debe formar parte del contexto.

La Guía puede explicar que GCC a veces reporta una línea posterior a la causa real.

Por ejemplo, puede señalar que un error reportado en la línea 39 podría venir de una llave mal cerrada antes.

La Guía debe ayudar a razonar, no prometer que siempre sabe la causa exacta.

## Relación con Route Mode

En Route Mode, Ask Tutor debe respetar la ruta.

Debe conocer:

- Ruta actual.
- Módulo actual.
- Ejercicio activo.
- Conceptos esperados.
- Restricciones.
- Errores recientes.
- Intentos.
- Pistas usadas.

No debe enseñar soluciones o técnicas fuera de nivel salvo que sea necesario para aclarar algo.

No debe romper la intención pedagógica del ejercicio.

## Relación con Free Mode

En Free Mode, Ask Tutor debe funcionar con ejercicios importados y propios.

Si el ejercicio es propio y no tiene enunciado, Lumen debe usar el código y la pregunta del usuario como contexto principal.

Si falta información, la Guía debe hacer una pregunta aclaratoria corta.

Free Mode no debe tener asistencia de segunda categoría.

## Relación con Local Engine

El Local Engine prepara el contexto.

Debe reunir:

- Código seleccionado.
- Código cercano.
- Archivo actual.
- Ejercicio activo.
- Enunciado.
- Metadata.
- Errores recientes.
- Intentos.
- Ruta y módulo.
- Pistas usadas.
- Restricciones.
- Conceptos esperados.

La webview no debe armar contexto profundo sola.

El engine decide qué contexto es útil y seguro.

## Relación con Local Database

La base local debe guardar datos útiles para Ask Tutor.

Puede guardar:

- Pistas usadas.
- Intentos recientes.
- Errores recientes.
- Estado del ejercicio.
- Eventos mínimos de ayuda.
- Preferencias de ayuda, si existen.

No debe guardar conversaciones completas por default sin política clara.

La privacidad del usuario importa.

## Relación con Webview

La webview muestra la experiencia de la Guía.

Puede mostrar:

- Input de pregunta.
- Botón de pedir pista.
- Pistas usadas.
- Respuesta del tutor.
- Estado de carga.
- Error si el Gateway falla.

La webview no debe tener claves de proveedores.

La webview no decide proveedor.

La webview no decide contexto profundo.

## Relación con Extension Host

El Extension Host recibe `Ctrl + Shift + R`.

Debe leer selección del editor, archivo activo y estado básico.

Luego debe pedir al Local Engine preparar contexto.

Después debe mostrar la UI adecuada o enviar el mensaje a la webview.

El Extension Host coordina, pero no decide la respuesta.

## Privacidad

Ask Tutor debe enviar el mínimo contexto útil.

No debe mandar todo el workspace si el usuario seleccionó solo una función.

No debe mandar archivos no relacionados.

No debe mandar datos personales innecesarios.

Los ejercicios propios y código del usuario deben tratarse como contenido privado.

## Sin internet

Si no hay internet, Ask Tutor puede no estar disponible.

Eso no debe bloquear Lumen.

El usuario debe poder seguir:

- Editando código.
- Compilando con F9.
- Viendo errores.
- Usando ejercicios importados.

La Guía es una ayuda, no una dependencia para resolver.

## Fallos esperados

Ask Tutor debe manejar fallos como:

- No hay ejercicio activo.
- No hay archivo compatible.
- No hay selección y falta contexto.
- Gateway no disponible.
- Gemini principal llegó a límite.
- Gemini secundario llegó a límite.
- Groq llegó a límite.
- Openrouter fallback no disponible.
- Todos los proveedores fallaron.
- Timeout.
- Respuesta inválida.
- Contexto demasiado grande.
- Local Engine no pudo preparar contexto.

Todos deben mostrarse de forma controlada.

## Reglas deterministas

`Ctrl + Shift + R` abre la Guía.

La entrada debe sentirse como un input contextual del editor.

Si hay selección, la selección es contexto principal.

Si no hay selección, se usa el ejercicio activo.

La Guía permite escribir pregunta.

La Guía permite pedir pistas.

Cada ejercicio tiene máximo cuatro pistas.

Las pistas deben adaptarse al contexto del usuario cuando sea posible.

El Gateway maneja proveedores y rate limits.

Las API keys viven en el Gateway, no en cliente.

La cadena inicial es Gemini principal, Gemini secundario, Grok y OpenAI fallback.

La Guía no da el código final por default.

Si falla la Guía, Lumen sigue funcionando.

## Resultado esperado

El usuario selecciona código o no selecciona nada.

Presiona `Ctrl + Shift + R`.

Aparece una entrada compacta para escribir una duda o pedir una pista.

Lumen prepara contexto real.

El Gateway elige proveedor disponible.

La Guía responde de forma socrática.

El usuario recibe ayuda sin que Lumen le robe el aprendizaje.

Las pistas son limitadas, inteligentes y contextuales.

Ask Tutor convierte Lumen en un entorno de práctica asistida, no en una máquina de copiar soluciones.
