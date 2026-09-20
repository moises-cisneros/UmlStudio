# UmlStudio FastMCP Server

Servidor MCP (**Model Context Protocol**) implementado en Python para UmlStudio, permitiendo a agentes externos (Claude Desktop, Cursor, Antigravity IDE) inspeccionar y mutar diagramas de clases UML 2.5 en tiempo real.

## Configuración para Claude Desktop / Cursor

Agrega la siguiente configuración en tu archivo `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "umlstudio": {
      "command": "python",
      "args": ["-m", "apps.mcp_server.src.server"],
      "cwd": "/path/to/UmlStudio"
    }
  }
}
```

## Herramientas Expuestas (OMG UML 2.5)

| Herramienta        | Tipo       | Descripción                                                                         |
| :----------------- | :--------- | :---------------------------------------------------------------------------------- |
| `read_diagram`     | Inspección | Devuelve el grafo completo del modelo en JSON conforme a `uml-model-4.schema.json`. |
| `list_elements`    | Inspección | Lista las clases, interfaces y relaciones del diagrama.                             |
| `get_metrics`      | Inspección | Calcula métricas orientadas a objetos (Ca, Ce, Clases, Métodos).                    |
| `add_class`        | Mutación   | Crea una nueva clase con nombre, estereotipo, atributos y métodos.                  |
| `add_relationship` | Mutación   | Conecta dos clases mediante relaciones OMG UML 2.5 válidas.                         |
| `modify_element`   | Mutación   | Modifica atributos, métodos o nombre de un elemento existente.                      |
| `delete_element`   | Mutación   | Elimina un elemento y remueve en cascada sus relaciones huérfanas.                  |
| `apply_model_diff` | Batch      | Aplica una mutación transaccional por lotes (`add`, `modify`, `remove`).            |

## Recursos URI

- `umlstudio://diagram/current`: Diagrama de clases activo.
- `umlstudio://schema`: Esquema canónico JSON Schema del metamodelo UML 2.5.
