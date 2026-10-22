# Introducción a UmlStudio

Bienvenido a **UmlStudio**, el entorno de ingeniería de software y modelado visual diseñado específicamente para la especificación y diseño riguroso de **Diagramas de Clases OMG UML 2.5**.

UmlStudio combina la precisión formal del estándar UML con capacidades de desarrollo contemporáneas: sincronización colaborativa en tiempo real sin conflictos (CRDT), asistencia generativa de inteligencia artificial multimodal, ingeniería hacia adelante (Forward Engineering) con generación de código backend Spring Boot 3.x, e interoperabilidad bidireccional mediante el estándar XMI 2.1.

---

## Características Principales

- **Canvas Reactivo y Rendimiento Óptimo**: Motor gráfico desacoplado y optimizado para diagramas complejos de más de 100 clases con renderizado fluido a 60 FPS.
- **Modelado Formal OMG UML 2.5**: Soporte estricto para Clases, Interfaces, Enumeraciones, Paquetes y todos los conectores estructurales (Herencia, Realización, Asociación, Agregación, Composición, Dependencia y Clases de Asociación).
- **Colaboración Multiusuario en Tiempo Real**: Co-edición simultánea respaldada por CRDTs (Yjs) y Redis, con presencia de cursores de identidad real y un sistema de exclusión mutua temporal (_object locking_) para evitar colisiones entre diseñadores.
- **Asistente de IA Integrado y Agentes MCP**: Posibilidad de modelar clases mediante lenguaje natural escrito o voz, con previsualización side-by-side de diferencias antes de consolidar cambios, además de un servidor FastMCP para interacción con herramientas externas.
- **Ingeniería de Código Limpio**: Generación automatizada de arquitecturas desacopladas en Spring Boot 3.x (Entity, Repository, Service, DTO, Controller) con PostgreSQL 16 y especificaciones OpenAPI 3.0 interactivas con Swagger UI.
- **Control de Versiones y Puntos de Control**: Creación de snapshots manuales y automáticos con capacidad de navegación temporal en modo solo lectura y reversión asistida.
- **Interoperabilidad Enterprise**: Importación y exportación de archivos XMI compatibles con herramientas industriales como Sparx Enterprise Architect.
