# Guía de contribución — UmlStudio

Cómo trabajamos los dos integrantes del equipo: desde un issue hasta el código en producción. El objetivo es que cualquier cambio sea **trazable** (a un caso de uso y un requisito), **revisado** por el compañero y **verificado** antes de entrar a `main`.

---

## 1. Preparar el entorno

| Requisito | Versión                                           |
| :-------- | :------------------------------------------------ |
| Node.js   | ≥ 22                                              |
| pnpm      | 11.8 (`corepack enable`)                          |
| Docker    | Para Redis local                                  |
| Python    | 3.11+ (solo si tocás `ai-service` o `mcp-server`) |

```bash
pnpm install
cp apps/server/.env.example apps/server/.env          # completar valores
cp apps/webapp/.env.example apps/webapp/.env
cp apps/server/.env.seed.example apps/server/.env.seed  # usuarios de prueba
pnpm dev                                              # webapp :5173, server :8000/:4444, Redis :6379
```

`ai-service` se levanta aparte (`apps/ai-service`, entorno virtual de Python) o con `docker compose up`. Pedile al compañero los valores de las variables: **nunca** se comparten por el repositorio.

## 2. Flujo de trabajo

```text
Issue ──► rama ──► commits ──► Pull Request ──► revisión ──► squash merge a main ──► deploy
```

1. **Todo empieza con un issue.** Sin issue no hay rama.
2. Te asignás el issue y creás la rama desde `main` actualizado.
3. Trabajás con commits pequeños.
4. Abrís un PR que cierra el issue (`Closes #12`).
5. El **otro** integrante revisa. Nadie aprueba su propio PR.
6. Se integra con _squash merge_ y se borra la rama.

### 2.1 Issues

Cada issue debe poder trabajarse de forma independiente. Plantilla:

```markdown
## Contexto

Por qué hace falta (1-3 líneas).

## Trazabilidad

- Ciclo / iteración: Ciclo 2 · Iteración I1
- Caso de uso: CU-XX · Requisitos: RF-XX

## Qué hay que hacer

- [ ] ...

## Criterios de aceptación

- [ ] Comportamiento observable y verificable
- [ ] Prueba automatizada que lo cubre

## Fuera de alcance

Lo que este issue NO hace.
```

**Labels**:

- **Tipo**: `type:feature`, `type:bug`, `type:refactor`, `type:docs`, `type:test`, `type:chore`.
- **Área**: `area:webapp`, `area:server`, `area:core`, `area:ui`, `area:ai-service`, `area:codegen`, `area:mcp`, `area:infra`.
- **Trazabilidad PUDS**: `cu:CU-XX`.
- **Prioridad**: `priority:high`, `priority:medium`, `priority:low`.

**Milestones**: uno por ciclo PUDS (`Ciclo 2`). Si hace falta más detalle, usá también un milestone por iteración.

### 2.2 Ramas

`<tipo>/<número-de-issue>-<tema-corto>` en minúsculas y con guiones:

```text
feat/12-room-chat-panel
fix/18-ws-reconnect-loop
docs/21-update-architecture
refactor/25-extract-auth-service
```

Tipos válidos: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`. Nunca se trabaja directo sobre `main`.

### 2.3 Commits

[Conventional Commits](https://www.conventionalcommits.org/), en **inglés** y en imperativo:

```text
<tipo>(<alcance>): <descripción en minúscula, sin punto final>
```

- **Tipos** (`commitlint.config.mjs`): `feat`, `fix`, `refactor`, `perf`, `style`, `docs`, `test`, `build`, `ci`, `chore`, `revert`. Usá `docs`, no `doc`.
- **Cuerpo**: opcional; explica el _por qué_, con líneas de hasta 100 caracteres.
- **Alcance**: la app o el paquete (`webapp`, `server`, `core`, `ui`, `ai-service`, `codegen`, `mcp`, `infra`, `deploy`).
- **Ejemplos**: `feat(server): add diagram ownership check` · `fix(webapp): keep voice recorder alive on rerender`.
- Un commit = un cambio coherente que compila y pasa los tests (código + test + docs juntos).
- **Sin atribución de IA**: podemos usar agentes de IA, pero el autor del commit siempre es un integrante. Están prohibidos los trailers `Co-authored-by`/`Signed-off-by` que nombren una IA, `Assisted-by`/`Generated-by` y líneas como "Generated with …". Lo verifican el hook local, el CI (`Commits & attribution`) y el workflow `Repo guard`, que además limpia esas líneas en issues, PR y comentarios. Las reglas están en `scripts/ai-attribution.mjs`.

### 2.4 Verificaciones automáticas: hooks locales y CI

| Capa                                | Cuándo corre               | Qué verifica                                                    | ¿Se puede saltar?                   |
| :---------------------------------- | :------------------------- | :-------------------------------------------------------------- | :---------------------------------- |
| **Husky** `pre-commit`              | Al hacer `git commit`      | Prettier sobre los archivos en stage (`lint-staged`)            | Sí (`--no-verify`)                  |
| **Husky** `commit-msg`              | Al hacer `git commit`      | Conventional Commits (`commitlint`) y atribución de IA          | Sí (`--no-verify`)                  |
| **CI** (`.github/workflows/ci.yml`) | En cada PR y push a `main` | Formato, lint, build, todas las suites de tests (Node y Python) | No: es obligatorio para hacer merge |
| **PR conventions**                  | En cada PR                 | Commits y título del PR (`commitlint`) y atribución de IA       | No: es obligatorio para hacer merge |

Husky da feedback en segundos y evita commits rotos. El CI es la barrera real: los hooks son locales y se pueden saltar. Los hooks se instalan solos con `pnpm install`.

| Suite                              | Comando                                                                                          |
| :--------------------------------- | :----------------------------------------------------------------------------------------------- |
| core, server, codegen, webapp, mcp | `pnpm test:core` · `test:server` (requiere Docker) · `test:codegen` · `test:webapp` · `test:mcp` |
| ai-service (TS y Python)           | `pnpm test:ai` · `cd apps/ai-service && python -m unittest discover -s test/unit`                |
| scripts del repo                   | `pnpm test:scripts`                                                                              |

### 2.5 Pull Requests

- **Tamaño**: idealmente menos de 400 líneas cambiadas. Si crece, dividilo en PR encadenados.
- **Título**: igual que un commit convencional (es el mensaje del _squash_).
- **Descripción**: la plantilla (`.github/pull_request_template.md`) se carga sola. Incluye qué cambia, el issue que cierra con su CU/RF, cómo probarlo y el checklist.
- **Para hacer merge** (regla de `main`): aprobación del compañero, checks `CI passed` y `Commits & attribution` en verde, conversaciones resueltas y rama al día con `main`. Solo se permite _squash merge_. El mensaje final se arma con el título y la descripción del PR.

### 2.6 Revisión

El revisor verifica, en este orden:

1. **Correctitud**: ¿cumple los criterios de aceptación del issue? Probalo localmente si toca UI o colaboración.
2. **Arquitectura**: respeta capas (`routes/` → `services/`), contrato `ModelDiff` e identidad real ([`AGENTS.md`](AGENTS.md), reglas duras).
3. **Pruebas**: hay un test que fallaría sin el cambio.
4. **Legibilidad**: nombres, tamaño de funciones y comentarios donde el _por qué_ no es obvio.

Los comentarios distinguen **bloqueante** de **sugerencia**. Quien abrió el PR resuelve o responde cada comentario. Si no hay acuerdo, se discute por llamada y se deja la decisión escrita en el PR.

## 3. Definición de "terminado"

Un issue está terminado cuando:

- [ ] Cumple todos sus criterios de aceptación.
- [ ] Tiene pruebas automatizadas (unitarias y, si cambia un CU, su `INT-CUxx`).
- [ ] El CI está en verde (y lo corriste localmente antes de pedir revisión).
- [ ] La documentación afectada está actualizada (tabla de la sección 4).
- [ ] Fue revisado y aprobado por el compañero e integrado en `main`.
- [ ] Si afecta a producción, se desplegó y se verificó el `/health` del servicio.

## 4. Qué documento actualizar

| Si el cambio…                                             | Actualizá                                       |
| :-------------------------------------------------------- | :---------------------------------------------- |
| Agrega o modifica un caso de uso, flujo o prueba por CU   | `docs/CICLO_<n>.md` del ciclo activo            |
| Agrega o cambia un requisito                              | `docs/REQUIREMENTS.md` (nunca reutilizar un ID) |
| Cambia módulos, flujos entre servicios o despliegue       | `ARCHITECTURE.md`                               |
| Cambia claves Redis, funciones Lua o almacenamiento local | `docs/DATABASE.md`                              |
| Cambia tokens o estilos base                              | `DESIGN.md`                                     |
| Cambia una convención o un comando                        | `docs/CODING_STANDARDS.md`                      |
| Cambia algo que un agente de IA debe saber                | `AGENTS.md` (breve: enlazar, no duplicar)       |
| Cambia lo que ve el usuario final                         | `apps/docs` (manual)                            |

Regla: **un dato vive en un solo documento**; los demás lo enlazan.

## 5. Proceso PUDS en el repositorio

| Concepto PUDS                | En GitHub                                         |
| :--------------------------- | :------------------------------------------------ |
| Ciclo (versión del producto) | Milestone `Ciclo N` y tag `vN.0` al cerrarlo      |
| Iteración                    | Milestone o label `iter:IN` dentro del ciclo      |
| Caso de uso                  | Label `cu:CU-XX` + sección en `docs/CICLO_<n>.md` |
| Requisito                    | ID `RF-XX` / `RNF-XX` citado en el issue y el PR  |
| Artefacto de prueba          | Archivo `cu-xx-*.test.ts` (`INT-CUxx`)            |

Al cerrar un ciclo: todos sus issues cerrados, la tabla de cierre de `docs/CICLO_<n>.md` completa, el tag de versión creado y producción verificada.

## 6. Despliegue

El workflow `Deploy` (`.github/workflows/deploy.yml`) corre **solo** cuando el CI pasa en `main`, o a mano desde la pestaña Actions eligiendo el servicio.

- Despliega únicamente lo que cambió en el commit: `webapp` → Cloudflare Pages; `server`, `ai-service` y `codegen` → Render (_deploy hooks_). Un cambio en `packages/` vuelve a desplegar a sus consumidores.
- Después de disparar el despliegue en Render, espera a que `/health` responda (el plan gratuito tarda 30–60 s en despertar).
- Los secretos viven en el _environment_ `production` de GitHub, nunca en el repositorio.

## 7. Seguridad

- **Solo colaboradores** pueden abrir issues y PR. El workflow `Repo guard` cierra los de cualquier otra cuenta. Los PR desde forks no reciben secretos.
- Nunca se commitean `.env*`, `.env.seed`, tokens ni contraseñas; el _secret scanning_ con _push protection_ de GitHub bloquea los que se escapen. Si se filtra uno, se rota de inmediato.
- Las credenciales se comparten entre los integrantes por un canal privado, nunca por el repositorio ni por issues.
- `pnpm` únicamente; las dependencias nuevas se justifican en el PR y se revisan con `pnpm audit`.
- Las versiones compartidas van en el `catalog` de `pnpm-workspace.yaml`.
