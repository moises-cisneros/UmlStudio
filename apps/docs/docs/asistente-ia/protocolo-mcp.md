# Integración Mediante Protocolo MCP (Model Context Protocol)

Para flujos avanzados de desarrollo agéntico, UmlStudio incluye un servidor **FastMCP** (Model Context Protocol) que permite a herramientas externas de IA (como Claude Desktop, Cursor o IDEs compatibles) inspeccionar y modificar diagramas programáticamente.

---

## Capacidades Expuestas por el Servidor MCP

El microservicio MCP de UmlStudio expone herramientas estandarizadas:

1. `get_diagram_model`: Recupera la estructura semántica completa de clases, interfaces y relaciones del diagrama activo en formato JSON.
2. `validate_uml_semantics`: Verifica reglas formales OMG UML 2.5 (detecta ciclos de herencia prohibidos, clases huérfanas, inconsistencias de visibilidad).
3. `apply_model_diff`: Permite a un agente externo enviar un lote de mutaciones estructuradas para agregar o editar nodos de forma transaccional.
4. `generate_spring_boot_preview`: Obtiene la representación de entidades JPA correspondientes al estado del diagrama.

---

## Conexión al Servidor MCP

El servidor se ejecuta en el puerto `8003` mediante transporte SSE (Server-Sent Events) o STDIO:

```json
{
  "mcpServers": {
    "umlstudio": {
      "url": "http://localhost:8003/sse",
      "transport": "sse"
    }
  }
}
```

Cualquier modificación enviada por un agente a través de MCP converge sobre el motor `@umlstudio/core` respetando los bloqueos y la sincronización con los usuarios en el navegador.
