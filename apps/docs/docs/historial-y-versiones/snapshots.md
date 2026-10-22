# Snapshots: Puntos de Control Inmutables

Un **Snapshot** en UmlStudio es una captura inmutable del estado completo de un diagrama en un instante dado, respaldada por un hash criptográfico y metadatos de autoría.

---

## Tipos de Snapshots

1. **Snapshots Manuales**:
   - Creados explícitamente por el modelador cuando alcanza un hito de diseño importante (por ejemplo: _"Estructura base del módulo de pagos finalizada"_).
   - Atajo: Presiona <kbd>Ctrl</kbd>+<kbd>S</kbd> en el editor.
   - Permite añadir una descripción o etiqueta legible para identificar el motivo del guardado.
2. **Snapshots Automáticos**:
   - Registrados por el sistema antes de operaciones de gran impacto (como la aplicación de un parche masivo de IA o antes de una restauración de versión previa).
   - Garantizan una red de seguridad contra pérdidas involuntarias de información.

---

## Metadatos Registrados en Cada Snapshot

- **Fecha y Hora Exacta** (timestamp ISO-8601).
- **Autor Real**: Nombre y correo del usuario autenticado que creó el snapshot.
- **Hash de Integridad**: Verificación SHA-256 del contenido del modelo.
- **Conteo de Entidades**: Número de clases, interfaces, relaciones y atributos presentes en esa versión.
