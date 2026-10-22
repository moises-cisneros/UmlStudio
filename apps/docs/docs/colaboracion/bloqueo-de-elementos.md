# Bloqueo Fino de Elementos (Object Locking)

Para evitar colisiones cuando dos diseñadores intentan editar simultáneamente la misma clase o relación, UmlStudio incorpora un mecanismo de **bloqueo granular de elementos** (_fine-grained object locking_).

---

## ¿Cómo Funciona el Bloqueo?

1. **Adquisición Automática**: En el momento en que haces clic para editar los atributos, métodos o posición de una clase, tu cliente adquiere automáticamente un cerrojo temporal sobre ese nodo en el servidor.
2. **Indicador Visual para los Demás**:
   - Para los otros miembros de la sala, la clase se resalta con el borde del color del usuario que la está editando.
   - Aparece un badge flotante indicando: _"Editado por [Nombre]"_.
   - Los campos de edición quedan deshabilitados temporalmente para los demás mientras dure la edición activa.
3. **Liberación Inmediata**: Al consolidar los cambios (<kbd>Esc</kbd>, clic fuera o <kbd>Enter</kbd>), el bloqueo se libera automáticamente y la versión consolidada se propaga a todos los participantes.

---

## Timeouts de Seguridad

Si un usuario pierde la conexión o cierra la pestaña mientras tenía un elemento bloqueado, un temporizador de liveness (_heartbeat_) en Redis libera automáticamente el cerrojo tras 10 segundos de inactividad, evitando que los elementos queden congelados permanentemente.
