# AGENTS.md — UmlStudio

Guía para agentes de IA que trabajan en este repositorio. Explica qué es el proyecto, dónde está cada cosa y qué reglas no se pueden romper. El detalle está en los documentos enlazados: consultalos en vez de suponer.

## Qué es

Herramienta CASE web para **diagramas de clases UML 2.5** (y nada más): edición en canvas, colaboración en tiempo real, asistencia de IA por texto, voz e imagen, import/export (XMI, imágenes, JSON), generación de backends Spring Boot y servidor MCP. Proyecto académico desarrollado con **PUDS**.

## Mapa del repositorio

| Ruta              | Qué contiene                                                                                                          |
| :---------------- | :-------------------------------------------------------------------------------------------------------------------- |
| `packages/core`   | Motor del editor (React Flow + Yjs), metamodelo, esquema `uml-model-4.schema.json`, contrato `ModelDiff`, XMI/SVG/PNG |
| `packages/ui`     | Design system y tokens (Tailwind v4)                                                                                  |
| `apps/webapp`     | SPA (Vite, TanStack Router, Zustand, React Query)                                                                     |
| `apps/server`     | API REST Hono + relay WebSocket + Redis (auth, diagramas, versiones, conversión, productividad)                       |
| `apps/codegen`    | Generador Spring Boot (Spring Initializr), SQL, OpenAPI, Postman                                                      |
| `apps/ai-service` | FastAPI (Python): chat → `ModelDiff`, voz (Whisper), visión, auditoría                                                |
| `apps/mcp-server` | Servidor MCP (FastMCP, Python)                                                                                        |
| `apps/docs`       | Manual de usuario (Docusaurus)                                                                                        |
| `docker/`         | Compose local y de producción                                                                                         |
| `docs/`           | Documentación del proyecto (ver tabla de abajo)                                                                       |

## Dónde buscar

| Necesito…                                | Documento                                                |
| :--------------------------------------- | :------------------------------------------------------- |
| Entender módulos, flujos y despliegue    | [`ARCHITECTURE.md`](ARCHITECTURE.md)                     |
| Casos de uso, fases PUDS, pruebas por CU | [`docs/CICLO_1.md`](docs/CICLO_1.md)                     |
| Requisitos RF/RNF                        | [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md)           |
| Convenciones de código y comandos        | [`docs/CODING_STANDARDS.md`](docs/CODING_STANDARDS.md)   |
| Redis, IndexedDB, mapeo a PostgreSQL     | [`docs/DATABASE.md`](docs/DATABASE.md)                   |
| Tokens y estilo visual                   | [`DESIGN.md`](DESIGN.md)                                 |
| Calidad (ISO/IEC 25010)                  | [`docs/QUALITY_STANDARDS.md`](docs/QUALITY_STANDARDS.md) |
| Flujo de trabajo, ramas, commits, PR     | [`CONTRIBUTING.md`](CONTRIBUTING.md)                     |

Leé solo la sección que necesitás (buscá por `CU-06`, `RF-28`, etc.), no el archivo entero.

## Comandos

```bash
pnpm install              # dependencias (solo pnpm)
pnpm dev                  # webapp + server + Redis en Docker
pnpm lint                 # ESLint en ui, core, server, webapp, codegen
pnpm format               # Prettier
pnpm test:all             # Vitest en core, server y codegen
pnpm --filter @umlstudio/<paquete> test   # un paquete
```

## Reglas duras

1. **Dominio**: solo diagramas de clases (clases, interfaces, enums, paquetes y sus relaciones). Nada de casos de uso, secuencia, actividad ni BPMN en el canvas.
2. **pnpm únicamente**. Nunca `npm`, nunca `package-lock.json`. Dependencias internas con `workspace:*` y versiones compartidas en el `catalog` de `pnpm-workspace.yaml`.
3. **Vitest** para tests de TypeScript. Nada de Jest ni Mocha.
4. **Calidad antes de terminar**: `pnpm lint` sin errores ni warnings, `pnpm format` aplicado y los tests del paquete tocado en verde.
5. **Identidad real**: en salas compartidas y versiones la identidad sale del JWT. Nunca inventes nombres, colores ni usuarios anónimos.
6. **Mutaciones por contrato**: IA, voz y MCP modifican el diagrama solo con un `ModelDiff` validado.
7. **Errores honestos**: nunca devuelvas datos simulados como si fueran reales; mostrá la causa del fallo.
8. **Capas**: en `apps/server`, `routes/` valida y delega, y la lógica va en `services/`. En la webapp, nada de llamadas de red en componentes de presentación.
9. **Codegen**: parte siempre del ZIP de Spring Initializr; capas `entity`, `repository`, `service`, `dto`, `controller`; puerto por defecto **9000**.
10. **Puertos**: `5173, 8000, 4444, 8001, 8002, 8003, 6379`. Si un test o script tuyo levanta un proceso, cerralo antes de terminar. `pnpm dev` lo corre el usuario en su terminal.
11. **Secretos**: nunca commitees `.env*`, tokens ni material local no versionado; nunca cites credenciales en código, issues o PR.
12. **Sin atribución de IA**: nunca agregues `Co-authored-by`, `Assisted-by` ni líneas "Generated with …" que nombren una IA en commits, PR, issues o comentarios. El autor es siempre el integrante del equipo. El CI rechaza los PR que lo incumplan.
13. **Git**: Conventional Commits en inglés y una rama por issue (ver `CONTRIBUTING.md`). `main` está protegida: todo entra por PR con los checks en verde. No hagas push ni merge sin pedido explícito.

## Cosas que no son obvias

- El servidor WebSocket es un **relay**: no guarda ni interpreta el diagrama. El estado vive en el `Y.Doc` de cada cliente y se persiste por REST (`PUT /api/diagrams/:id`).
- En producción, REST y WebSocket comparten puerto (`/ws`); en local el WebSocket usa `4444`.
- Redis no necesita RedisJSON: los cuerpos se guardan como gzip + base64. Las operaciones de versionado son funciones Lua (`umlstudio`).
- El navegador llama directo a `ai-service` (`VITE_AI_SERVICE_URL`); el codegen pasa por el server (`/api/codegen/*`).
- `ai-service` y `mcp-server` son Python y quedan fuera del grafo de pnpm.
- Render (plan gratuito) tiene arranques en frío de 30–60 s: un timeout no siempre es un bug.
- El CI (`ci.yml`) corre formato, lint, build y todas las suites en cada PR; el merge a `main` exige `CI passed` y `Commits & attribution` en verde. El deploy es automático tras el CI en `main`.

## Herramientas opcionales del agente

Si están disponibles en tu entorno: **CodeGraph** (`codegraph_explore`) para navegar símbolos y dependencias antes de leer archivos, y **Engram** (`mem_search`, `mem_save`) para recuperar y guardar decisiones entre sesiones.
