# Interoperabilidad XMI con Enterprise Architect

**XMI (XML Metadata Interchange)** es el estándar internacional promovido por el OMG para el intercambio de modelos UML entre distintas herramientas CASE del mercado.

---

## Compatibilidad de UmlStudio

UmlStudio implementa serialización y deserialización conforme a **XMI versión 2.1**, con optimizaciones específicas para compatibilidad total con **Sparx Systems Enterprise Architect**:

- Mapeo bidireccional de clasificadores: `<uml:Class>`, `<uml:Interface>`, `<uml:Enumeration>`, `<uml:Package>`.
- Mapeo de propiedades y operaciones con tipos de datos estándar de UML.
- Mapeo de conectores de generalización (`<generalization>`), realización (`<realization>`), dependencias y asociaciones con multiplicidades en los roles.
- Preservación de la información de diagram interchange (posiciones x, y, ancho y alto).

---

## Cómo Exportar a XMI

1. Abre el menú **Exportar > Exportar como XMI 2.1**.
2. El sistema validará la consistencia del modelo y generará un archivo XML descargable `.xmi`.
3. En Enterprise Architect (o cualquier herramienta compatible como Eclipse Papyrus o MagicDraw), selecciona **Import Package from XMI** y carga el archivo generado.

---

## Cómo Importar un Archivo XMI

1. Abre el menú **Importar > Importar Archivo XMI**.
2. Selecciona un archivo `.xmi` o `.xml` generado por Enterprise Architect u otra herramienta compatible.
3. UmlStudio reconstruirá el grafo completo de clases y conectores en el canvas interactivo.
