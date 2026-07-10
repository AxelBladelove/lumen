# Installer and Toolchain Control Center

Estado: `planned`

## Propósito

El instalador prepara Lumen para una persona no técnica: extensión, Local Engine, workspace, toolchain de C, configuración y actualizaciones.

## Experiencia

1. bienvenida;
2. revisión del sistema;
3. selección de carpeta cuando aplique;
4. comprobación de VS Code;
5. instalación o actualización de Lumen;
6. comprobación o provisión de MSYS2 UCRT64 + GCC;
7. health checks;
8. primera apertura;
9. pantalla final con estado claro.

## Control Center

Después de instalar, el mismo producto puede ofrecer:

- estado de Lumen;
- versión de extensión y engine;
- estado del compilador;
- reparar instalación;
- actualizar;
- abrir carpeta local;
- exportar diagnósticos;
- desinstalar sin borrar trabajo por default.

## Reglas

- No abrir terminales innecesarias frente al usuario.
- No pedir confirmaciones duplicadas.
- Los errores deben explicar la acción siguiente.
- La reparación debe ser idempotente.
- Actualizar el engine no debe destruir SQLite ni ejercicios.
- La desinstalación separa aplicación y datos personales.
- Detectar sesiones y herramientas existentes antes de reinstalar.

## Toolchain

El default inicial es MSYS2 UCRT64 + GCC. El instalador debe detectar una instalación válida, verificar versión y permitir reparación. Lumen debe seguir soportando detección del compilador desde Local Engine.

## Futuro

La implementación objetivo del Control Center puede usar Tauri + Svelte + Rust para compartir filosofía y piezas con el futuro standalone.
