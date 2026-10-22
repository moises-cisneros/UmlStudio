# Generación de Backend Spring Boot 3.x y SQL

UmlStudio traduce directamente el diseño visual de clases en un proyecto backend ejecutable en **Java 21** con **Spring Boot 3.x**, estructurado en capas desacopladas y con persistencia lista para **PostgreSQL 16**.

---

## Arquitectura en 5 Capas Desacopladas

El código generado sigue estrictamente las mejores prácticas de arquitectura limpia:

1. **Capa de Entidades (`entity`)**:
   - Clases anotadas con `@Entity`, `@Table`, `@Id`, `@GeneratedValue`.
   - Relaciones JPA mapeadas según el diagrama: `@OneToMany`, `@ManyToOne`, `@ManyToMany` con `@JoinTable` y `@OneToOne`.
   - Clases de asociación mapeadas mediante `@EmbeddedId` y `@MapsId`.
2. **Capa de Repositorios (`repository`)**:
   - Interfaces que extienden `JpaRepository<T, ID>` con métodos de consulta derivados.
3. **Capa de Transferencia de Datos (`dto`)**:
   - Records inmutables de Java (`RequestDTO` y `ResponseDTO`) para separar el contrato de API del modelo de base de datos.
4. **Capa de Servicios (`service` e `impl`)**:
   - Interfaces de servicio y clases de implementación con transaccionalidad `@Transactional`.
5. **Capa de Controladores REST (`controller`)**:
   - Endpoints RESTful con anotaciones Spring (`@RestController`, `@RequestMapping`, `@GetMapping`, `@PostMapping`, `@PutMapping`, `@DeleteMapping`).

---

## Configuración y Descarga

Al hacer clic en **Generar Código > Spring Boot**:

- Puedes personalizar el **Group ID** (ejemplo: `com.miempresa.sistema`), **Artifact ID**, **Versión de Java** y **Nombre del Proyecto**.
- El proyecto se configura por defecto para escuchar en el puerto **9000** con un archivo `application.yml` preconfigurado y un script de migración SQL (`schema.sql`).
- Se descarga un archivo `.zip` completo listo para abrir en IntelliJ IDEA, Eclipse o VS Code y ejecutar con `./mvnw spring-boot:run`.
