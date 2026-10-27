# Persistencia y Bases de Datos — UmlStudio

> Qué se guarda, dónde y cómo. Fuente de verdad: `apps/server/src/redis.ts`, `apps/webapp/src/services/versionRepository/idb.ts` y `apps/codegen/src/sql/`.

## 1. Visión general

| Ámbito                     | Motor                                | Paradigma         | Uso                                                                                        |
| :------------------------- | :----------------------------------- | :---------------- | :----------------------------------------------------------------------------------------- |
| Sistema (servidor)         | **Redis 7** (Valkey en Render)       | NoSQL clave-valor | Usuarios, sesiones de refresco, diagramas compartidos, versiones                           |
| Sistema (navegador)        | **IndexedDB** (`umlstudio-versions`) | NoSQL documental  | Versiones de diagramas locales                                                             |
| Sistema (navegador)        | `localStorage`                       | Clave-valor       | Diagramas locales y preferencias de la webapp                                              |
| Aplicaciones **generadas** | **PostgreSQL 16+**                   | SQL relacional    | Base del backend Spring Boot que produce CU-06. UmlStudio no la usa en tiempo de ejecución |

El estado colaborativo en vivo **no** se guarda en una base: vive en el `Y.Doc` de cada cliente (CRDT) y se persiste por REST como un snapshot del diagrama.

## 2. Redis

### 2.1 Claves

Las llaves con `{id}` usan _hash tags_ para que todas las claves de un diagrama caigan en el mismo slot (requisito de las funciones Lua).

| Clave                              | Contenido                                                                                                                            |
| :--------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| `diagram:{id}`                     | Cuerpo actual del diagrama (HEAD), JSON comprimido gzip + base64                                                                     |
| `diagram:{id}:meta`                | Metadatos del diagrama, incluida la revisión `headRev` (control optimista con `If-Match`)                                            |
| `diagram:{id}:versions`            | Índice ordenado de versiones                                                                                                         |
| `diagram:{id}:version:<vid>`       | Cuerpo de una versión (gzip + base64)                                                                                                |
| `diagram:{id}:version:<vid>:meta`  | Nombre, descripción, tipo (`user`/`auto`), autor, fecha                                                                              |
| `diagram:{id}:auto-version-marker` | Control de las versiones automáticas                                                                                                 |
| `diagram:{id}:ai:chat`             | Chat de la sala con la IA: LIST de mensajes JSON (el más antiguo primero), recortada a 200 con `LTRIM`, con el TTL del diagrama      |
| `diagram:{id}:ai:authorship`       | Autoría del tablero: HASH `elementId -> userId` (último autor de cada elemento, solo usuarios autenticados), con el TTL del diagrama |
| `auth:user:{id}`                   | Hash del usuario (email, hash de contraseña, nombre, avatar, color)                                                                  |
| `auth:user:email:<email>`          | Índice email → id                                                                                                                    |
| `auth:user:{userId}:diagrams`      | Diagramas del usuario                                                                                                                |
| `auth:refresh:<jti>`               | Sesión de refresco (TTL 7 días, se consume al rotar)                                                                                 |

No se requiere el módulo RedisJSON: todo se guarda con `SET`/`GET` y hashes.

### 2.2 Funciones Lua (librería `umlstudio`)

Se cargan al arrancar el servidor con `FUNCTION LOAD REPLACE`. Si el proveedor no lo permite, el servidor lo registra como advertencia.

| Función                | Qué hace de forma atómica                                                                                   |
| :--------------------- | :---------------------------------------------------------------------------------------------------------- |
| `commit_snapshot`      | Guarda una versión, la indexa y aplica el límite de versiones (descarta primero las automáticas sin nombre) |
| `restore_version`      | Reemplaza el HEAD con una versión y genera antes una versión automática del estado previo                   |
| `list_versions_before` | Lista paginada de versiones anteriores a una marca de tiempo                                                |

### 2.3 Límites (`apps/server/src/config.ts`)

| Parámetro                       | Valor por defecto   |
| :------------------------------ | :------------------ |
| Versiones por diagrama          | 50                  |
| Tamaño máximo de snapshot       | 5 MiB               |
| TTL de diagramas                | 120 días            |
| TTL de versiones                | 121 días            |
| Intervalo de versión automática | 30 min              |
| Nombre / descripción de versión | 80 / 240 caracteres |

## 3. IndexedDB (navegador)

Base `umlstudio-versions` (versión 1, librería `idb`), usada por los diagramas locales (`/local/:id`) para su historial:

| Object store    | Clave           | Contenido                          |
| :-------------- | :-------------- | :--------------------------------- |
| `versions`      | `id`            | Metadatos de cada versión          |
| `versionBodies` | `id` de versión | Cuerpo del diagrama en esa versión |
| `diagramMeta`   | `diagramId`     | Metadatos por diagrama             |

## 4. Mapeo UML → PostgreSQL (código generado)

`apps/codegen` traduce el diagrama a entidades JPA y scripts SQL:

| Elemento UML     | SQL                              | JPA                                               |
| :--------------- | :------------------------------- | :------------------------------------------------ |
| Clase            | Tabla                            | `@Entity` + `@Table`                              |
| Identificador    | `id BIGSERIAL PRIMARY KEY`       | `@Id @GeneratedValue`                             |
| Atributo         | Columna tipada                   | `@Column`                                         |
| Asociación 1..\* | FK en la tabla del lado "muchos" | `@ManyToOne` / `@OneToMany(mappedBy)`             |
| Asociación N:M   | Tabla intermedia                 | `@ManyToMany` + `@JoinTable`                      |
| Composición      | FK con borrado en cascada        | `@OneToMany(cascade = ALL, orphanRemoval = true)` |
| Agregación       | FK sin cascada                   | `@OneToMany`                                      |
| Herencia         | Tabla base + derivadas           | `@Inheritance`                                    |

Ejemplo: `Cliente "1" -- "0..*" Pedido` genera `pedidos.cliente_id BIGINT REFERENCES clientes(id)`.

Convenciones SQL generadas: tablas en plural y `snake_case`, FK `<entidad>_id`. Configuración del proyecto generado: PostgreSQL en el puerto **5433** por defecto (editable) y servidor en el **9000**.

## 5. Entornos

| Entorno    | Redis                                                                                  | PostgreSQL                                   |
| :--------- | :------------------------------------------------------------------------------------- | :------------------------------------------- |
| Local      | `redis/redis-stack-server:7.4.0` en Docker, AOF activo (`docker/compose.local.db.yml`) | Lo provee quien ejecute el proyecto generado |
| Producción | Render Key Value (Valkey), solo red interna                                            | Neon, para probar los proyectos generados    |
