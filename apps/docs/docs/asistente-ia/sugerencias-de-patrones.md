# Sugerencias Proactivas de Patrones de Diseño

El motor de análisis de UmlStudio evalúa continuamente la topología del diagrama para identificar oportunidades de mejora arquitectónica mediante patrones de diseño clásicos (**Gang of Four - GoF**).

---

## Patrones Detectados y Asistidos

- **Estrategia (Strategy)**: Cuando detecta múltiples clases con lógica condicional similar o jerarquías paralelas que se benefician de encapsular algoritmos intercambiables.
- **Fábrica / Abstract Factory**: Cuando existen dependencias directas sobre constructores de familias de clases concretas.
- **Observador (Observer)**: Para desacoplar emisores de eventos y consumidores de notificaciones en el dominio.
- **Decorador (Decorator)**: Cuando se identifican jerarquías con proliferación de subclases para añadir responsabilidades dinámicas.
- **Adaptador (Adapter)**: Para conectar interfaces incompatibles con sistemas legados o librerías externas.

---

## Cómo Aplicar una Sugerencia

1. Cuando el analizador detecta una oportunidad, muestra una tarjeta de recomendación en el panel lateral de sugerencias.
2. Haz clic en **Explorar Patrón**: Se mostrará una explicación del beneficio arquitectónico y cómo quedaría reorganizada la estructura de clases.
3. Haz clic en **Aplicar Patrón**: Se generará la propuesta en el visor de diff para tu confirmación.
