# Especificación de Requisitos del Sistema — UmlStudio

## Requisitos Funcionales (RF) y No Funcionales (RNF) bajo PUDS

> **Metodología**: PUDS · **Estándar UML**: OMG UML 2.5 · **Versión**: 1.0 (Ciclo 1)

---

## 1. Introducción

Requisitos funcionales (RF) y no funcionales (RNF) de UmlStudio, organizados por módulo. Cada RF tiene un identificador estable y se traza a un caso de uso de [`CICLO_1.md`](CICLO_1.md). Los huecos de numeración (por ejemplo, RF-30) son intencionales: los identificadores no se reutilizan.

---

## 2. Módulos y Requisitos Funcionales

### MOD-01: Motor de Modelado UML (`packages/core`)

| ID         | Requisito                                                                                                                                                                                                                                                                                                                                                                                                          | Prioridad | Caso de Uso |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ----------- |
| **RF-01**  | El sistema debe permitir crear, editar y eliminar clases, clases abstractas, interfaces, enumeraciones y paquetes con 3 compartimentos (cabecera, atributos, métodos).                                                                                                                                                                                                                                             | Alta      | CU-01       |
| **RF-02**  | El sistema debe permitir establecer relaciones OMG UML 2.5: Asociación bidireccional (línea continua), Asociación unidireccional (línea continua con flecha abierta), Agregación (diamante blanco), Composición (diamante negro), Herencia (flecha triangular cerrada), Dependencia (línea a rayas con flecha abierta) y Realización (línea a rayas con flecha triangular cerrada) con enrutamiento ortogonal A\*. | Alta      | CU-01       |
| **RF-02b** | El sistema debe permitir modelar la **Clase de Asociación (Association Class / Clase Intermedia)** para relaciones muchos a muchos (N:M), vinculando la clase intermedia mediante una **línea a rayas / discontinua (`dashed line`)** perpendicular conectada al centro ortogonal de la arista de asociación.                                                                                                      | Alta      | CU-01       |
| **RF-03**  | El sistema debe validar el modelo contra el esquema JSON `uml-model-4.schema.json` y persistirlo: en el navegador para diagramas locales y en el servidor (Redis) para diagramas compartidos.                                                                                                                                                                                                                      | Alta      | CU-01       |
| **RF-04**  | El sistema debe soportar drag & drop de nodos con snapping magnético a los 4 puntos cardinales (N, S, E, O).                                                                                                                                                                                                                                                                                                       | Alta      | CU-01       |
| **RF-05**  | El sistema debe permitir exportar el diagrama a formato SVG vectorial y PNG rasterizado con múltiples escalas (1x, 2x, 4x).                                                                                                                                                                                                                                                                                        | Alta      | CU-01       |
| **RF-05b** | El sistema debe permitir gestionar diagramas de clases: editar el título/nombre del diagrama, eliminarlo de forma permanente con confirmación previa y compartirlo mediante enlace de sala o invitación a otros colaboradores.                                                                                                                                                                                     | Alta      | CU-13       |

---

### MOD-02: Colaboración en Tiempo Real (`apps/server` + `packages/core`)

| ID        | Requisito                                                                                                                                                        | Prioridad | Caso de Uso |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------- |
| **RF-06** | El sistema debe sincronizar el estado del diagrama entre N clientes simultáneos mediante Yjs CRDT y protocolo WebSocket binario.                                 | Alta      | CU-02       |
| **RF-07** | El sistema debe indicar qué elemento está editando cada colaborador (indicador visual con el nombre y color del usuario), propagado mediante _awareness_ de Yjs. | Alta      | CU-02       |
| **RF-08** | El sistema debe mostrar la presencia de los colaboradores con el nombre, avatar y color de su perfil.                                                            | Media     | CU-02       |
| **RF-09** | El sistema debe permitir gestionar salas de modelado colaborativo (crear sala, generar enlace compartible, unirse a sala existente).                             | Alta      | CU-02       |
| **RF-10** | El sistema debe persistir el diagrama compartido en Redis, con versiones automáticas periódicas y manuales mediante funciones atómicas Lua.                      | Alta      | CU-02       |

---

### MOD-03: Asistente de IA — Texto y Voz (`apps/ai-service` + `apps/webapp`)

| ID        | Requisito                                                                                                                                                                                                                                                                                                                                     | Prioridad | Caso de Uso |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------- |
| **RF-11** | El sistema debe implementar una arquitectura **Multi-Adapter** resiliente (Cloudflare Workers AI, OpenRouter, Gemini, LM Studio, Ollama) con modos `auto`/`local`/`cloud` y ordenamiento por complejidad de prompt y una **Compuerta de Calidad de Diff** (`diff_quality.py`) que valida sintaxis y consistencia UML antes de emitir cambios. | Alta      | CU-03       |
| **RF-12** | El sistema debe capturar audio del micrófono del usuario (`MediaRecorder` en WebM/Opus, M4A o WAV) y transcribirlo mediante **Whisper local in-container** (`faster-whisper` int8 en CPU), con normalización de términos UML ("1 a muchos" → "1..\*") y rechazo honesto por baja confianza (<0.2) o fallo de motor (503).                     | Alta      | CU-03       |
| **RF-13** | El sistema debe mostrar un preview/diff visual honesto antes de aplicar cambios: propaga causas reales de error del servicio de IA (timeouts a 120s en voz y 90s en visión, códigos 400, 502, 503) sin sustitución por mocks silenciosos en modo online.                                                                                      | Alta      | CU-03       |
| **RF-14** | El sistema debe generar sugerencias de patrones de diseño GoF (Strategy, Observer, Factory, etc.) basadas en el contexto del diagrama actual.                                                                                                                                                                                                 | Media     | CU-03       |
| **RF-15** | El sistema debe auditar el diagrama contra principios SOLID y advertir violaciones (clases con demasiadas responsabilidades, dependencias circulares, etc.).                                                                                                                                                                                  | Media     | CU-03       |

---

### MOD-04: Procesamiento de Diagramas por Imagen — Visión/OCR y Renderizado (`apps/ai-service` + `apps/webapp`)

| ID         | Requisito                                                                                                                                                                                                                                                                                       | Prioridad | Caso de Uso |
| :--------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------- | :---------- |
| **RF-16**  | El sistema debe permitir importar imágenes rasterizadas (JPG, PNG, WebP) de diagramas de clases UML capturados o escaneados.                                                                                                                                                                    | Alta      | CU-04       |
| **RF-17**  | El sistema debe procesar la imagen mediante **Visión Multimodal** (Gemini Flash, OpenRouter, Cloudflare) con validación estructural OMG UML 2.5 (`validation.py`), saneando nombres, compartimentos y relaciones de herencia/agregación tanto en capturas digitales como en fotografías reales. | Alta      | CU-04       |
| **RF-18**  | El sistema debe proveer un modal interactivo (`VisionImportDialog`) con previsualización detallada de clases y miembros detectados antes de realizar la inserción y fusión no destructiva en el canvas.                                                                                         | Alta      | CU-04       |
| **RF-18b** | El sistema debe permitir exportar y descargar el diagrama de clases en formato de imagen PNG de alta resolución (1x, 2x, 4x) con opción de fondo transparente.                                                                                                                                  | Alta      | CU-04       |

---

### MOD-05: Interoperabilidad XMI (`packages/core`)

| ID        | Requisito                                                                                                                                 | Prioridad | Caso de Uso |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------- |
| **RF-19** | El sistema debe exportar el modelo `UMLModel` a formato XMI 2.1/2.5 compatible con Enterprise Architect.                                  | Alta      | CU-05       |
| **RF-20** | El sistema debe importar un archivo XMI y reconstruir el diagrama de clases en el canvas con layout automático (fuerza dirigida o dagre). | Alta      | CU-05       |
| **RF-21** | El sistema debe preservar estereotipos, visibilidades, multiplicidades, roles y tipos de relaciones en el round-trip XMI ↔ UMLModel.      | Alta      | CU-05       |

---

### MOD-06: Generación de Código Spring Boot (`apps/codegen`)

| ID         | Requisito                                                                                                                                                                                                             | Prioridad | Caso de Uso |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------- |
| **RF-22**  | El sistema debe consumir la API oficial de **Spring Initializr** (`start.spring.io/starter.zip`) para obtener el scaffold Maven base oficial (Java 17, Spring Boot 3.x, dependencias JPA, Web, PostgreSQL, Lombok).   | Alta      | CU-06       |
| **RF-22b** | El sistema debe inyectar en el buffer `.zip` oficial los archivos Java generados organizados estrictamente en 5 capas: Entity, Repository, Service, DTO y Controller.                                                 | Alta      | CU-06       |
| **RF-23**  | El sistema debe generar DTOs de request y response con validaciones Bean Validation (`@NotNull`, `@NotBlank`, `@Positive`).                                                                                           | Alta      | CU-06       |
| **RF-24**  | El sistema debe generar interfaces Repository extendiendo `JpaRepository<Entity, Long>` con métodos CRUD generados automáticamente sin requerir consultas complejas manuales.                                         | Alta      | CU-06       |
| **RF-25**  | El sistema debe generar clases Service con lógica de negocio CRUD estándar (crear, leer por ID, listar, actualizar, eliminar).                                                                                        | Alta      | CU-06       |
| **RF-26**  | El sistema debe generar controladores REST (`@RestController`) con endpoints CRUD estandarizados (`@GetMapping`, `@PostMapping`, `@PutMapping`, `@DeleteMapping`).                                                    | Alta      | CU-06       |
| **RF-27**  | El sistema debe generar el archivo `application.yml` parametrizado con conexión a PostgreSQL y puerto de ejecución del servidor por defecto en **`9000`** (evitando el ocupado `8080`).                               | Alta      | CU-06       |
| **RF-28**  | El sistema debe mapear relaciones UML a anotaciones JPA: Herencia→`@Inheritance(strategy)`, Composición→`@OneToMany(cascade=ALL, orphanRemoval=true)`, Asociación→`@ManyToOne`/`@OneToMany`, Agregación→`@OneToMany`. | Alta      | CU-06       |

---

### MOD-07: Generación de Documentación API (`apps/codegen`)

| ID        | Requisito                                                                                                                                                 | Prioridad | Caso de Uso |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------- |
| **RF-29** | El sistema debe generar una especificación OpenAPI 3.0 (Swagger) a partir del backend Spring Boot generado, con schemas, paths y respuestas documentadas. | Media     | CU-07       |
| **RF-31** | El sistema debe permitir exportar la documentación como colección Postman (JSON) o Insomnia compatible.                                                   | Baja      | CU-07       |

---

### MOD-08: Versionado, Snapshots y Gestión de Historial (`apps/server` + `apps/webapp`)

| ID        | Requisito                                                                                                                                                                                                                                                                       | Prioridad | Caso de Uso |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :-------- | :---------- |
| **RF-32** | El sistema debe permitir crear versiones manuales con autor, nombre y descripción: mediante la función Lua `commit_snapshot` en Redis (diagramas compartidos) o en IndexedDB (diagramas locales).                                                                               | Alta      | CU-08       |
| **RF-33** | El sistema debe generar versiones automáticas periódicas (cada 30 minutos por defecto) y agruparlas cronológicamente en la interfaz (`AutoGroupRow.tsx`).                                                                                                                       | Media     | CU-08       |
| **RF-34** | El sistema debe desplegar una línea de tiempo cronológica inversa de versiones con miniaturas SVG (`VersionThumbnail`), timestamps relativos (`relativeTime`), autor y conteo de nodos en el Drawer de versiones (`VersionDrawer.tsx`).                                         | Alta      | CU-08       |
| **RF-35** | El sistema debe permitir la previsualización no destructiva de versiones históricas en modo sólo lectura (`read-only`) con banner superior de alerta (`VersionPreviewBanner.tsx`), sin mutar el estado activo.                                                                  | Alta      | CU-08       |
| **RF-36** | El sistema debe ejecutar la restauración atómica de versiones pasadas mediante la función Lua `restore_version` en Redis e IndexedDB con modal de confirmación (`ConfirmRestoreModal.tsx`) y notificación de deshacer con temporizador de 10 segundos (`UndoRestoreToast.tsx`). | Alta      | CU-08       |

---

### MOD-09: Integración Agéntica con Protocolo MCP (`apps/mcp-server` con FastMCP Python)

| ID        | Requisito                                                                                                                                                                                                                                             | Prioridad | Caso de Uso |
| :-------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------- | :---------- |
| **RF-37** | El sistema debe exponer un servidor MCP (Model Context Protocol) implementado en **Python con FastMCP** que permita a agentes de IA externos inspeccionar y mutar el diagrama.                                                                        | Media     | CU-09       |
| **RF-38** | El servidor MCP debe soportar herramientas atómicas (`read_diagram`, `list_elements`, `add_class`, `add_relationship`, `modify_element`, `delete_element`, `get_metrics`) y la herramienta en lote `apply_model_diff`, sobre el contrato `ModelDiff`. | Media     | CU-09       |
| **RF-39** | El servidor MCP debe ser compatible con clientes estándar (Claude Desktop, Cursor) vía transporte local `stdio` y transporte web `SSE`.                                                                                                               | Media     | CU-09       |

---

### MOD-10: Análisis de Productividad, Cuellos de Botella y Gestión del Tiempo (`apps/server` + `apps/webapp`, sin microservicio extra)

| ID        | Requisito                                                                                                                                                                                                | Prioridad | Caso de Uso |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------- | :---------- |
| **RF-40** | El sistema debe registrar cronométricamente el tiempo de modelado activo, tiempos de pausa e inactividad por cada diagrama y por colaborador en la sesión mediante la telemetría del relay WebSocket.    | Media     | CU-10       |
| **RF-41** | El sistema debe detectar cuellos de botella en la colaboración en tiempo real, identificando nodos con bloqueos prolongados y zonas del diagrama con alta tasa de colisiones de edición simultánea.      | Media     | CU-10       |
| **RF-42** | El sistema debe calcular indicadores cuantitativos de productividad (frecuencia de clases y métodos agregados por hora, cadencia de refactorizaciones y velocidad de diseño).                            | Media     | CU-10       |
| **RF-43** | El sistema debe proveer un panel interactivo de analíticas de productividad con semáforos de fluidez, exportación de reportes y diagnóstico heurístico opcional por IA (`POST /api/audit/productivity`). | Baja      | CU-10       |

---

### MOD-11: Seguridad, Autenticación y Cuentas de Usuario (`apps/server` + `apps/webapp`)

| ID        | Requisito                                                                                                                                                                                                                              | Prioridad | Caso de Uso  |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------- | :----------- |
| **RF-44** | El sistema debe autenticar usuarios mediante correo electrónico y contraseña con hash bcrypt (costo 12) en `/api/auth/login`.                                                                                                          | Alta      | CU-11        |
| **RF-45** | El sistema debe emitir tokens de sesión JWT: Access Token de 15 min en memoria y Refresh Token rotativo de 7 días en cookie `HttpOnly`.                                                                                                | Alta      | CU-11        |
| **RF-46** | El sistema debe permitir el cierre de sesión seguro (`/api/auth/logout`) con revocación inmediata del Refresh Token e invalidación de sesión en el cliente.                                                                            | Media     | CU-11        |
| **RF-47** | El sistema debe autenticar las conexiones WebSocket de salas compartidas verificando el JWT al conectar (rechazo con código `4401`).                                                                                                   | Alta      | CU-11, CU-02 |
| **RF-48** | El sistema debe permitir el registro de nuevas cuentas de usuario (`/api/auth/register`) con validación de unicidad de correo, formato estricto y políticas de contraseña robusta, invocando la autenticación automática al finalizar. | Alta      | CU-12        |
| **RF-49** | El sistema debe permitir la administración del perfil de usuario (nombre para mostrar, avatar visual, color del cursor de colaboración remota y tema de interfaz).                                                                     | Media     | CU-14        |
| **RF-50** | El sistema debe permitir el cambio seguro de contraseña desde el perfil de usuario mediante la verificación de la contraseña actual y confirmación de la nueva contraseña.                                                             | Alta      | CU-14        |

---

## 3. Requisitos No Funcionales

### Rendimiento

| ID         | Requisito                                                                       | Módulo | Métrica                       |
| :--------- | :------------------------------------------------------------------------------ | :----- | :---------------------------- |
| **RNF-01** | Renderizado del canvas a 60 FPS constantes con ≤100 nodos visibles.             | MOD-01 | FPS medido en Chrome DevTools |
| **RNF-02** | Cálculo de rutas ortogonales A\* en ≤50ms para grafos de ≤50 aristas.           | MOD-01 | Performance.now()             |
| **RNF-07** | Tiempo de respuesta del LLM ≤5 segundos para prompts de modelado típicos.       | MOD-03 | Latencia end-to-end           |
| **RNF-13** | Importación de archivo XMI con ≤20 clases en ≤3 segundos.                       | MOD-05 | Performance.now()             |
| **RNF-17** | Tiempo de respuesta en operaciones de snapshot y restauración ≤300ms.           | MOD-08 | Performance.now()             |
| **RNF-22** | Latencia frontend→backend ≤100ms con el servicio activo (sin arranque en frío). | MOD-11 | ping/curl                     |

### Conformidad y Estándares

| ID         | Requisito                                                                                       | Módulo |
| :--------- | :---------------------------------------------------------------------------------------------- | :----- |
| **RNF-03** | Conformidad 100% con OMG UML 2.5 en marcadores de visibilidad y terminaciones de aristas.       | MOD-01 |
| **RNF-12** | Archivo XMI generado debe ser parseable por Enterprise Architect 16+.                           | MOD-05 |
| **RNF-14** | Código Java generado debe compilar con `mvn compile` sin errores en Spring Boot 3.x + Java 17+. | MOD-06 |
| **RNF-15** | Proyecto generado listo para ejecutar con `./mvnw spring-boot:run` sin configuración adicional. | MOD-06 |
| **RNF-16** | La especificación OpenAPI generada debe ser válida según el validador estándar de Swagger.      | MOD-07 |
| **RNF-18** | El servidor MCP debe seguir la especificación oficial MCP (stdio o SSE transport).              | MOD-09 |

### Fiabilidad y Disponibilidad

| ID         | Requisito                                                                                        | Módulo |
| :--------- | :----------------------------------------------------------------------------------------------- | :----- |
| **RNF-04** | Latencia de propagación de cambios CRDT ≤200ms en LAN.                                           | MOD-02 |
| **RNF-05** | Convergencia eventual CRDT garantizada ante partición de red transitoria.                        | MOD-02 |
| **RNF-06** | Recuperación automática de conexión WebSocket con backoff exponencial (1s, 2s, 4s, 8s, max 30s). | MOD-02 |
| **RNF-21** | Uptime ≥99.5% en el entorno de producción.                                                       | MOD-11 |

### Precisión de IA

| ID         | Requisito                                                                                                               | Módulo |
| :--------- | :---------------------------------------------------------------------------------------------------------------------- | :----- |
| **RNF-08** | Transcripción de voz con precisión ≥90% en español (Whisper local en el servicio).                                      | MOD-03 |
| **RNF-09** | El servicio de IA se ejecuta como microservicio desplegado; los proveedores locales (Ollama, LM Studio) son opcionales. | MOD-03 |
| **RNF-10** | Soportar imágenes en formato JPEG, PNG y WebP con resolución mínima de 640x480.                                         | MOD-04 |
| **RNF-11** | Precisión de extracción de diagramas ≥80% en imágenes con ≤15 clases en tipografía legible.                             | MOD-04 |

### Portabilidad y Rendimiento Analítico

| ID         | Requisito                                                                                                                                                                    | Módulo |
| :--------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----- |
| **RNF-19** | El cálculo de métricas de productividad y cuellos de botella debe ejecutarse en segundo plano (Web Worker / background task) sin degradar los 60 FPS del canvas de modelado. | MOD-10 |
| **RNF-20** | Módulo de analíticas y panel de gestión de tiempos compatible con navegadores modernos (Chromium, Firefox, Safari) y diseño responsivo.                                      | MOD-10 |

### Estándares de Calidad de Código y Pruebas (PUDS + ISO 25010)

| ID         | Requisito                                                                                                                                                                                                              | Módulo | Métrica / Verificación                     |
| :--------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----- | :----------------------------------------- |
| **RNF-23** | **Testing Automatizado con Vitest**: Toda funcionalidad debe contar con pruebas unitarias y debe existir una matriz de pruebas de integración con al menos 1 prueba automatizada por cada Caso de Uso (CU-01 a CU-14). | Todos  | 100% pass rate en Vitest (`pnpm test:all`) |
| **RNF-24** | **Calidad y Estilo de Código con ESLint**: El código debe mantener indentación estricta de 2 espacios, tipado TypeScript riguroso sin `any` arbitrarios, y cero errores o advertencias.                                | Todos  | `pnpm lint` (0 errors, 0 warnings)         |
| **RNF-25** | **Seguridad de Dependencias y Bloqueo npm**: Uso exclusivo de `pnpm` y catálogo centralizado; prohibición absoluta de `npm` y `package-lock.json`. 0 vulnerabilidades críticas o altas.                                | Todos  | `pnpm audit`                               |

### Despliegue, Infraestructura y Operación

| ID         | Requisito                                                                                                                                                                                 | Módulo    | Métrica / Verificación     |
| :--------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------- | :------------------------- |
| **RNF-26** | **Despliegue Edge del Frontend**: La SPA webapp se despliega en Cloudflare Pages (CDN global y TLS).                                                                                      | MOD-Infra | `umlstudio.pages.dev`      |
| **RNF-27** | **Aislamiento de Microservicios**: `apps/server`, `apps/codegen` y `apps/ai-service` se ejecutan como contenedores Docker independientes (Render en producción, Docker Compose en local). | MOD-Infra | `/health` de cada servicio |
| **RNF-28** | **Persistencia durable**: Redis con persistencia en disco (AOF en local, Render Key Value en producción); PostgreSQL (Neon) disponible para los proyectos generados.                      | MOD-Infra | Configuración de servicios |
| **RNF-29** | **Cifrado en Tránsito SSL/TLS**: Todos los puntos de entrada (HTTP y WebSocket) deben operar obligatoriamente bajo certificados SSL/TLS válidos (HTTPS / WSS).                            | MOD-Infra | Certificados SSL grado A   |

---

## 4. Trazabilidad

Cada RF tiene trazabilidad directa a:

- Un **Caso de Uso** y una **iteración del ciclo** documentados en [`CICLO_1.md`](CICLO_1.md) (CU-01 a CU-14)
- Un **Módulo arquitectónico** documentado en [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
- Un **Estándar de calidad** mapeado en [`QUALITY_STANDARDS.md`](QUALITY_STANDARDS.md)
