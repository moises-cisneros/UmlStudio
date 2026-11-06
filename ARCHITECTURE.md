# Arquitectura de Software — UmlStudio

> **Modelo**: vistas 4+1 de Kruchten (PUDS).
> **Versión documentada**: v2.0, cierre del [Ciclo 2](docs/CICLO_2.md).
> **Alcance**: herramienta CASE exclusiva para **diagramas de clases UML 2.5**, colaborativa en tiempo real y asistida por IA.

---

## 1. Vista de casos de uso

Los casos de uso del sistema (14 del Ciclo 1 y 3 del Ciclo 2), sus actores (Modelador UML, Cliente MCP Externo, Participante Colaborativo) y su especificación completa están en [`docs/CICLO_1.md`](docs/CICLO_1.md) y [`docs/CICLO_2.md`](docs/CICLO_2.md). Estos son los que condicionan la arquitectura:

| CU                                        | Decisión que impone                                                                    |
| :---------------------------------------- | :------------------------------------------------------------------------------------- |
| CU-02 Colaborar en tiempo real            | CRDT (Yjs) en el cliente + relay WebSocket con JWT                                     |
| CU-03/CU-04 IA texto, voz e imagen        | Microservicio Python separado con adaptadores intercambiables                          |
| CU-06/CU-07 Generar Spring Boot / OpenAPI | Microservicio de generación que consume Spring Initializr                              |
| CU-08 Versionado                          | Funciones Lua atómicas en Redis                                                        |
| CU-09 MCP                                 | Servidor MCP independiente que reutiliza el contrato `ModelDiff`                       |
| CU-15 IA de Sala (Room AI)                | Orquestador en servidor, réplica Yjs en memoria, proveedor self-hosted y streaming SSE |
| CU-16 Aplicar Propuesta de IA             | Revalidación atómica contra la réplica y ciclo de vida de claims                       |
| CU-17 Configurar IA de Sala               | Política por sala en Redis (mentor/ejecutor, auto/confirm, moderador proactivo)        |

## 2. Vista lógica

### 2.1 Módulos y dependencias

```mermaid
graph LR
    UI["@umlstudio/ui<br/>design system"] --> Core["@umlstudio/core<br/>motor del editor"]
    UI --> Webapp["@umlstudio/webapp<br/>SPA"]
    Core --> Webapp
    Webapp -->|REST + WS| Server["@umlstudio/server<br/>Hono + relay WS"]
    Webapp -->|REST| AI["ai-service<br/>FastAPI"]
    Server -->|REST| Codegen["@umlstudio/codegen<br/>Hono"]
    Codegen -->|HTTPS| Initializr["start.spring.io"]
    Server --> Redis[("Redis")]
    MCP["mcp-server<br/>FastMCP"]
    AI -.->|"contrato ModelDiff"| Core
    MCP -.->|"contrato ModelDiff"| Core
```

Las líneas punteadas indican que se comparte un **contrato** (el formato `ModelDiff`), no una dependencia de código: los servicios Python lo replican con Pydantic.

### 2.2 Metamodelo (`packages/core/lib/typings.ts`)

```ts
type UMLModel = {
  version: `4.${number}.${number}` // esquema v4
  id: string
  title: string
  type: UMLDiagramType // solo "ClassDiagram"
  nodes: UmlStudioNode[] // tipos: "class", "package"
  edges: UmlStudioEdge[] // relaciones UML
  assessments: Record<string, Assessment>
}
```

- **Nodos**: `package` y `class`. Clase abstracta, interfaz y enumeración son variantes de `class` mediante estereotipo.
- **Relaciones**: `ClassBidirectional`, `ClassUnidirectional`, `ClassAggregation`, `ClassComposition`, `ClassInheritance`, `ClassRealization`, `ClassDependency`. Una asociación puede referenciar una **clase de asociación** (`associationClassNodeId`).
- **Esquema canónico**: `packages/core/schema/uml-model-4.schema.json`, generado desde los tipos (`pnpm --filter @umlstudio/core gen:schema`) y validado con Ajv.

### 2.3 Contrato de mutación `ModelDiff`

Cualquier cambio que no venga de la edición manual (chat de IA, voz, MCP) se expresa como un `ModelDiff` y se valida antes de aplicarse (`packages/core/lib/ai/types.ts`, `diffEngine.ts`):

```ts
type ModelDiff = {
  add?: { elements?: ...; relationships?: ... }
  modify?: { elements?: ...; relationships?: ... }
  remove?: { elementIds?: string[]; relationshipIds?: string[] }
}
```

El mismo contrato existe en Python (Pydantic, `apps/ai-service/src/models/uml.py`). Así, ninguna fuente externa muta el diagrama sin validación.

## 3. Vista de implementación

### 3.1 Monorepo

`pnpm` workspace (`packages/*`, `apps/*`) con versiones centralizadas en el `catalog` de `pnpm-workspace.yaml`. Las apps Python no tienen `package.json` de runtime y quedan fuera del grafo de dependencias de Node.

| Unidad               | Ruta              | Tecnología                                  | Responsabilidad                                                                                            |
| :------------------- | :---------------- | :------------------------------------------ | :--------------------------------------------------------------------------------------------------------- |
| `@umlstudio/core`    | `packages/core`   | React 19, React Flow 12, Yjs, Zustand       | Canvas, nodos y aristas UML, sincronización Yjs, import/export (XMI, SVG, PNG, JSON), contrato `ModelDiff` |
| `@umlstudio/ui`      | `packages/ui`     | Base UI, Tailwind v4, CVA                   | Componentes y tokens de diseño                                                                             |
| `@umlstudio/webapp`  | `apps/webapp`     | Vite, TanStack Router, React Query, Zustand | SPA: rutas, sesión, paneles de IA, versiones, visión                                                       |
| `@umlstudio/server`  | `apps/server`     | Hono, `ws`, node-redis, `jose`, `bcryptjs`  | REST, autenticación, diagramas, versiones, conversión, productividad, relay WebSocket                      |
| `@umlstudio/codegen` | `apps/codegen`    | Hono, TypeScript                            | Spring Boot (Initializr + capas CRUD), SQL, OpenAPI, Postman                                               |
| `ai-service`         | `apps/ai-service` | FastAPI, Pydantic v2, faster-whisper        | Chat → `ModelDiff`, voz, visión, auditoría                                                                 |
| `mcp-server`         | `apps/mcp-server` | FastMCP                                     | Herramientas MCP sobre el modelo                                                                           |
| `docs`               | `apps/docs`       | Docusaurus                                  | Manual de usuario                                                                                          |

### 3.2 Estructura interna relevante

```text
packages/core/lib/   ai/ (ModelDiff, diffEngine) · components/ · edges/ · nodes/classDiagram/
                     export/ (xmiExport, svgToPng, springBootExport) · store/ · sync/ (ydoc, yjsSync)
apps/server/src/     routes/ (auth, users, diagrams, versions, conversion, codegen, productivity, embed, health)
                     services/ (auth-service, autoVersion, productivity-collector, conversion-service…)
                     http/ (app, middleware) · ws.ts · redis.ts · config.ts · auth/ · workers/
apps/webapp/src/     routes/ · pages/ · components/{agentic,auth,home,modals,navbar,versioning,vision}
                     services/ (aiService, DiagramApiClient, WebSocketManager, versionRepository/)
                     stores/ · queries/ · hooks/ · contexts/ · i18n/
apps/ai-service/src/ main.py · adapters/ (auto, ollama, lmstudio, gemini, openrouter, cloudflare)
                     services/ (pipeline, prompting, diff_quality, transcription) · vision/ · models/
apps/codegen/src/    initializr/ · generator/{entity,repository,service,dto,controller,config}/
                     zip/ · sql/ · openapi/ · templates/fallback/
apps/mcp-server/src/ server.py · tools.py · resources.py · transports.py · store.py
```

### 3.3 Reglas por capa

| Capa              | Regla                                                                                                                                                                                                                    |
| :---------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/server`     | `routes/` solo valida (Zod) y delega; la lógica vive en `services/`; la persistencia, en `redis.ts`. El relay WebSocket exige JWT para salas `shared`                                                                    |
| `apps/webapp`     | Componentes de presentación sin llamadas de red directas; estado síncrono en Zustand (`stores/`), remoto en React Query (`queries/`). La identidad en salas sale de `useAuthStore`; nunca se inventan nombres ni colores |
| `packages/core`   | Agnóstico de la app: no conoce rutas, sesión ni servicios HTTP                                                                                                                                                           |
| `apps/codegen`    | Siempre parte del ZIP oficial de Spring Initializr (respaldo local en `templates/fallback`); genera CRUD en capas `entity`, `repository`, `service`, `dto`, `controller` + `application.yml` (puerto 9000)               |
| `apps/ai-service` | Proveedores detrás de `BaseAIAdapter` (patrón Strategy). Todo diff pasa por `diff_quality.py`. Errores honestos: nunca se inventa una respuesta                                                                          |
| `apps/mcp-server` | Mutaciones solo mediante `ModelDiff`                                                                                                                                                                                     |

## 4. Vista de procesos

### 4.1 Colaboración en tiempo real

El servidor es un **relay**: reenvía los mensajes de una sala al resto de sockets sin interpretar el documento. El estado del diagrama vive en el `Y.Doc` de cada cliente y converge por CRDT.

```mermaid
sequenceDiagram
    actor A as Cliente A
    participant R as Relay WS (apps/server)
    actor B as Cliente B
    A->>R: conectar ?diagramId&mode=shared&token=JWT
    R->>R: verificar JWT (4401 si falla)
    B->>R: conectar (misma sala)
    B->>R: frame 0 (pedir estado)
    R->>A: reenvío
    A->>R: frame 1 (estado completo)
    R->>B: reenvío → B converge
    A->>R: frame 1 (update incremental)
    R->>B: reenvío
    Note over A,B: frames 2/3 = awareness (presencia, selección)
```

- **Protocolo** (`packages/core/lib/sync/yjsSync.ts`): `0` pedir estado, `1` update Yjs, `2` pedir awareness, `3` update de awareness. Viajan en base64 dentro de `{ diagramData }`.
- **Presencia**: el servidor mantiene un `Awareness` por sala solo para presencia y productividad, y lo libera cuando la sala se vacía.
- **Persistencia**: el cliente guarda el diagrama por REST (`PUT /api/diagrams/:id`, control optimista con `If-Match`). El servidor crea versiones automáticas periódicas (`autoVersion`).
- **Eventos del servidor**: `publishControl` difunde eventos de control (versión creada/restaurada, diagrama renombrado/eliminado).
- **Límites**: 1 MiB por mensaje, 100 sockets por sala, heartbeat de 30 s.

### 4.2 IA, voz y visión

El navegador llama directamente a `ai-service` (`VITE_AI_SERVICE_URL`):

1. `POST /api/chat` (o `/api/chat/voice`) con prompt y modelo.
2. El adaptador `auto` elige proveedor según `DEFAULT_PROVIDER` (`auto`/`local`/`cloud`) y la complejidad del prompt.
3. `diff_quality.py` valida; se devuelve `{ provider, diff, message }`.
4. La webapp revalida con `validateDiff` y muestra la propuesta antes de aplicarla.

La IA de sala usa un flujo distinto: el servidor llama a `POST /internal/v1/room/respond` con el tablero y el contexto de la sala. El navegador no llama a este endpoint. `ai-service` exige un `X-Internal-Token` que coincida con `AI_INTERNAL_TOKEN`; si la variable está vacía, rechaza todas las llamadas. En modo `explain` devuelve texto sin `diff`; en modo `change` devuelve un `ModelDiff` validado. Los endpoints públicos del Ciclo 1 permanecen separados.

### 4.3 Generación de código

Navegador → `POST /api/codegen/spring-boot` (server) → `apps/codegen` → `start.spring.io/starter.zip` → enriquecimiento del ZIP en memoria → descarga.

### 4.4 Versionado

`commit_snapshot`, `restore_version` y `list_versions_before` son funciones Lua de la librería `umlstudio`, cargadas al arrancar (`FUNCTION LOAD REPLACE`). Garantizan atomicidad sin transacciones del cliente. Detalle en [`docs/DATABASE.md`](docs/DATABASE.md).

### 4.5 IA de Sala (Room AI), Réplica y Orquestador del Servidor

A diferencia de la IA individual (donde el cliente consulta directo a `ai-service`), la **IA de Sala** (CU-15, CU-16, CU-17) es compartida y opera orquestada desde el servidor para garantizar sincronización honesta, contexto verificado e imparcialidad:

```mermaid
sequenceDiagram
    actor P as Participante
    participant W as Webapp (SPA)
    participant S as Server (Hono)
    participant BR as BoardReplica (Yjs)
    participant R as Redis (Queue & Locks)
    participant AI as ai-service (FastAPI)
    participant DB as Neon (PostgreSQL RLS)

    P->>W: envía pregunta (texto o voz)
    W->>S: POST /api/rooms/:id/ai/messages (JWT)
    S->>R: encolar mensaje + adquirir slot de inferencia
    S-->>W: 202 Accepted { queuePosition, status: "queued" }
    S->>S: difundir status "IA pensando para Juan" por WebSocket

    Note over S,BR: Cuando llega el turno:
    S->>BR: obtener snapshot del modelo actual (getModel)
    S->>DB: recuperar memoria semántica duradera (RLS)
    S->>R: leer conversación pública y sidecar de perfil pedagógico
    S->>AI: POST /internal/v1/room/respond (SSE streaming + X-Internal-Token)
    AI-->>S: stream de deltas (ai.delta)
    S->>W: reenvío de deltas en tiempo real por relay WS

    Note over S,DB: Al finalizar inferencia:
    S->>R: commit atómico de respuesta (RoomChatMessage)
    S->>DB: registrar memoria duradera en PostgreSQL
    S->>W: difusión de message.created (y propuesta si mode=change)
```

- **Réplica del tablero (`BoardReplica`)**: el servidor mantiene una réplica Yjs en memoria por cada sala compartida activa, alimentada por los frames del relay. Se valida su completitud mediante un mecanismo de reto-respuesta (`replica-flush-challenge` / `replica-flush-ack`).
- **Contexto en tres niveles**: (1) conversación pública reciente, (2) snapshot estricto del canvas desde la réplica, y (3) memoria compartida condensada y memoria a largo plazo en PostgreSQL.
- **Ciclo de vida de propuestas (CU-16)**: si la sala permite soluciones (`allowChanges: true`), las respuestas ejecutores incluyen un `ModelDiff` en estado `pending`. Cualquier participante puede reclamar la propuesta (`claim`), revalidándose contra la versión actual del tablero (`baseRev`/`baseGeneration`), pasando por los estados `claimed`, `applied` o `stale`.
- **Moderador proactivo (CU-15 FA-07 / RF-62)**: cuando `proactive: true` en la política de la sala, tras 20 segundos de inactividad sin cambios en el lienzo, el servidor ejecuta una auditoría heurística de principios SOLID (SRP / God Class) sobre la réplica y difunde como máximo una observación cada 2 minutos, dirigida al autor del elemento evaluado.

## 5. Vista de despliegue

### 5.1 Producción

| Nodo                      | Plataforma                               | Contenido                                                                                                   |
| :------------------------ | :--------------------------------------- | :---------------------------------------------------------------------------------------------------------- |
| **Frontend**              | Cloudflare Pages (`umlstudio.pages.dev`) | SPA compilada (Vite, React 19, Tailwind v4)                                                                 |
| **Backend REST & Relay**  | Render (`umlstudio-server`)              | Servidor Hono, relay WebSocket en `/ws`, orquestador de sala, réplicas de tablero y moderador               |
| **Servicio de IA**        | Render (`umlstudio-ai-service`)          | FastAPI, pipeline de IA, transcripción Whisper, validación de diffs y adaptadores intercambiables           |
| **Modelo Principal**      | Google Cloud Run (`umlstudio-llm`)       | Ollama con imagen baked-in `umlstudio-mentor` (Qwen 2.5 7B) en GPU NVIDIA L4 (Tier 1), auth Google OIDC     |
| **Túnel de Contingencia** | Portátil del equipo (conmutación)        | Ollama (`umlstudio-mentor` en NVIDIA RTX 3050), proxy Caddy `:8080` (Bearer auth) y Cloudflare Quick Tunnel |
| **Codegen**               | Render (`umlstudio-codegen`)             | Generador de proyectos Spring Boot 3.x, SQL DDL y OpenAPI                                                   |
| **Redis**                 | Render Key Value (Valkey)                | Cola de inferencia, locks distribuidos, presencia, sesiones JWT y diagramas                                 |
| **Memoria Room AI**       | Neon PostgreSQL (`umlstudio-memory`)     | Proyecto dedicado (`main`/`dev`, rol `memory_app`), RLS por sala y usuario, purge diario de retención       |
| **BBDD Apps Generadas**   | Neon PostgreSQL (instancias de prueba)   | PostgreSQL aislado para validar los proyectos Spring Boot generados por los usuarios                        |

### 5.2 Local

`pnpm dev` levanta los servicios de Node y Redis en Docker (`docker/compose.local.db.yml`). `docker-compose.yml` levanta el stack completo (`docker/compose.local.yml`).

| Servicio          | Puerto                                        |
| :---------------- | :-------------------------------------------- |
| webapp (Vite)     | 5173                                          |
| server REST       | 8000                                          |
| server WebSocket  | 4444 (en producción comparte puerto con REST) |
| ai-service        | 8001                                          |
| codegen           | 8002                                          |
| mcp-server (SSE)  | 8003                                          |
| docs (Docusaurus) | 3001                                          |
| Redis             | 6379                                          |
| PostgreSQL Local  | 5433 (para pruebas de memoria duradera)       |

### 5.3 Notas de Despliegue para el Equipo (Team Deployment Notes)

#### Matriz de Variables de Entorno

| Variable              | Servicio    | Producción                                                         | Contingencia Local                                   |
| :-------------------- | :---------- | :----------------------------------------------------------------- | :--------------------------------------------------- |
| `AI_INTERNAL_TOKEN`   | server / ai | Secreto compartido de alta entropía (mínimo 32 caracteres)         | Secreto compartido local                             |
| `OLLAMA_URL`          | ai-service  | `https://umlstudio-llm-<hash>.a.run.app/v1`                        | `https://<tunnel-id>.trycloudflare.com/v1`           |
| `OLLAMA_AUTH`         | ai-service  | `gcp-id-token`                                                     | `bearer`                                             |
| `GCP_SA_KEY_JSON`     | ai-service  | Service Account JSON con rol `roles/run.invoker`                   | Vacío / no requerido                                 |
| `OLLAMA_API_KEY`      | ai-service  | No requerido (usa token OIDC dinámico)                             | `<token generado para Caddy>`                        |
| `OLLAMA_MODEL`        | ai-service  | `umlstudio-mentor`                                                 | `umlstudio-mentor`                                   |
| `ROOM_MEMORY`         | server      | `postgres`                                                         | `postgres` (o `redis` como fallback)                 |
| `MEMORY_DATABASE_URL` | server      | `postgres://memory_app:...@ep-...neon.tech/neondb?sslmode=require` | `postgres://memory_app:...@localhost:5433/umlstudio` |

#### Procedimiento de Conmutación de Proveedores (Sin Caída)

La conmutación de infraestructura cumple con **RNF-31** y se realiza modificando únicamente variables de entorno en el panel de Render, sin recompilar ni alterar el código:

1. **Escenario Cloud Run (Principal)**:
   - `OLLAMA_URL=https://umlstudio-llm-...run.app/v1`
   - `OLLAMA_AUTH=gcp-id-token`
2. **Escenario Portátil con Túnel (Contingencia)**:
   - Iniciar script en el portátil: `python apps/ai-service/ollama/contingency_tunnel.py`
   - Actualizar en Render: `OLLAMA_URL=https://*.trycloudflare.com/v1`, `OLLAMA_AUTH=bearer`, `OLLAMA_API_KEY=<token>`
3. **Escenario Gemini / Cloud (Fallback Extremo)**:
   - Modificar en Render: `DEFAULT_PROVIDER=gemini` o `ROOM_PROVIDER_ORDER=gemini,ollama`

## 6. Decisiones de arquitectura

| Decisión                                            | Motivo                                                     | Costo aceptado                                       |
| :-------------------------------------------------- | :--------------------------------------------------------- | :--------------------------------------------------- |
| **AD-01** CRDT Yjs en el cliente + relay simple     | Convergencia sin conflictos y servidor liviano             | El servidor no conoce el estado del diagrama en vivo |
| **AD-02** Redis como base operativa primaria        | Baja latencia, TTL nativo, atomicidad con Lua              | Sin consultas relacionales; datos volátiles          |
| **AD-03** Microservicio de IA en Python             | Ecosistema de IA/voz; despliegue y escalado independientes | Un servicio más que operar                           |
| **AD-04** Adaptadores de IA intercambiables         | Cambiar de proveedor (nube o local) por configuración      | Calidad variable entre modelos                       |
| **AD-05** Spring Initializr como base               | Proyectos que compilan con el andamiaje oficial            | Dependencia externa (mitigada con plantilla local)   |
| **AD-06** Contrato `ModelDiff` común                | Una sola validación para IA, voz y MCP                     | Mantener los tipos TS y Pydantic alineados           |
| **AD-07** Autenticación y presencia real (JWT)      | Cero identidades anónimas o inventadas en la sala          | Requiere inicio de sesión obligatorio                |
| **AD-08** Réplica del tablero en el servidor        | Contexto verificado para Room AI sin consultar al cliente  | Consumo de memoria en el servidor Node               |
| **AD-09** Orquestador de inferencia en servidor     | Control de turnos, streaming de deltas y claims atómicos   | Lógica de coordinación compleja en Node.js           |
| **AD-10** Memoria Neon con RLS (`umlstudio-memory`) | Aislamiento estricto por sala/usuario y búsqueda semántica | Configuración de roles y políticas de PostgreSQL     |
| **AD-11** Inferencia en Cloud Run GPU L4            | Despliegue de modelo propio 7B con escalado a cero         | Costo de GPU activa ($0.00032/s) durante la defensa  |
| **AD-12** Túnel de contingencia con Bearer auth     | Respaldo en portátil sin abrir puertos en caso de fallo    | Dependencia de la conexión de subida del portátil    |
