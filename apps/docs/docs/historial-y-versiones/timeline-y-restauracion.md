# Línea de Tiempo, Previsualización y Restauración

El panel de historial permite recorrer la evolución temporal del diagrama, previsualizar versiones antiguas y restaurarlas con total seguridad.

---

## 1. Abrir la Línea de Tiempo (Timeline)

- **Atajo**: Presiona <kbd>Ctrl</kbd>+<kbd>H</kbd> (o abre el menú **Historial > Ver Versiones**).
- Se desplegará un panel lateral ordenado cronológicamente con todos los snapshots registrados.

---

## 2. Modo Previsualización (Solo Lectura)

- Haz clic sobre cualquier snapshot de la lista para entrar en **Modo Previsualización**.
- El canvas cambiará a un marco distintivo de solo lectura, permitiéndote navegar, hacer zoom y examinar la arquitectura tal como existía en ese momento del tiempo.
- Ninguna edición realizada en este modo afectará la versión activa.

---

## 3. Restaurar una Versión Previa

Si decides que el diseño actual debe volver al estado de un snapshot anterior:

1. Dentro del modo de previsualización, haz clic en el botón **Restaurar esta Versión**.
2. **Snapshot de Seguridad Automático**: Antes de aplicar la restauración, UmlStudio crea un snapshot del estado actual, asegurando que nunca pierdas el trabajo más reciente.
3. El canvas se actualiza con la versión seleccionada y la mutación se propaga a todos los colaboradores de la sala.
4. Si la restauración fue un error, dispones de una **ventana de deshacer (Undo)** inmediata para regresar al estado previo.
