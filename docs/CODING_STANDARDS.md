# Estándares de Codificación — UmlStudio

> Convenciones por tecnología. El formato lo impone Prettier (`.prettierrc`) y el estilo de TypeScript lo verifica ESLint (un `eslint.config.mjs` por paquete). Ante una duda, gana lo que ya hace el código vecino.

## 1. Resumen por tecnología

| Ámbito                                                                          | Indentación | Línea máx. | Estilo base                                |
| :------------------------------------------------------------------------------ | :---------: | :--------: | :----------------------------------------- |
| TypeScript / React (`packages/*`, `apps/webapp`, `apps/server`, `apps/codegen`) | 2 espacios  |    100     | Sin `;`, comillas dobles, coma final `es5` |
| Python (`apps/ai-service`, `apps/mcp-server`)                                   | 4 espacios  |     88     | PEP 8                                      |
| Java generado por `apps/codegen`                                                | 4 espacios  |    120     | Google Java Style                          |
| Markdown, JSON, YAML                                                            | 2 espacios  |    100     | Prettier                                   |

## 2. TypeScript

**Nombres**

| Elemento                        | Convención            | Ejemplo                               |
| :------------------------------ | :-------------------- | :------------------------------------ |
| Componentes React y su archivo  | `PascalCase.tsx`      | `VersionDrawer.tsx`                   |
| Hooks y stores                  | `useCamelCase`        | `useAuthStore`, `useVoiceRecorder`    |
| Funciones y variables           | `camelCase`           | `commitSnapshot`, `selectedElementId` |
| Tipos, interfaces, clases       | `PascalCase`          | `ModelDiff`, `AuthService`            |
| Constantes                      | `UPPER_SNAKE_CASE`    | `ACCESS_TTL_SECONDS`                  |
| Archivos de servicio del server | `kebab-case.ts`       | `auth-service.ts`                     |
| Rutas de TanStack Router        | convención del router | `shared.$diagramId.tsx`               |

**Reglas**

- Tipado estricto: sin `any` injustificado; retornos asíncronos tipados (`Promise<T>`) y `async/await` en vez de cadenas `.then()`.
- `no-console` es error: usar el `logger` del servidor.
- Server: `routes/` valida y delega; la lógica va en `services/`.
- Webapp: estado síncrono en Zustand, estado remoto en React Query, sin llamadas de red dentro de componentes de presentación.
- Estilos: tokens de `@umlstudio/ui` ([`../DESIGN.md`](../DESIGN.md)). Prohibidos colores hex sueltos en componentes y clases arbitrarias de Tailwind con espacios (por ejemplo `hover:bg-[color-mix(...)]`).
- Errores honestos: nunca devolver datos simulados como si fueran reales.

## 3. Python

- Funciones y variables en `snake_case`; clases y modelos Pydantic en `PascalCase`; constantes en `UPPER_SNAKE_CASE`.
- _Type hints_ en parámetros y retornos; modelos Pydantic v2 para entradas y salidas de la API.
- Docstrings estilo Google en endpoints y servicios públicos.
- Proveedores de IA: una clase por proveedor que hereda de `BaseAIAdapter`.
- Errores: `HTTPException` con el código real (400, 422, 502, 503, 504) y un mensaje en español para el usuario.

## 4. Java generado

- Clases en `PascalCase` (`PedidoController`), métodos y campos en `camelCase`, paquetes en minúsculas (`com.example.demo.entity`).
- Capas en paquetes separados: `entity`, `repository`, `service`, `dto`, `controller`.
- Una anotación por línea; JavaDoc en servicios y controladores públicos.
- `application.yml` con PostgreSQL parametrizado y `server.port: 9000`.

## 5. Datos

| Motor                 | Convención                                                                                                                               |
| :-------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| Redis                 | Llaves con `:` y _hash tag_ por diagrama: `diagram:{id}:version:<vid>`. Operaciones atómicas en funciones Lua de la librería `umlstudio` |
| IndexedDB             | Base `umlstudio-versions`; stores en `camelCase`                                                                                         |
| PostgreSQL (generado) | Tablas en plural y `snake_case` (`pedidos`), FK `<entidad>_id`, PK `id`                                                                  |

Detalle en [`DATABASE.md`](DATABASE.md).

## 6. Comandos de verificación

| Control       | Comando                                                                                                                                               | Criterio                                                              |
| :------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------- |
| Formato       | `pnpm format` / `pnpm format:check`                                                                                                                   | Sin diferencias                                                       |
| Lint          | `pnpm lint` / `pnpm lint:fix`                                                                                                                         | 0 errores y 0 warnings en `ui`, `core`, `server`, `webapp`, `codegen` |
| Tests         | `pnpm test:<suite>` (`core`, `server`, `codegen`, `webapp`, `mcp`, `ai`, `scripts`) y `python -m unittest discover -s test/unit` en `apps/ai-service` | 100 % en verde (el CI corre todas)                                    |
| Commits       | `commitlint` (hook `commit-msg`) · `pnpm check:ai-attribution --message-file <archivo>`                                                               | Conventional Commits y sin atribución de IA                           |
| Código muerto | `pnpm knip`                                                                                                                                           | Sin exportaciones ni dependencias sin uso nuevas                      |
| Dependencias  | `pnpm audit`                                                                                                                                          | Sin vulnerabilidades críticas ni altas                                |
