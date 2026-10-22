# Navegadores Soportados y Requisitos del Sistema

UmlStudio ha sido diseñado con estándares web modernos para funcionar directamente en el navegador sin necesidad de instalar plugins o extensiones adicionales.

---

## Navegadores Compatibles

Para garantizar la mejor experiencia con el canvas interactivo, WebSocket de baja latencia y Web Audio para reconocimiento por voz, se recomiendan las siguientes versiones mínimas:

| Navegador                   | Versión Mínima           | Soporte de Voz (STT)       | Motor Gráfico             |
| --------------------------- | ------------------------ | -------------------------- | ------------------------- |
| **Google Chrome**           | 110+                     | Nativo (Web Speech API)    | Completo (Aceleración 2D) |
| **Microsoft Edge**          | 110+                     | Nativo (Web Speech API)    | Completo (Aceleración 2D) |
| **Mozilla Firefox**         | 115+ (ESR)               | Soporte vía MediaRecorder  | Completo (Gecko)          |
| **Apple Safari**            | 16.4+                    | Nativo (Safari Web Speech) | Completo (WebKit)         |
| **Brave / Opera / Vivaldi** | Basados en Chromium 110+ | Nativo                     | Completo                  |

---

## Requisitos de Hardware Recomendados

- **Memoria RAM**: 4 GB mínimo (8 GB recomendado para diagramas con más de 200 entidades y múltiples colaboradores).
- **Procesador**: 2 núcleos de 2.0 GHz o superior.
- **Resolución de Pantalla**: 1280x720 mínimo (1920x1080 o superior recomendada para una vista cómoda del canvas, la paleta y los paneles laterales).
- **Conectividad**: Conexión a Internet o red local estable para sesiones colaborativas (puerto WebSocket seguro habilitado).
