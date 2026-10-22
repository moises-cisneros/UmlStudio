# Diagnóstico y Solución de Problemas

Guía de resolución de incidencias comunes de conectividad, renderizado o sincronización.

---

## 1. El Diagrama Indica "Desconectado" o no Conecta por WebSocket

### Síntomas:

- Aparece un indicador amarillo o rojo de reconexión constante.
- Las ediciones no se reflejan en las pantallas de otros colaboradores.

### Soluciones:

1. **Verificar Firewalls y Proxies Corporativos**: Asegúrate de que tu red corporativa permita conexiones WebSocket salientes sobre HTTPS (`wss://`).
2. **Revisar el Estado del Servidor Relay**: Si gestionas tu propia instancia Docker, comprueba que el contenedor `server` esté en ejecución y que el puerto `4444` (o el reverse proxy Traefik en `/ws`) esté accesible.
3. **Caché y Reconexión Manual**: Presiona <kbd>F5</kbd> para forzar la recarga del cliente. Las mutaciones pendientes en IndexedDB se reenviarán automáticamente al reconectar.

---

## 2. El Asistente de IA no Responde o Devuelve Error de Timeout

### Síntomas:

- El prompt de IA muestra un spinner continuo o un mensaje de error de conexión.

### Soluciones:

1. Verifica que el microservicio de IA (`ai-service` en puerto `8001`) esté levantado.
2. Si utilizas reconocimiento por voz (STT), asegúrate de haber concedido permisos de acceso al micrófono en la barra de direcciones de tu navegador.

---

## 3. Clases o Aristas Superpuestas en Diagramas Complejos

### Síntomas:

- En diagramas con muchas relaciones cruzadas, las etiquetas de multiplicidad pueden superponerse con los conectores.

### Soluciones:

1. Utiliza la función **Alinear y Distribuir** en la barra de herramientas para aplicar el layout ortogonal asistido.
2. Haz clic sobre cualquier punto de inflexión de una relación para añadir un vértice intermedio y redondear la ruta de la arista.
