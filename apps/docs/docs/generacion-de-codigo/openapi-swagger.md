# Especificación OpenAPI 3.0 y Swagger UI

Para facilitar el diseño orientado a APIs (API-First Design) y la integración con equipos frontend o clientes externos, UmlStudio genera especificaciones estandarizadas **OpenAPI 3.0**.

---

## Qué Contiene la Especificación Generada

A partir de las clases y relaciones de tu diagrama, el motor infiere automáticamente:

- **Paths RESTful Estándar**: Endpoints CRUD para cada entidad del dominio (`/api/v1/clientes`, `/api/v1/pedidos/{id}`, etc.).
- **Schemas de Componentes (`components/schemas`)**: Definición JSON Schema detallada de los modelos de entrada y salida, incluyendo tipos de datos, propiedades requeridas y relaciones anidadas.
- **Respuestas HTTP Tipadas**: Códigos `200 OK`, `201 Created`, `400 Bad Request`, `404 Not Found` y `500 Internal Error`.
- **Parámetros de Paginación y Filtrado**.

---

## Formatos de Exportación y Swagger UI

1. Haz clic en el menú **Generar Código > OpenAPI 3.0**.
2. Puedes visualizar la documentación interactiva en **Swagger UI embebido** para probar las definiciones de endpoints en vivo.
3. Opciones de descarga:
   - **Archivo YAML (`openapi.yaml`)**
   - **Archivo JSON (`openapi.json`)**
   - Copiar al portapapeles con un solo clic para importar en Postman, Insomnia o herramientas de mock server.
