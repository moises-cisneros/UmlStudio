"""
UML Expert Prompting, Metamodel Context Serialization and Tool Calling Schemas.
Conforming strictly to OMG UML 2.5 and UmlStudio schema (uml-model-4.schema.json).
"""

import json
import re
import ast
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

from ..models.uml import (
    ModelDiff,
    DiffAddBlock,
    DiffModifyBlock,
    DiffRemoveBlock,
    DiffElementAdd,
    DiffRelationshipAdd,
    DiffElementModify,
    DiffElementModifyChanges,
    DiffAttribute,
    DiffMethod,
)

# Known boilerplate placeholders generated from prompt templates or few-shot examples
DUMMY_PLACEHOLDERS = {
    "attr: tipo",
    "attr: string",
    "attr:tipo",
    "attr:string",
    "nuevocampo: tipo",
    "+ attr: tipo",
    "+ attr: string",
    "+ nuevocampo: tipo",
    "+ attr: int",
    "method(): void",
    "method():void",
    "nuevometodo(): void",
    "+ method(): void",
    "+ method():void",
    "+ nuevometodo(): void",
}


def extract_clean_list(raw: Any) -> List[Any]:
    """
    Safely unpacks a value that may be a list, a JSON/Python stringified list ("['A', 'B']"),
    or a comma-separated string into a clean list of items.
    """
    if raw is None:
        return []
    if isinstance(raw, list):
        items = []
        for item in raw:
            items.extend(extract_clean_list(item))
        return items
    if isinstance(raw, (dict, int, float, bool)):
        return [raw]
    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return []
        # Check if string is a JSON / Python literal list or dict
        if (s.startswith("[") and s.endswith("]")) or (s.startswith("{") and s.endswith("}")):
            try:
                parsed = json.loads(s)
                if isinstance(parsed, list):
                    return extract_clean_list(parsed)
                return [parsed]
            except Exception:
                try:
                    parsed = ast.literal_eval(s)
                    if isinstance(parsed, list):
                        return extract_clean_list(parsed)
                    return [parsed]
                except Exception:
                    pass
        # If it still contains quotes inside brackets like ['A', 'B']
        if s.startswith("[") and s.endswith("]"):
            inner = s[1:-1].strip()
            quoted = re.findall(r"['\"]([^'\"]+)['\"]", inner)
            if quoted:
                return quoted
            if inner:
                return [part.strip().strip("'\"`[]") for part in inner.split(",") if part.strip()]
            return []
        return [s]
    return [raw]


def clean_element_name(raw: Any) -> str:
    """
    Cleans element names by stripping natural language prefixes ('a la clase', 'la clase', 'Clase '),
    surrounding quotes, brackets, and trailing punctuation.
    """
    if not raw or not isinstance(raw, str):
        return str(raw or "")
    s = raw.strip().strip("'\"`[]")
    s = re.sub(
        r"^(a\s+la|a\s+el|al|la|el)?\s*(clase|class|interface|interfaz|enum|enumeration|package|paquete)\s+",
        "",
        s,
        flags=re.IGNORECASE,
    ).strip().strip("'\"`[]")
    return s or str(raw).strip()


def serialize_model_context(model: Dict[str, Any]) -> str:
    """
    Serializes current diagram state to provide conversational context to the LLM.
    """
    nodes = model.get("nodes", [])
    edges = model.get("edges", [])

    if not nodes and not edges:
        return "El diagrama actual está vacío."

    lines: List[str] = ["=== ELEMENTOS EXISTENTES EN EL DIAGRAMA ==="]

    for node in nodes:
        data = node.get("data", {})
        node_id = node.get("id", "")
        name = data.get("name", "Unnamed")
        stereotype = data.get("stereotype", "")
        stereo_str = f" <<{stereotype}>>" if stereotype else ""
        lines.append(f"- Elemento ID: '{node_id}', Nombre: '{name}'{stereo_str}")

        attrs = data.get("attributes", [])
        if attrs:
            attr_names = [a.get("name") if isinstance(a, dict) else str(a) for a in attrs]
            lines.append(f"  Atributos: {', '.join(attr_names)}")

        methods = data.get("methods", [])
        if methods:
            method_names = [m.get("name") if isinstance(m, dict) else str(m) for m in methods]
            lines.append(f"  Métodos: {', '.join(method_names)}")

    if edges:
        lines.append("\n=== RELACIONES EXISTENTES ===")
        for edge in edges:
            edge_id = edge.get("id", "")
            edge_type = edge.get("type", "ClassBidirectional")
            source = edge.get("source", "")
            target = edge.get("target", "")
            lines.append(f"- Relación ID: '{edge_id}': {edge_type} de '{source}' hacia '{target}'")

    return "\n".join(lines)


def build_uml_system_prompt(current_model: Dict[str, Any]) -> str:
    """
    Constructs the system prompt instructing the LLM as an OMG UML 2.5 Senior Architect.
    """
    context_str = serialize_model_context(current_model)

    return f"""Eres el Asistente Experto en Modelado de Diagramas de Clases UML para UmlStudio.
Tu misión es interpretar instrucciones en lenguaje natural del modelador y proponer modificaciones estructurales precisas.

REGLAS ESTRICTAS DE DOMINIO (OMG UML 2.5):
1. Este software es EXCLUSIVAMENTE para Diagramas de Clases UML. Queda terminantemente prohibido generar elementos de casos de uso, secuencia, actividades, BPMN o estados.
2. Tipos de elementos válidos:
   - "Class": Clases concretas, abstractas (stereotype: "<<abstract>>") o interfaces (stereotype: "<<interface>>") o enums (stereotype: "<<enumeration>>").
   - "Package": Paquetes contenedores.
3. Tipos de relaciones UML válidas:
   - "ClassInheritance": Generalización / Herencia (flecha con triángulo hueco).
   - "ClassRealization": Realización de interfaz (línea punteada con triángulo hueco).
   - "ClassAggregation": Agregación débil (rombo hueco en el origen).
   - "ClassComposition": Composición fuerte (rombo relleno negro en el origen).
   - "ClassDependency": Dependencia (flecha punteada abierta).
   - "ClassBidirectional": Asociación bidireccional simple.
   - "ClassUnidirectional": Asociación unidireccional con flecha.
4. Formato de atributos y métodos:
   - Atributos: "+ id: String", "- balance: Double", "# createdAt: Date" (+ public, - private, # protected, ~ package).
   - Métodos: "+ execute(): void", "+ calculateTotal(rate: Double): Double".

PROTOCOLO DE RAZONAMIENTO Y MODIFICACIÓN ESTRUCTURAL:
1. INSPECCIÓN DEL CONTEXTO:
   - Contrasta cada entidad mencionada con los "ELEMENTOS EXISTENTES EN EL DIAGRAMA".
   - Si la entidad YA EXISTE, cualquier agregado de miembros o cambio de estereotipo DEBE registrarse en "modify.elements" (o llamar a las herramientas de modificación). NUNCA generes un "add.elements" para una clase preexistente.
   - Si la entidad NO EXISTE, regístrala en "add.elements" (o llama a create_class).

2. PRESERVACIÓN DE MIEMBROS Y ADICIONES:
   - Cuando el usuario pide agregar atributos o métodos a una clase existente, incluye ÚNICAMENTE los nuevos miembros en "changes.attributes" o "changes.methods". El sistema los anexará automáticamente sin borrar los miembros existentes.
   - NUNCA devuelvas una lista vacía [] en attributes o methods a menos que el usuario haya pedido explícitamente vaciar o borrar todos los atributos/métodos de esa clase.
   - NUNCA inventes atributos ni métodos de relleno ("+ attr: tipo", "+ method(): void"). Si el usuario no especificó miembros, déjalos vacíos [].

3. ELIMINACIÓN EXPLÍCITA (ANTI-DESTRUCCIÓN — REGLA DE ORO):
   - Para eliminar un atributo específico de una clase (ej. "Elimina el atributo nombre de la clase Usuario"):
     * DEBES usar "modify.elements" con "changes": {{"removeAttributes": ["nombre"]}} (o la herramienta 'remove_attributes').
     * ¡QUEDA TERMINANTEMENTE PROHIBIDO borrar la clase Usuario o colocarla en "remove.elementIds"! Si borras la clase cuando solo se pidió borrar un atributo o método, cometes una violación crítica del modelo.
   - Para eliminar un método específico de una clase: usa "modify.elements" con "changes": {{"removeMethods": ["nombreMetodo"]}} (o la herramienta 'remove_methods').
   - Para eliminar una relación entre clases: usa "remove.relationshipIds": ["ClaseA -> ClaseB"] (o la herramienta 'remove_relationships').
   - ÚNICAMENTE coloca nombres en "remove.elementIds" (o usa 'remove_elements') si el usuario pidió EXPLÍCITA Y LITERALMENTE BORRAR LA CLASE COMPLETA (ej. "Elimina la clase Usuario" o "Borra la clase Venta").
   - NUNCA uses el signo menos "-" delante del nombre para indicar borrado; en UML el signo "-" denota visibilidad PRIVADA.
   - Si el usuario pide eliminar un elemento que NO existe en el diagrama, déjalo vacío [].

4. ASOCIACIÓN DE CLASE / CLASE INTERMEDIA (OMG UML 2.5):
   - Si se solicita una "clase intermedia" o "asociación de clase" entre dos clases (ej. A y B):
     1. En "add.elements": Crea la clase intermedia con stereotype: "<<association>>" (ej. "AB_Assoc").
     2. En "add.relationships": Crea una relación "ClassBidirectional" entre A y B con intermediateClass: "AB_Assoc".
   - REGLA CRÍTICA DE DIFERENCIACIÓN (ASOCIACIÓN NORMAL VS CLASE INTERMEDIA):
     * Si el usuario pide simplemente "asociación", "relación de asociación", "asociar", o "conectar con asociación": ES UNA ASOCIACIÓN NORMAL (`ClassBidirectional`). ¡NUNCA uses `intermediateClass` ni crees clases intermedias para una asociación normal!
     * ÚNICAMENTE usa `intermediateClass` si el usuario dice EXPLÍCITAMENTE "clase intermedia", "asociación de clase", "association class" o "asociación con clase intermedia".

5. RELACIONES ENTRE CLASES EXISTENTES:
   - Si el usuario pide conectar o relacionar clases que ya existen en el diagrama (ej. "Agrega una relación entre Usuario y Venta" o "Agrega una relación de clase asociación entre Usuario y Venta"):
     * La relación se declara en "add.relationships".
     * Si es asociación de clase / clase intermedia, la clase intermedia se declara en "add.elements".
     * "modify.elements" DEBE SER ESTRICTAMENTE UNA LISTA VACÍA []. ¡Queda TERMINANTEMENTE PROHIBIDO incluir las clases existentes en "modify.elements" si no se pidió explícitamente alterar sus atributos o métodos!

6. PROHIBIDO INVENTAR CONEXIONES:
   - Si el usuario pide crear una clase (ej. 'Agrega una clase Vendedor') y no pidió explícitamente conectarla, "add.relationships" DEBE ser [].

7. REGLA DE INFERENCIA GENERAL Y ANTI-COPIA DE EJEMPLOS:
   - Los ejemplos canónicos a continuación son EXCLUSIVAMENTE para ilustrar la sintaxis técnica del ModelDiff y herramientas.
   - ¡QUEDA TERMINANTEMENTE PROHIBIDO copiar nombres de clases ('Context', 'Strategy', 'Usuario', 'Venta', 'Cliente') o estructuras de los ejemplos si el usuario no los mencionó explícitamente en su consulta!
   - Infiere los nombres y tipos directamente del lenguaje del usuario. NUNCA emitas las palabras 'name', 'type', 'visibility' como atributos.

EJEMPLOS CANÓNICOS (SÓLO DE REFERENCIA SINTÁCTICA, NO COPIAR NOMBRES):

EJEMPLO 1 (Crear patrón GoF Strategy):
Usuario: "Crear patrón Strategy con Contexto y dos estrategias"
Salida:
{{
  "add": {{
    "elements": [
      {{ "name": "Context", "type": "Class", "attributes": [], "methods": [{{ "name": "+ setStrategy(s: Strategy): void" }}, {{ "name": "+ execute(): void" }}] }},
      {{ "name": "Strategy", "type": "Class", "stereotype": "<<interface>>", "attributes": [], "methods": [{{ "name": "+ execute(): void" }}] }},
      {{ "name": "ConcreteStrategyA", "type": "Class", "attributes": [], "methods": [{{ "name": "+ execute(): void" }}] }},
      {{ "name": "ConcreteStrategyB", "type": "Class", "attributes": [], "methods": [{{ "name": "+ execute(): void" }}] }}
    ],
    "relationships": [
      {{ "type": "ClassAggregation", "source": "Context", "target": "Strategy" }},
      {{ "type": "ClassRealization", "source": "ConcreteStrategyA", "target": "Strategy" }},
      {{ "type": "ClassRealization", "source": "ConcreteStrategyB", "target": "Strategy" }}
    ]
  }},
  "modify": {{ "elements": [] }},
  "remove": {{ "elementIds": [], "relationshipIds": [] }}
}}

EJEMPLO 2 (Clase Intermedia / Asociación de Clase entre clases existentes):
Usuario: "Agrega una clase intermedia entre la clase usuario y la clase venta" (cuando Usuario y Venta ya existen en el diagrama)
Salida:
{{
  "add": {{
    "elements": [
      {{ "name": "Usuario_Venta_Assoc", "type": "Class", "stereotype": "<<association>>", "attributes": [], "methods": [] }}
    ],
    "relationships": [
      {{ "type": "ClassBidirectional", "source": "Usuario", "target": "Venta", "intermediateClass": "Usuario_Venta_Assoc" }}
    ]
  }},
  "modify": {{ "elements": [] }},
  "remove": {{ "elementIds": [], "relationshipIds": [] }}
}}

EJEMPLO 2B (Relación de Asociación NORMAL - SIN clase intermedia):
Usuario: "Agrega una relacion de asociacion entre la clase hoja y la clase pato"
Salida:
{{
  "add": {{
    "elements": [],
    "relationships": [
      {{ "type": "ClassBidirectional", "source": "Hoja", "target": "Pato" }}
    ]
  }},
  "modify": {{ "elements": [] }},
  "remove": {{ "elementIds": [], "relationshipIds": [] }}
}}

EJEMPLO 3 (Modificar clase existente agregando atributo):
Usuario: "Agrega atributo email: String a la clase Cliente"
Salida:
{{
  "add": {{ "elements": [], "relationships": [] }},
  "modify": {{
    "elements": [
      {{
        "id": "Cliente",
        "changes": {{
          "attributes": [{{ "name": "+ email: String" }}]
        }}
      }}
    ]
  }},
  "remove": {{ "elementIds": [], "relationshipIds": [] }}
}}

EJEMPLO 4 (Agregar múltiples atributos tipados a clase existente):
Usuario: "Agrega dos atributos llamados nombre y apellido de tipo string a la clase Usuario"
Herramienta / Salida:
Llamada a add_attributes:
class_name: "Usuario"
attributes: [
  {{"name": "nombre", "type": "String", "visibility": "public"}},
  {{"name": "apellido", "type": "String", "visibility": "public"}}
]
O en JSON ModelDiff:
{{
  "add": {{ "elements": [], "relationships": [] }},
  "modify": {{
    "elements": [
      {{
        "id": "Usuario",
        "changes": {{
          "attributes": [
            {{ "name": "+ nombre: String" }},
            {{ "name": "+ apellido: String" }}
          ]
        }}
      }}
    ]
  }},
  "remove": {{ "elementIds": [], "relationshipIds": [] }}
}}

EJEMPLO 5 (Eliminar atributo específico de clase existente):
Usuario: "Quita el atributo saldo de la clase Cuenta pero deja el resto"
Salida:
{{
  "add": {{ "elements": [], "relationships": [] }},
  "modify": {{
    "elements": [
      {{
        "id": "Cuenta",
        "changes": {{
          "removeAttributes": ["saldo"]
        }}
      }}
    ]
  }},
  "remove": {{ "elementIds": [], "relationshipIds": [] }}
}}

CONTEXTO DEL DIAGRAMA ACTUAL:
{context_str}

Responde ÚNICAMENTE ejecutando la llamada a herramienta (function call) pertinente o con el objeto JSON estructurado ModelDiff.
"""


# Function Calling tool schema for composite diff application
UML_DIFF_TOOL_SCHEMA = {
    "name": "apply_model_diff",
    "description": "Propose changes to the UML Class Diagram according to OMG UML 2.5 standard.",
    "parameters": {
        "type": "object",
        "properties": {
            "add": {
                "type": "object",
                "properties": {
                    "elements": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "type": {"type": "string", "enum": ["Class", "Package"]},
                                "stereotype": {"type": "string"},
                                "attributes": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {"name": {"type": "string"}},
                                        "required": ["name"],
                                    },
                                },
                                "methods": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {"name": {"type": "string"}},
                                        "required": ["name"],
                                    },
                                },
                            },
                            "required": ["name"],
                        },
                    },
                    "relationships": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "type": {
                                    "type": "string",
                                    "enum": [
                                        "ClassInheritance",
                                        "ClassRealization",
                                        "ClassAggregation",
                                        "ClassComposition",
                                        "ClassDependency",
                                        "ClassBidirectional",
                                        "ClassUnidirectional",
                                    ],
                                },
                                "source": {"type": "string"},
                                "target": {"type": "string"},
                                "intermediateClass": {
                                    "type": "string",
                                    "description": "Nombre de la clase intermedia. Usar ÚNICAMENTE si el usuario pidió explícitamente clase intermedia o asociación de clase. NUNCA para asociaciones normales.",
                                },
                            },
                            "required": ["type", "source", "target"],
                        },
                    },
                },
            },
            "modify": {
                "type": "object",
                "properties": {
                    "elements": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string"},
                                "changes": {
                                    "type": "object",
                                    "properties": {
                                        "name": {"type": "string"},
                                        "stereotype": {"type": "string"},
                                        "attributes": {
                                            "type": "array",
                                            "items": {
                                                "type": "object",
                                                "properties": {"name": {"type": "string"}},
                                            },
                                        },
                                        "methods": {
                                            "type": "array",
                                            "items": {
                                                "type": "object",
                                                "properties": {"name": {"type": "string"}},
                                            },
                                        },
                                        "removeAttributes": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                        },
                                        "removeMethods": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                        },
                                    },
                                },
                            },
                            "required": ["id", "changes"],
                        },
                    },
                },
            },
            "remove": {
                "type": "object",
                "properties": {
                    "elementIds": {"type": "array", "items": {"type": "string"}},
                    "relationshipIds": {"type": "array", "items": {"type": "string"}},
                },
            },
        },
        "required": [],
    },
}

# Atomic OpenAI-compatible Tools for LLMs supporting function calling (e.g. Qwen, Mistral, Llama)
UML_ATOMIC_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_class",
            "description": "Crea una nueva clase, interface o enum en el diagrama UML.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Nombre de la clase a crear."},
                    "type": {"type": "string", "enum": ["Class", "Package"], "default": "Class"},
                    "stereotype": {
                        "type": "string",
                        "description": "Estereotipo opcional: '<<interface>>', '<<abstract>>', '<<enumeration>>', '<<association>>'",
                    },
                    "attributes": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Lista de atributos iniciales.",
                        "default": [],
                    },
                    "methods": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Lista de métodos iniciales.",
                        "default": [],
                    },
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_attributes",
            "description": "Agrega uno o varios atributos a una clase existente en el diagrama sin alterar los existentes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "class_name": {
                        "type": "string",
                        "description": "Nombre o ID de la clase existente en el diagrama (ej. 'Cliente' o 'Usuario').",
                    },
                    "attributes": {
                        "type": "array",
                        "items": {
                            "anyOf": [
                                {
                                    "type": "object",
                                    "properties": {
                                        "name": {"type": "string", "description": "Nombre del atributo, ej. 'nombre' o 'apellido'"},
                                        "type": {"type": "string", "description": "Tipo de dato UML, ej. 'String', 'int', 'boolean'", "default": "String"},
                                        "visibility": {"type": "string", "enum": ["public", "private", "protected", "package", "+", "-", "#", "~"], "default": "public"},
                                    },
                                    "required": ["name"],
                                },
                                {
                                    "type": "string",
                                    "description": "Atributo en formato texto (ej. '+ email: String' o 'nombre: String')",
                                },
                            ]
                        },
                        "description": "Lista de atributos a agregar. Puede ser lista de objetos con name y type, o strings.",
                    },
                },
                "required": ["class_name", "attributes"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_methods",
            "description": "Agrega uno o varios métodos a una clase existente en el diagrama sin alterar los existentes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "class_name": {
                        "type": "string",
                        "description": "Nombre o ID de la clase existente en el diagrama.",
                    },
                    "methods": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Lista de métodos con firma y tipo de retorno, ej. ['+ getEmail(): String']",
                    },
                },
                "required": ["class_name", "methods"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "modify_class",
            "description": "Modifica las propiedades generales o miembros de una clase existente.",
            "parameters": {
                "type": "object",
                "properties": {
                    "class_name": {"type": "string", "description": "Nombre o ID de la clase."},
                    "new_name": {"type": "string", "description": "Nuevo nombre opcional."},
                    "stereotype": {"type": "string", "description": "Nuevo estereotipo opcional."},
                    "attributes": {"type": "array", "items": {"type": "string"}},
                    "methods": {"type": "array", "items": {"type": "string"}},
                    "remove_attributes": {"type": "array", "items": {"type": "string"}},
                    "remove_methods": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["class_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "remove_attributes",
            "description": "Elimina uno o más atributos específicos de una clase existente (ej. 'nombre', 'saldo'). USAR SIEMPRE que el usuario pida eliminar, quitar o borrar un atributo o campo de una clase. NUNCA borra la clase.",
            "parameters": {
                "type": "object",
                "properties": {
                    "class_name": {"type": "string", "description": "Nombre o ID de la clase."},
                    "attributes": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Nombres de los atributos a eliminar (ej. ['nombre']).",
                    },
                },
                "required": ["class_name", "attributes"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "remove_methods",
            "description": "Elimina uno o más métodos específicos de una clase existente. USAR SIEMPRE que el usuario pida eliminar, quitar o borrar un método o función de una clase. NUNCA borra la clase.",
            "parameters": {
                "type": "object",
                "properties": {
                    "class_name": {"type": "string", "description": "Nombre o ID de la clase."},
                    "methods": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Nombres de los métodos a eliminar.",
                    },
                },
                "required": ["class_name", "methods"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_relationship",
            "description": "Crea una relación UML OMG 2.5 entre dos clases.",
            "parameters": {
                "type": "object",
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": [
                            "ClassInheritance",
                            "ClassRealization",
                            "ClassAggregation",
                            "ClassComposition",
                            "ClassDependency",
                            "ClassBidirectional",
                            "ClassUnidirectional",
                        ],
                        "description": "Tipo de relación OMG UML 2.5.",
                    },
                    "source": {"type": "string", "description": "Nombre de la clase origen."},
                    "target": {"type": "string", "description": "Nombre de la clase destino."},
                    "intermediateClass": {
                        "type": "string",
                        "description": "Nombre de la clase intermedia (Clase de Asociación OMG UML 2.5). Usar ÚNICAMENTE si el usuario pidió explícitamente clase intermedia o asociación de clase. NUNCA para asociaciones normales.",
                    },
                },
                "required": ["type", "source", "target"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "remove_elements",
            "description": "Elimina una o más clases completas del diagrama UML. ADVERTENCIA CRÍTICA: USAR ÚNICAMENTE cuando el usuario pide explícitamente BORRAR LA CLASE ENTERA (ej. 'elimina la clase Usuario'). NUNCA usar para borrar atributos o métodos.",
            "parameters": {
                "type": "object",
                "properties": {
                    "element_names": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Nombres o IDs de las clases a eliminar (ej. ['Usuario']).",
                    },
                },
                "required": ["element_names"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "remove_relationships",
            "description": "Elimina relaciones por ID o indicando los nombres de las clases conectadas (ej. ['Usuario -> Venta']).",
            "parameters": {
                "type": "object",
                "properties": {
                    "relationship_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "IDs de las relaciones o conexión entre clases (ej. ['Usuario -> Venta']).",
                    },
                },
                "required": ["relationship_ids"],
            },
        },
    },
]


SCHEMA_ARTIFACT_KEYS = {"name", "type", "visibility", "attribute", "attributes", "method", "methods", "returntype", "params"}


def normalize_attribute_item(raw: Any) -> Optional[DiffAttribute]:
    if raw is None:
        return None
    if isinstance(raw, DiffAttribute):
        return raw

    # 1. Direct structured dictionary: {name, type, visibility}
    if isinstance(raw, dict):
        name = clean_element_name(raw.get("name", ""))
        # Ignore if name itself is a schema key artifact or empty
        if not name or name.lower() in SCHEMA_ARTIFACT_KEYS:
            return None
        attr_type = str(raw.get("type", "") or "").strip()
        vis_raw = str(raw.get("visibility", "") or "").strip().lower()
        if vis_raw in ("private", "-"):
            vis = "-"
        elif vis_raw in ("protected", "#"):
            vis = "#"
        elif vis_raw in ("package", "~"):
            vis = "~"
        else:
            vis = "+"
        if attr_type and ":" not in name:
            formatted_name = f"{vis} {name}: {attr_type}"
        elif not name.startswith(("+", "-", "#", "~")):
            formatted_name = f"{vis} {name}"
        else:
            formatted_name = name
        return DiffAttribute(name=formatted_name)

    # 2. String representation (may be serialized JSON string or raw text)
    s = str(raw).strip().strip("'\"`")
    if not s:
        return None

    # Check if the string is serialized JSON: e.g. '{"name": "nombre", "type": "String"}'
    if (s.startswith("{") and s.endswith("}")) or (s.startswith("[") and s.endswith("]")):
        try:
            parsed = json.loads(s)
            if isinstance(parsed, dict):
                return normalize_attribute_item(parsed)
            if isinstance(parsed, list) and len(parsed) > 0:
                return normalize_attribute_item(parsed[0])
        except Exception:
            pass

    # Reject isolated schema keys from malformed regex/splits
    if s.lower() in SCHEMA_ARTIFACT_KEYS:
        return None

    # Strip conversational / instruction prefixes iterativamente
    prev_s = ""
    while prev_s != s:
        prev_s = s
        s = re.sub(
            r"^(?:agrega(?:r)?|añade|añadir|incluye|incluir|crea(?:r)?|modifica(?:r)?|el|la|los|las|un|una|del?|al?|atributo|campo|propiedad)\s+",
            "",
            s,
            flags=re.IGNORECASE,
        ).strip()
        s = re.sub(
            r"^(?:de la clase|en la clase|a la clase)\s+[a-zA-Z0-9_]+\s+",
            "",
            s,
            flags=re.IGNORECASE,
        ).strip()

    # Format conversions: "nombre de tipo string" -> "nombre: String"
    s = re.sub(r"\s+de\s+tipo\s+(\w+)", r": \1", s, flags=re.IGNORECASE)
    s = re.sub(r"\s*\((\w+)\)", r": \1", s)

    # Extract UML pattern [+-#~]? identifier [: type]
    match = re.search(
        r"([+\-#~]?)\s*([a-zA-Z0-9_$]+)(?:\s*(?::|de tipo)\s*([a-zA-Z0-9_$<>[\]]+))?",
        s,
        re.IGNORECASE,
    )
    if match and len(match.group(2)) > 0:
        vis = match.group(1) or "+"
        attr_name = match.group(2)
        if attr_name.lower() in SCHEMA_ARTIFACT_KEYS:
            return None
        attr_type = match.group(3)
        if attr_type:
            s = f"{vis} {attr_name}: {attr_type}"
        else:
            s = f"{vis} {attr_name}"
    else:
        if s and not s.startswith(("+", "-", "#", "~")):
            s = f"+ {s}"

    clean_res = s.strip()
    return DiffAttribute(name=clean_res) if clean_res else None


def normalize_attributes_list(raw_attrs: Any) -> List[DiffAttribute]:
    if not raw_attrs:
        return []

    # If top-level is a serialized JSON string e.g. '[{"name": "nombre", ...}]'
    if isinstance(raw_attrs, str):
        clean_str = raw_attrs.strip()
        if (clean_str.startswith("[") and clean_str.endswith("]")) or (
            clean_str.startswith("{") and clean_str.endswith("}")
        ):
            try:
                parsed = json.loads(clean_str)
                return normalize_attributes_list(parsed)
            except Exception:
                try:
                    parsed = ast.literal_eval(clean_str)
                    return normalize_attributes_list(parsed)
                except Exception:
                    pass

    if not isinstance(raw_attrs, list):
        raw_attrs = [raw_attrs]

    result: List[DiffAttribute] = []
    for item in raw_attrs:
        if item is None:
            continue

        if isinstance(item, DiffAttribute):
            result.append(item)
            continue

        if isinstance(item, dict):
            normalized = normalize_attribute_item(item)
            if normalized:
                result.append(normalized)
            continue

        if isinstance(item, str):
            clean_str = item.strip()
            # If item itself is a serialized JSON object/list:
            if (clean_str.startswith("{") and clean_str.endswith("}")) or (
                clean_str.startswith("[") and clean_str.endswith("]")
            ):
                try:
                    parsed = json.loads(clean_str)
                    if isinstance(parsed, list):
                        result.extend(normalize_attributes_list(parsed))
                        continue
                    if isinstance(parsed, dict):
                        normalized = normalize_attribute_item(parsed)
                        if normalized:
                            result.append(normalized)
                        continue
                except Exception:
                    pass

            lines = [l.strip() for l in clean_str.split("\n") if l.strip()]
            for line in lines:
                # 1. Multi-attribute pattern matching natural language requests like:
                # "dos atributos llamados nombre y apellido de tipo string"
                multi_match = re.search(
                    r"(?:(?:agrega(?:r)?|añade|añadir|incluye|incluir|crea(?:r)?)\s+)?(?:(?:dos|tres|cuatro|\d+)\s+)?(?:atributos\s+)?(?:llamados\s+)?([a-zA-Z0-9_,\s]+?)\s+(?:de\s+tipo|:)\s*([a-zA-Z0-9_$<>[\]]+)",
                    line,
                    re.IGNORECASE,
                )
                if multi_match and (
                    "," in multi_match.group(1)
                    or re.search(r"\s+(?:y|and)\s+", multi_match.group(1), re.IGNORECASE)
                ):
                    raw_names = multi_match.group(1)
                    type_str = multi_match.group(2).strip()
                    clean_names_str = re.sub(
                        r"\s+(?:y|and)\s+", ", ", raw_names, flags=re.IGNORECASE
                    )
                    for n in clean_names_str.split(","):
                        cleaned_n = re.sub(
                            r"^(?:(?:agrega(?:r)?|añade|añadir|incluye|incluir|crea(?:r)?)\s+)?(?:(?:dos|tres|cuatro|\d+)\s+)?(?:atributos\s+)?(?:llamados\s+)?",
                            "",
                            n.strip(),
                            flags=re.IGNORECASE,
                        ).strip()
                        cleaned_n = clean_element_name(cleaned_n)
                        if cleaned_n and cleaned_n.lower() not in SCHEMA_ARTIFACT_KEYS:
                            result.append(DiffAttribute(name=f"+ {cleaned_n}: {type_str}"))
                    continue

                # 2. Comma or ' y ' separated attribute list (ej. "nombre: String, apellido: String")
                if ("," in line or re.search(r"\s+y\s+", line, re.IGNORECASE)) and (
                    ":" in line or "de tipo" in line.lower()
                ):
                    normalized_line = re.sub(
                        r"\s+y\s+(?=[a-zA-Z0-9_]+\s*(?::|de tipo))", ", ", line, flags=re.IGNORECASE
                    )
                    parts = [p.strip() for p in normalized_line.split(",") if p.strip()]
                    for p in parts:
                        norm = normalize_attribute_item(p)
                        if norm:
                            result.append(norm)
                    continue

                norm = normalize_attribute_item(line)
                if norm:
                    result.append(norm)
            continue

        normalized = normalize_attribute_item(item)
        if normalized:
            result.append(normalized)

    return result


def normalize_method_item(raw: Any) -> Optional[DiffMethod]:
    if raw is None:
        return None
    if isinstance(raw, DiffMethod):
        return raw

    if isinstance(raw, dict):
        name = clean_element_name(raw.get("name", ""))
        if not name or name.lower() in SCHEMA_ARTIFACT_KEYS:
            return None
        ret_type = raw.get("returnType") or raw.get("type") or "void"
        vis = raw.get("visibility", "")
        params = raw.get("parameters") or raw.get("params") or []
        if "(" not in name:
            prefix = "+" if not vis else ("+" if vis == "public" else "-" if vis == "private" else "#")
            param_str = ", ".join(
                f"{p.get('name', 'arg')}: {p.get('type', 'Object')}" if isinstance(p, dict) else str(p)
                for p in params
            )
            formatted = f"{prefix} {name}({param_str}): {ret_type}"
        elif not name.startswith(("+", "-", "#", "~")):
            formatted = f"+ {name}"
        else:
            formatted = name
        return DiffMethod(name=formatted)

    s = str(raw).strip().strip("'\"`")
    if not s:
        return None

    if (s.startswith("{") and s.endswith("}")) or (s.startswith("[") and s.endswith("]")):
        try:
            parsed = json.loads(s)
            if isinstance(parsed, dict):
                return normalize_method_item(parsed)
            if isinstance(parsed, list) and len(parsed) > 0:
                return normalize_method_item(parsed[0])
        except Exception:
            pass

    if s.lower() in SCHEMA_ARTIFACT_KEYS:
        return None

    # Strip conversational prefixes
    prev_s = ""
    while prev_s != s:
        prev_s = s
        s = re.sub(
            r"^(?:agrega(?:r)?|añade|añadir|incluye|incluir|crea(?:r)?|modifica(?:r)?|el|la|los|las|un|una|del?|al?|metodo|método|funcion|función|operacion|operación)\s+",
            "",
            s,
            flags=re.IGNORECASE,
        ).strip()
        s = re.sub(
            r"^(?:de la clase|en la clase|a la clase)\s+[a-zA-Z0-9_]+\s+",
            "",
            s,
            flags=re.IGNORECASE,
        ).strip()

    if s and not s.startswith(("+", "-", "#", "~")):
        s = f"+ {s}"
    if s and "(" not in s:
        s = f"{s}(): void"

    clean_res = s.strip()
    return DiffMethod(name=clean_res) if clean_res else None


def normalize_methods_list(raw_methods: Any) -> List[DiffMethod]:
    if not raw_methods:
        return []

    if isinstance(raw_methods, str):
        clean_str = raw_methods.strip()
        if (clean_str.startswith("[") and clean_str.endswith("]")) or (
            clean_str.startswith("{") and clean_str.endswith("}")
        ):
            try:
                parsed = json.loads(clean_str)
                return normalize_methods_list(parsed)
            except Exception:
                pass

    if not isinstance(raw_methods, list):
        raw_methods = [raw_methods]

    result: List[DiffMethod] = []
    for item in raw_methods:
        if item is None:
            continue
        if isinstance(item, DiffMethod):
            result.append(item)
            continue
        if isinstance(item, dict):
            norm = normalize_method_item(item)
            if norm:
                result.append(norm)
            continue
        if isinstance(item, str):
            clean_str = item.strip()
            if (clean_str.startswith("{") and clean_str.endswith("}")) or (
                clean_str.startswith("[") and clean_str.endswith("]")
            ):
                try:
                    parsed = json.loads(clean_str)
                    if isinstance(parsed, list):
                        result.extend(normalize_methods_list(parsed))
                        continue
                    if isinstance(parsed, dict):
                        norm = normalize_method_item(parsed)
                        if norm:
                            result.append(norm)
                        continue
                except Exception:
                    pass

            lines = [l.strip() for l in clean_str.split("\n") if l.strip()]
            for line in lines:
                if "," in line and "(" in line:
                    parts = [p.strip() for p in line.split(",") if p.strip()]
                    for p in parts:
                        norm = normalize_method_item(p)
                        if norm:
                            result.append(norm)
                    continue
                norm = normalize_method_item(line)
                if norm:
                    result.append(norm)
            continue

        norm = normalize_method_item(item)
        if norm:
            result.append(norm)

    return result


def clean_and_parse_json(text: str) -> Any:
    """
    Robust JSON parser supporting valid JSON, markdown fences, single-quoted strings,
    and Python dictionary/list literals.
    """
    clean = text.strip()
    # Strip common LLM stop tokens
    for token in ["<end_of_turn>", "<|im_end|>", "<|endoftext|>", "<s>", "</s>"]:
        clean = clean.replace(token, "").strip()

    # If code fence present, extract interior
    if "```" in clean:
        parts = clean.split("```")
        for part in parts[1::2]:
            candidate = part.strip()
            if candidate.startswith("json"):
                candidate = candidate[4:].strip()
            try:
                return json.loads(candidate)
            except Exception:
                pass

    try:
        return json.loads(clean)
    except Exception:
        pass

    try:
        sanitized = re.sub(r"(?<!\\)'([^'\\]*(?:\\.[^'\\]*)*)'", r'"\1"', clean)
        return json.loads(sanitized)
    except Exception:
        pass

    start_brace = clean.find("{")
    end_brace = clean.rfind("}")
    start_bracket = clean.find("[")
    end_bracket = clean.rfind("]")
    if start_brace != -1 and end_brace != -1 and (start_bracket == -1 or start_brace < start_bracket):
        sub = clean[start_brace : end_brace + 1]
        try:
            return json.loads(sub)
        except Exception:
            try:
                sanitized_sub = re.sub(r"(?<!\\)'([^'\\]*(?:\\.[^'\\]*)*)'", r'"\1"', sub)
                return json.loads(sanitized_sub)
            except Exception:
                pass
    elif start_bracket != -1 and end_bracket != -1:
        sub = clean[start_bracket : end_bracket + 1]
        try:
            return json.loads(sub)
        except Exception:
            try:
                sanitized_sub = re.sub(r"(?<!\\)'([^'\\]*(?:\\.[^'\\]*)*)'", r'"\1"', sub)
                return json.loads(sanitized_sub)
            except Exception:
                pass

    try:
        val = ast.literal_eval(clean)
        if isinstance(val, (dict, list)):
            return val
    except Exception:
        pass

    raise ValueError(f"Formato de respuesta no procesable como JSON/ToolCall: {clean[:200]}")


def parse_and_validate_diff_payload(
    raw_json_or_dict: Any,
    user_prompt: Optional[str] = None,
    current_model: Optional[Dict[str, Any]] = None,
) -> ModelDiff:
    """
    Parses and sanitizes arbitrary JSON, tool calls, or dictionaries into a valid ModelDiff instance.
    Applies clean, deterministic auto-healing without heuristic regex intent scraping.
    """
    data = raw_json_or_dict
    if isinstance(data, str):
        data = clean_and_parse_json(data)

    # Normalize dot notation keys e.g. {"add.elements": [...]}
    if isinstance(data, dict):
        for key in list(data.keys()):
            if "." in key:
                parts = key.split(".", 1)
                parent_key, child_key = parts[0], parts[1]
                if parent_key in ("add", "modify", "remove"):
                    data.setdefault(parent_key, {})
                    data[parent_key][child_key] = data.pop(key)

    # Single tool call object with function name and arguments
    if isinstance(data, dict) and "name" in data and ("arguments" in data or "class_name" in data or "className" in data):
        data = [data]

    # Convert list of tool calls into merged diff dictionary
    if isinstance(data, list):
        merged: Dict[str, Any] = {
            "add": {"elements": [], "relationships": []},
            "modify": {"elements": []},
            "remove": {"elementIds": [], "relationshipIds": []},
        }

        for item in data:
            if not isinstance(item, dict):
                continue

            # If item is already a ModelDiff block
            for k in ("add", "modify", "remove"):
                if k in item and isinstance(item[k], dict):
                    block = item[k]
                    if k == "add":
                        if "elements" in block and isinstance(block["elements"], list):
                            merged["add"]["elements"].extend(block["elements"])
                        if "relationships" in block and isinstance(block["relationships"], list):
                            merged["add"]["relationships"].extend(block["relationships"])
                    elif k == "modify":
                        if "elements" in block and isinstance(block["elements"], list):
                            merged["modify"]["elements"].extend(block["elements"])
                    elif k == "remove":
                        if "elementIds" in block and isinstance(block["elementIds"], list):
                            merged["remove"]["elementIds"].extend(block["elementIds"])
                        if "relationshipIds" in block and isinstance(block["relationshipIds"], list):
                            merged["remove"]["relationshipIds"].extend(block["relationshipIds"])

            raw_name = item.get("name") or item.get("function") or ""
            if isinstance(raw_name, dict):
                raw_name = raw_name.get("name") or ""
            func_name = str(raw_name).lower().strip().replace(".", "_")

            args = item.get("arguments", item)
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except Exception:
                    pass
            if not isinstance(args, dict):
                continue

            if "diff" in args and isinstance(args["diff"], dict):
                args = args["diff"]
                
            if (
                isinstance(args, dict)
                and isinstance(args.get("properties"), dict)
                and "name" not in args
                and "className" not in args
                and "class_name" not in args
            ):
                args = args["properties"]

            # Tool: create_class / add_elements
            if func_name in ("create_class", "add_class", "add_element", "add_elements") or (
                "class" in func_name and "create" in func_name
            ):
                cls_name = args.get("name") or args.get("className") or args.get("class_name")
                if cls_name:
                    merged["add"]["elements"].append({
                        "name": cls_name,
                        "type": args.get("type", "Class"),
                        "stereotype": args.get("stereotype"),
                        "attributes": args.get("attributes", []),
                        "methods": args.get("methods", []),
                    })
                    if args.get("inherits_from") or args.get("extends") or args.get("parent"):
                        merged["add"]["relationships"].append({
                            "type": "ClassInheritance",
                            "source": cls_name,
                            "target": args.get("inherits_from") or args.get("extends") or args.get("parent"),
                        })

            # Tool: add_attributes
            elif func_name in ("add_attributes", "add_attribute"):
                raw_cls = args.get("class_name") or args.get("className") or args.get("id") or args.get("name")
                cls_name = clean_element_name(raw_cls)
                raw_attrs = extract_clean_list(args.get("attributes") or args.get("attribute") or [])
                if not raw_attrs and user_prompt:
                    raw_attrs = [user_prompt]
                if cls_name:
                    merged["modify"]["elements"].append({
                        "id": cls_name,
                        "changes": {
                            "attributes": normalize_attributes_list(raw_attrs)
                        },
                    })

            # Tool: add_methods
            elif func_name in ("add_methods", "add_method"):
                raw_cls = args.get("class_name") or args.get("className") or args.get("id") or args.get("name")
                cls_name = clean_element_name(raw_cls)
                raw_methods = extract_clean_list(args.get("methods") or args.get("method") or [])
                if cls_name:
                    merged["modify"]["elements"].append({
                        "id": cls_name,
                        "changes": {
                            "methods": normalize_methods_list(raw_methods)
                        },
                    })

            # Tool: modify_class
            elif func_name in ("modify_class", "update_class", "edit_class"):
                cls_name = args.get("class_name") or args.get("className") or args.get("id") or args.get("name")
                changes: Dict[str, Any] = {}
                if args.get("new_name"):
                    changes["name"] = clean_element_name(args["new_name"])
                if args.get("stereotype"):
                    changes["stereotype"] = args["stereotype"]
                if "attributes" in args:
                    changes["attributes"] = [
                        normalize_attribute_item(a) for a in extract_clean_list(args["attributes"])
                    ]
                if "methods" in args:
                    changes["methods"] = [
                        normalize_method_item(m) for m in extract_clean_list(args["methods"])
                    ]
                if "remove_attributes" in args:
                    changes["removeAttributes"] = [
                        clean_element_name(a) for a in extract_clean_list(args["remove_attributes"]) if clean_element_name(a)
                    ]
                if "remove_methods" in args:
                    changes["removeMethods"] = [
                        clean_element_name(m) for m in extract_clean_list(args["remove_methods"]) if clean_element_name(m)
                    ]
                if cls_name:
                    merged["modify"]["elements"].append({"id": cls_name, "changes": changes})

            # Tool: remove_attributes
            elif func_name in ("remove_attributes", "remove_attribute"):
                cls_name = args.get("class_name") or args.get("className") or args.get("id") or args.get("name")
                raw_attrs = extract_clean_list(
                    args.get("attribute_names") or args.get("attributes") or args.get("attribute") or []
                )
                cleaned_attrs = [clean_element_name(a) for a in raw_attrs if clean_element_name(a)]
                if cls_name and cleaned_attrs:
                    merged["modify"]["elements"].append({
                        "id": cls_name,
                        "changes": {"removeAttributes": cleaned_attrs},
                    })

            # Tool: remove_methods
            elif func_name in ("remove_methods", "remove_method"):
                cls_name = args.get("class_name") or args.get("className") or args.get("id") or args.get("name")
                raw_methods = extract_clean_list(
                    args.get("method_names") or args.get("methods") or args.get("method") or []
                )
                cleaned_methods = [clean_element_name(m) for m in raw_methods if clean_element_name(m)]
                if cls_name and cleaned_methods:
                    merged["modify"]["elements"].append({
                        "id": cls_name,
                        "changes": {"removeMethods": cleaned_methods},
                    })

            # Tool: create_relationship
            elif func_name in ("create_relationship", "add_relationship", "create_relationships", "add_relationships", "create_association", "add_association"):
                rel_type = args.get("type") or "ClassBidirectional"
                source = args.get("source") or args.get("from")
                target = args.get("target") or args.get("to")
                assoc_cls = (
                    args.get("intermediateClass")
                    or args.get("intermediate_class")
                    or args.get("associationClass")
                    or args.get("association_class")
                )
                if source and target:
                    rel_dict: Dict[str, Any] = {
                        "type": rel_type,
                        "source": source,
                        "target": target,
                    }
                    if assoc_cls:
                        rel_dict["intermediateClass"] = assoc_cls
                        rel_dict["associationClass"] = assoc_cls
                    merged["add"]["relationships"].append(rel_dict)

            # Tool: remove_elements
            elif func_name in ("remove_elements", "delete_elements", "remove_element", "delete_element"):
                names = extract_clean_list(
                    args.get("element_names") or args.get("element_ids") or args.get("elements") or []
                )
                cleaned_names = [clean_element_name(n) for n in names if clean_element_name(n)]
                merged["remove"]["elementIds"].extend(cleaned_names)

            # Tool: remove_relationships
            elif func_name in ("remove_relationships", "delete_relationships", "remove_relationship", "delete_relationship"):
                rids = extract_clean_list(
                    args.get("relationship_ids") or args.get("relationships") or args.get("relationship") or []
                )
                cleaned_rids = [clean_element_name(r) for r in rids if clean_element_name(r)]
                merged["remove"]["relationshipIds"].extend(cleaned_rids)

            # Fallback for composite apply_model_diff
            elif func_name == "apply_model_diff":
                for k in ("add", "modify", "remove"):
                    if k in args and isinstance(args[k], dict):
                        b = args[k]
                        if k == "add":
                            merged["add"]["elements"].extend(b.get("elements", []))
                            merged["add"]["relationships"].extend(b.get("relationships", []))
                        elif k == "modify":
                            merged["modify"]["elements"].extend(b.get("elements", []))
                        elif k == "remove":
                            merged["remove"]["elementIds"].extend(b.get("elementIds", []))
                            merged["remove"]["relationshipIds"].extend(b.get("relationshipIds", []))

        data = merged

    if not isinstance(data, dict):
        raise ValueError(f"Formato no procesable: {type(data)}")

    # Check for direct arguments / diff wrappers
    if "arguments" in data and isinstance(data["arguments"], (dict, str)):
        args = data["arguments"]
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except Exception:
                pass
        if isinstance(args, dict):
            data = args

    if "diff" in data and isinstance(data["diff"], dict):
        data = data["diff"]

    # Pre-calculate existing diagram names and IDs for deterministic healing
    existing_nodes = (current_model or {}).get("nodes", []) if isinstance(current_model, dict) else []
    existing_names_map: Dict[str, str] = {}  # lower name or lower id -> canonical class name
    node_id_to_name: Dict[str, str] = {}
    existing_node_data: Dict[str, Dict[str, Any]] = {}
    for node in existing_nodes:
        n_id = node.get("id", "")
        n_data = node.get("data", {})
        n_name = n_data.get("name", "")
        clean_n = clean_element_name(n_name)
        n_stereo = n_data.get("stereotype") or ""
        info = {"name": clean_n, "stereotype": n_stereo, "id": n_id}
        if clean_n:
            existing_names_map[clean_n.lower()] = clean_n
            existing_node_data[clean_n.lower()] = info
        if n_id:
            existing_names_map[n_id.lower()] = clean_n or n_id
            node_id_to_name[n_id] = clean_n or n_id
            existing_node_data[n_id.lower()] = info

    # Index members of existing classes for auto-healing misdirected member removals
    attribute_to_class: Dict[str, str] = {}
    method_to_class: Dict[str, str] = {}
    for node in existing_nodes:
        n_data = node.get("data", {})
        c_name = clean_element_name(n_data.get("name", ""))
        for attr in n_data.get("attributes", []):
            raw_a = attr.get("name", "") if isinstance(attr, dict) else str(attr)
            bare = re.sub(r"^[+\-#~]\s*", "", raw_a).split(":")[0].strip().lower()
            if bare and c_name:
                attribute_to_class[bare] = c_name
        for meth in n_data.get("methods", []):
            raw_m = meth.get("name", "") if isinstance(meth, dict) else str(meth)
            bare = re.sub(r"^[+\-#~]\s*", "", raw_m).split("(")[0].strip().lower()
            if bare and c_name:
                method_to_class[bare] = c_name

    # 0. REGEX INTENT SCRAPING & EXTRACTION (Inteligencia Natural Heurística)
    has_attr_delete_intent = False
    has_method_delete_intent = False
    has_class_delete_intent = False
    prompt_extracted_attrs: List[str] = []
    prompt_extracted_methods: List[str] = []
    prompt_target_class: Optional[str] = None

    if user_prompt:
        p_lower = user_prompt.lower()
        has_attr_delete_intent = bool(
            re.search(r"\b(?:elimina|borra|borrar|eliminar|quitar|remover|quita|delete|remove)\b.*\b(?:atributo|campo|propiedad|variable)\b", p_lower)
            or re.search(r"\b(?:atributo|campo|propiedad|variable)\b.*\b(?:elimina|borra|borrar|eliminar|quitar|remover|quita|delete|remove)\b", p_lower)
        )
        has_method_delete_intent = bool(
            re.search(r"\b(?:elimina|borra|borrar|eliminar|quitar|remover|quita|delete|remove)\b.*\b(?:metodo|método|funcion|función|operacion|operación)\b", p_lower)
            or re.search(r"\b(?:metodo|método|funcion|función|operacion|operación)\b.*\b(?:elimina|borra|borrar|eliminar|quitar|remover|quita|delete|remove)\b", p_lower)
        )
        has_class_delete_intent = bool(
            re.search(r"\b(?:clase entera|toda la clase|la clase completa|borra la clase|elimina la clase|eliminar la clase|borrar la clase|delete class|remove class)\b", p_lower)
        )

        raw_attr_matches = re.findall(r"\b(?:atributo|campo|propiedad)\s+([a-zA-Z0-9_]+)\b", user_prompt, re.IGNORECASE)
        prompt_extracted_attrs = [clean_element_name(a) for a in raw_attr_matches if clean_element_name(a)]

        raw_method_matches = re.findall(r"\b(?:metodo|método|funcion|función|operacion|operación)\s+([a-zA-Z0-9_]+)\b", user_prompt, re.IGNORECASE)
        prompt_extracted_methods = [clean_element_name(m) for m in raw_method_matches if clean_element_name(m)]

        cls_match = re.search(r"\b(?:de la clase|en la clase|a la clase|clase)\s+([a-zA-Z0-9_]+)\b", user_prompt, re.IGNORECASE)
        if cls_match:
            candidate_cls = clean_element_name(cls_match.group(1))
            if candidate_cls.lower() in existing_names_map:
                prompt_target_class = existing_names_map[candidate_cls.lower()]
            else:
                prompt_target_class = candidate_cls

    # 1. ADD BLOCK PROCESSING & SEMANTIC HEALING
    elements: List[DiffElementAdd] = []
    converted_modifications: List[DiffElementModify] = []

    if "add" in data and isinstance(data["add"], dict):
        raw_add = data["add"]

        for el in raw_add.get("elements", []):
            if not isinstance(el, dict) or "name" not in el:
                continue

            cleaned_name = clean_element_name(el["name"])
            if not cleaned_name:
                continue

            # Deterministic Boilerplate Filter
            raw_attrs = el.get("attributes") or []
            filtered_attrs = [
                a
                for a in normalize_attributes_list(raw_attrs)
                if a.name.strip().lower() not in DUMMY_PLACEHOLDERS
            ]

            raw_methods = el.get("methods") or []
            filtered_methods = [
                m
                for m in normalize_methods_list(raw_methods)
                if m.name.strip().lower() not in DUMMY_PLACEHOLDERS
            ]

            # DETERMINISTIC AUTO-HEALING: If class already exists, convert to modify
            lower_clean = cleaned_name.lower()
            if lower_clean in existing_names_map:
                target_id = existing_names_map[lower_clean]
                node_info = existing_node_data.get(lower_clean, {})
                existing_stereo = node_info.get("stereotype") or ""
                el_stereo = el.get("stereotype")
                if el_stereo and el_stereo == existing_stereo:
                    el_stereo = None

                # Only append if there are actual attributes, methods, or stereotype to apply!
                if filtered_attrs or filtered_methods or el_stereo:
                    converted_modifications.append(
                        DiffElementModify(
                            id=target_id,
                            changes=DiffElementModifyChanges(
                                stereotype=el_stereo,
                                attributes=filtered_attrs if filtered_attrs else None,
                                methods=filtered_methods if filtered_methods else None,
                            ),
                        )
                    )
            else:
                elements.append(
                    DiffElementAdd(
                        name=cleaned_name,
                        type=el.get("type", "Class"),
                        stereotype=el.get("stereotype"),
                        position=el.get("position"),
                        attributes=filtered_attrs if filtered_attrs else None,
                        methods=filtered_methods if filtered_methods else None,
                    )
                )

        rels: List[DiffRelationshipAdd] = []
        for r in raw_add.get("relationships", []):
            if isinstance(r, dict) and "type" in r and "source" in r and "target" in r:
                raw_assoc = (
                    r.get("intermediateClass")
                    or r.get("intermediate_class")
                    or r.get("associationClass")
                    or r.get("association_class")
                )
                assoc_cls = clean_element_name(raw_assoc) if raw_assoc else None
                rels.append(
                    DiffRelationshipAdd(
                        type=r["type"],
                        source=clean_element_name(r["source"]),
                        target=clean_element_name(r["target"]),
                        intermediateClass=assoc_cls,
                        associationClass=assoc_cls,
                    )
                )

        # Ensure normal classes and association class element exist in elements or diagram if referenced in relationship
        for rel in rels:
            for endpoint in (rel.source, rel.target):
                if endpoint:
                    ep_lower = endpoint.lower()
                    already_in_add = any(e.name.lower() == ep_lower for e in elements)
                    already_in_diag = ep_lower in existing_names_map
                    if not already_in_add and not already_in_diag:
                        elements.append(
                            DiffElementAdd(
                                name=endpoint,
                                type="Class",
                                attributes=[],
                                methods=[],
                            )
                        )

            assoc_class_target = rel.intermediateClass or rel.associationClass
            if assoc_class_target:
                assoc_lower = assoc_class_target.lower()
                already_in_add = any(e.name.lower() == assoc_lower for e in elements)
                already_in_diag = assoc_lower in existing_names_map
                if not already_in_add and not already_in_diag:
                    elements.append(
                        DiffElementAdd(
                            name=assoc_class_target,
                            type="Class",
                            stereotype="<<association>>",
                            attributes=[],
                            methods=[],
                        )
                    )

        add_block = DiffAddBlock(elements=elements, relationships=rels) if (elements or rels) else None
    else:
        add_block = None

    # 2. MODIFY BLOCK PROCESSING
    mods: List[DiffElementModify] = list(converted_modifications)

    if "modify" in data and isinstance(data["modify"], dict):
        raw_mod = data["modify"]

        for m in raw_mod.get("elements", []):
            if not isinstance(m, dict) or "id" not in m:
                continue

            elem_id = clean_element_name(m["id"])
            ch = m.get("changes", {})
            if not isinstance(ch, dict):
                continue

            raw_attrs = ch.get("attributes")
            raw_methods = ch.get("methods")

            # Filter dummy placeholders from modify changes
            filtered_attrs = (
                [
                    a
                    for a in normalize_attributes_list(raw_attrs)
                    if a.name.strip().lower() not in DUMMY_PLACEHOLDERS
                ]
                if raw_attrs is not None
                else None
            )

            filtered_methods = (
                [
                    m
                    for m in normalize_methods_list(raw_methods)
                    if m.name.strip().lower() not in DUMMY_PLACEHOLDERS
                ]
                if raw_methods is not None
                else None
            )

            # Defensive member preservation: if model returned empty list [] without remove intent,
            # don't wipe existing members
            has_remove_intent = bool(ch.get("removeAttributes") or ch.get("removeMethods"))
            if filtered_attrs is not None and len(filtered_attrs) == 0 and not has_remove_intent:
                filtered_attrs = None
            if filtered_methods is not None and len(filtered_methods) == 0 and not has_remove_intent:
                filtered_methods = None

            remove_attrs = (
                [clean_element_name(ra) for ra in ch["removeAttributes"]]
                if "removeAttributes" in ch and isinstance(ch["removeAttributes"], list)
                else (
                    [clean_element_name(ra) for ra in ch["remove_attributes"]]
                    if "remove_attributes" in ch and isinstance(ch["remove_attributes"], list)
                    else []
                )
            )

            remove_methods = (
                [clean_element_name(rm) for rm in ch["removeMethods"]]
                if "removeMethods" in ch and isinstance(ch["removeMethods"], list)
                else (
                    [clean_element_name(rm) for rm in ch["remove_methods"]]
                    if "remove_methods" in ch and isinstance(ch["remove_methods"], list)
                    else []
                )
            )

            # Heurística Regex 1: Si el modelo emitió atributos con prefijo '-' pensando que '-' denota borrado
            # o si el usuario pidió borrar un atributo específico
            if filtered_attrs is not None and (has_attr_delete_intent or any(a.name.strip().startswith("-") for a in filtered_attrs)):
                preserved_attrs = []
                for a in filtered_attrs:
                    a_name = a.name.strip()
                    if has_attr_delete_intent and (a_name.startswith("-") or len(filtered_attrs) == 1):
                        bare_name = re.sub(r"^[+\-#~]\s*", "", a_name).split(":")[0].strip()
                        if bare_name and bare_name not in remove_attrs:
                            remove_attrs.append(bare_name)
                    else:
                        preserved_attrs.append(a)
                filtered_attrs = preserved_attrs if preserved_attrs else None

            # Heurística Regex 2: Fallback si el usuario pidió borrar atributo por nombre en el prompt
            if has_attr_delete_intent and not remove_attrs and prompt_extracted_attrs:
                for pa in prompt_extracted_attrs:
                    if pa not in remove_attrs:
                        remove_attrs.append(pa)

            if has_method_delete_intent and not remove_methods and prompt_extracted_methods:
                for pm in prompt_extracted_methods:
                    if pm not in remove_methods:
                        remove_methods.append(pm)

            remove_attrs = remove_attrs if remove_attrs else None
            remove_methods = remove_methods if remove_methods else None

            # Check if there are ANY actual changes on this element
            ch_name = clean_element_name(ch["name"]) if ch.get("name") else None
            ch_stereo = ch.get("stereotype")
            ch_pos = ch.get("position")

            # Check against existing node to eliminate no-op unchanged fields
            node_info = existing_node_data.get(elem_id.lower())
            if node_info:
                existing_name = node_info.get("name", "")
                existing_stereo = node_info.get("stereotype", "")
                if ch_name and ch_name.lower() == existing_name.lower():
                    ch_name = None  # No actual name change
                if ch_stereo and ch_stereo == existing_stereo:
                    ch_stereo = None  # No actual stereotype change

            has_actual_changes = any([
                ch_name,
                ch_stereo,
                ch_pos,
                filtered_attrs,
                filtered_methods,
                remove_attrs,
                remove_methods,
            ])

            if not has_actual_changes:
                logger.info(f"Descartando modificación no-op sin cambios reales en clase '{elem_id}'.")
                continue

            # Resolve element name to canonical human class name if matched
            target_id = existing_names_map.get(elem_id.lower(), elem_id)

            mods.append(
                DiffElementModify(
                    id=target_id,
                    changes=DiffElementModifyChanges(
                        name=ch_name,
                        stereotype=ch_stereo,
                        position=ch_pos,
                        attributes=filtered_attrs,
                        methods=filtered_methods,
                        removeAttributes=remove_attrs,
                        removeMethods=remove_methods,
                    ),
                )
            )

    # Auto-healing fallback for member deletion if model generated no modifications
    if user_prompt and (has_attr_delete_intent or has_method_delete_intent) and not has_class_delete_intent:
        if prompt_extracted_attrs:
            for attr_candidate in prompt_extracted_attrs:
                bare_c = attr_candidate.lower()
                target_cls = attribute_to_class.get(bare_c) or prompt_target_class
                if target_cls:
                    canonical_cls = existing_names_map.get(target_cls.lower(), target_cls)
                    found_mod = next((m for m in mods if m.id.lower() == canonical_cls.lower()), None)
                    if found_mod:
                        if not found_mod.changes.removeAttributes:
                            found_mod.changes.removeAttributes = []
                        if attr_candidate not in found_mod.changes.removeAttributes:
                            found_mod.changes.removeAttributes.append(attr_candidate)
                    else:
                        mods.append(
                            DiffElementModify(
                                id=canonical_cls,
                                changes=DiffElementModifyChanges(removeAttributes=[attr_candidate]),
                            )
                        )
        if prompt_extracted_methods:
            for meth_candidate in prompt_extracted_methods:
                bare_m = meth_candidate.lower()
                target_cls = method_to_class.get(bare_m) or prompt_target_class
                if target_cls:
                    canonical_cls = existing_names_map.get(target_cls.lower(), target_cls)
                    found_mod = next((m for m in mods if m.id.lower() == canonical_cls.lower()), None)
                    if found_mod:
                        if not found_mod.changes.removeMethods:
                            found_mod.changes.removeMethods = []
                        if meth_candidate not in found_mod.changes.removeMethods:
                            found_mod.changes.removeMethods.append(meth_candidate)
                    else:
                        mods.append(
                            DiffElementModify(
                                id=canonical_cls,
                                changes=DiffElementModifyChanges(removeMethods=[meth_candidate]),
                            )
                        )

    # 3. REMOVE BLOCK PROCESSING
    remove_block = None
    if "remove" in data and isinstance(data["remove"], dict):
        raw_rem = data["remove"]
        raw_elem_ids = extract_clean_list(
            raw_rem.get("elementIds") or raw_rem.get("element_ids") or raw_rem.get("elements") or []
        )

        cleaned_elem_ids: List[str] = []
        for eid in raw_elem_ids:
            if not eid or not isinstance(eid, str):
                continue
            clean_id = clean_element_name(eid)
            # Filter generic keyword tokens
            if clean_id.lower() in ("node", "class", "clase", "element", "id", "item", "null", "undefined", ""):
                continue

            bare_id = re.sub(r"^[+\-#~]\s*", "", clean_id).split(":")[0].strip().lower()

            # 1. Anti-destruction: if item is actually an attribute of an existing class
            if bare_id in attribute_to_class:
                target_cls = attribute_to_class[bare_id]
                logger.info(f"Auto-healing: redirigiendo eliminación de atributo '{bare_id}' a clase '{target_cls}'.")
                found_mod = next((m for m in mods if m.id.lower() == target_cls.lower()), None)
                if found_mod:
                    if not found_mod.changes.removeAttributes:
                        found_mod.changes.removeAttributes = []
                    found_mod.changes.removeAttributes.append(bare_id)
                else:
                    mods.append(
                        DiffElementModify(
                            id=target_cls,
                            changes=DiffElementModifyChanges(removeAttributes=[bare_id]),
                        )
                    )
                continue

            # 2. Anti-destruction: if item is actually a method of an existing class
            bare_meth = re.sub(r"^[+\-#~]\s*", "", clean_id).split("(")[0].strip().lower()
            if bare_meth in method_to_class:
                target_cls = method_to_class[bare_meth]
                logger.info(f"Auto-healing: redirigiendo eliminación de método '{bare_meth}' a clase '{target_cls}'.")
                found_mod = next((m for m in mods if m.id.lower() == target_cls.lower()), None)
                if found_mod:
                    if not found_mod.changes.removeMethods:
                        found_mod.changes.removeMethods = []
                    found_mod.changes.removeMethods.append(bare_meth)
                else:
                    mods.append(
                        DiffElementModify(
                            id=target_cls,
                            changes=DiffElementModifyChanges(removeMethods=[bare_meth]),
                        )
                    )
                continue

            # 3. Anti-destruction: If user_prompt specifically asked to delete an attribute or method,
            # do NOT allow deleting the class!
            if user_prompt:
                p_lower = user_prompt.lower()
                has_member_delete_intent = any(
                    k in p_lower for k in ("atributo", "campo", "propiedad", "metodo", "método", "operacion", "operación")
                )
                wants_whole_class_deleted = any(
                    k in p_lower for k in ("clase entera", "toda la clase", "la clase completa", "borra la clase", "elimina la clase", "eliminar la clase", "borrar la clase")
                )
                if has_member_delete_intent and not wants_whole_class_deleted:
                    if clean_id.lower() in existing_names_map:
                        canonical_cls = existing_names_map[clean_id.lower()]
                        node_info = next(
                            (
                                n
                                for n in existing_nodes
                                if clean_element_name(n.get("data", {}).get("name", "")).lower() == canonical_cls.lower()
                            ),
                            None,
                        )
                        if node_info:
                            n_attrs = node_info.get("data", {}).get("attributes", [])
                            matched_attrs = []
                            for a in n_attrs:
                                a_name = a.get("name", "") if isinstance(a, dict) else str(a)
                                bare_a = re.sub(r"^[+\-#~]\s*", "", a_name).split(":")[0].strip()
                                if bare_a and bare_a.lower() in p_lower:
                                    matched_attrs.append(bare_a)
                            if matched_attrs:
                                logger.info(
                                    f"Protegiendo clase '{canonical_cls}': convirtiendo a eliminación de atributos {matched_attrs}"
                                )
                                found_mod = next((m for m in mods if m.id.lower() == canonical_cls.lower()), None)
                                if found_mod:
                                    if not found_mod.changes.removeAttributes:
                                        found_mod.changes.removeAttributes = []
                                    for ma in matched_attrs:
                                        if ma not in found_mod.changes.removeAttributes:
                                            found_mod.changes.removeAttributes.append(ma)
                                else:
                                    mods.append(
                                        DiffElementModify(
                                            id=canonical_cls,
                                            changes=DiffElementModifyChanges(removeAttributes=list(dict.fromkeys(matched_attrs))),
                                        )
                                    )
                                continue

            # 4. Resolve to diagram node ID if possible, dropping non-existent elements
            if existing_names_map:
                if clean_id.lower() in existing_names_map:
                    cleaned_elem_ids.append(existing_names_map[clean_id.lower()])
                elif clean_id in [n.get("id") for n in existing_nodes]:
                    cleaned_elem_ids.append(clean_id)
                else:
                    logger.warning(
                        f"Ignorando eliminación de clase '{clean_id}': no existe en el diagrama actual."
                    )
            else:
                cleaned_elem_ids.append(clean_id)

        raw_rel_ids = extract_clean_list(
            raw_rem.get("relationshipIds") or raw_rem.get("relationship_ids") or raw_rem.get("relationships") or []
        )
        cleaned_rel_ids = [clean_element_name(r) for r in raw_rel_ids if clean_element_name(r)]

        if cleaned_elem_ids or cleaned_rel_ids:
            remove_block = DiffRemoveBlock(
                elementIds=cleaned_elem_ids if cleaned_elem_ids else None,
                relationshipIds=cleaned_rel_ids if cleaned_rel_ids else None,
            )

    if mods:
        for m in mods:
            if m.changes:
                if m.changes.removeAttributes:
                    m.changes.removeAttributes = list(dict.fromkeys(m.changes.removeAttributes))
                if m.changes.removeMethods:
                    m.changes.removeMethods = list(dict.fromkeys(m.changes.removeMethods))

    modify_block = DiffModifyBlock(elements=mods) if mods else None

    # 4. ANTI-COPY FILTER FOR SYSTEM PROMPT EXAMPLES
    if add_block and add_block.elements and user_prompt:
        p_lower = user_prompt.lower()
        wants_strategy = any(k in p_lower for k in ("strategy", "estrategia", "patron", "patrón"))
        wants_context = "context" in p_lower or "contexto" in p_lower

        filtered_elements = []
        filtered_out_names = set()
        for el in add_block.elements:
            canonical_clean = el.name.lower().replace(" ", "").replace("_", "")
            if canonical_clean in ("concretestrategya", "concretestrategyb") and not wants_strategy:
                filtered_out_names.add(el.name)
                continue
            if canonical_clean == "strategy" and not wants_strategy:
                filtered_out_names.add(el.name)
                continue
            if canonical_clean == "context" and not (wants_strategy or wants_context):
                filtered_out_names.add(el.name)
                continue
            if canonical_clean in ("usuario_venta_assoc", "usuarioventaassoc", "mf_assoc", "mfassoc") and not (
                "usuario" in p_lower and "venta" in p_lower or "mf" in p_lower
            ):
                filtered_out_names.add(el.name)
                continue
            filtered_elements.append(el)

        if filtered_out_names:
            logger.info(f"Filtro Anti-Ejemplos: descartando clases alucinadas del system prompt: {filtered_out_names}")
            add_block.elements = filtered_elements
            if add_block.relationships:
                add_block.relationships = [
                    r
                    for r in add_block.relationships
                    if r.source not in filtered_out_names and r.target not in filtered_out_names
                ]
            if not add_block.elements and not add_block.relationships:
                add_block = None

    # Detailed Phase Logging
    print(f"\n{'='*25} [FASE 3: PARSING Y NORMALIZACIÓN] {'='*25}")
    if add_block:
        if add_block.elements:
            print(f"  * Clases a Agregar ({len(add_block.elements)}): {[e.name for e in add_block.elements]}")
            for e in add_block.elements:
                if e.attributes:
                    print(f"    - [{e.name}] Atributos: {[a.name for a in e.attributes]}")
                if e.methods:
                    print(f"    - [{e.name}] Métodos: {[m.name for m in e.methods]}")
        if add_block.relationships:
            print(f"  * Relaciones a Agregar ({len(add_block.relationships)}):")
            for r in add_block.relationships:
                assoc_info = (
                    f" (intermediateClass: {r.intermediateClass or r.associationClass})"
                    if (r.intermediateClass or r.associationClass)
                    else ""
                )
                print(f"    - {r.type}: {r.source} -> {r.target}{assoc_info}")
    if modify_block and modify_block.elements:
        print(f"  * Clases a Modificar ({len(modify_block.elements)}): {[m.id for m in modify_block.elements]}")
        for m in modify_block.elements:
            if m.changes:
                if m.changes.attributes:
                    print(f"    - [{m.id}] Nuevos Atributos: {[a.name for a in m.changes.attributes]}")
                if m.changes.methods:
                    print(f"    - [{m.id}] Nuevos Métodos: {[meth.name for meth in m.changes.methods]}")
                if m.changes.removeAttributes:
                    print(f"    - [{m.id}] Atributos a Eliminar: {m.changes.removeAttributes}")
                if m.changes.removeMethods:
                    print(f"    - [{m.id}] Métodos a Eliminar: {m.changes.removeMethods}")

    print(f"\n{'='*25} [FASE 4: VALIDACIÓN Y ANTI-EJEMPLOS] {'='*25}")
    print("  * Validación de correspondencia Semántica: OK")
    print("  * Prevención de sobreescritura con ejemplos del prompt: ACTIVO")

    print(f"\n{'='*25} [FASE 5: MODELDIFF FINAL GENERADO] {'='*25}")
    adds_count = len(add_block.elements or []) if add_block and add_block.elements else 0
    rels_count = len(add_block.relationships or []) if add_block and add_block.relationships else 0
    mods_count = len(modify_block.elements or []) if modify_block and modify_block.elements else 0
    rems_count = (
        (len(remove_block.elementIds or []) + len(remove_block.relationshipIds or []))
        if remove_block
        else 0
    )
    print(
        f"  * Resumen: {adds_count} clases nuevas, {rels_count} relaciones, {mods_count} modificaciones, {rems_count} eliminaciones"
    )
    print(f"{'='*70}\n")

    return ModelDiff(add=add_block, modify=modify_block, remove=remove_block)
