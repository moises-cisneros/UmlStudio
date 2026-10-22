# Presencia, Identidad Real y Cursores Multiusuario

Para que el trabajo en equipo se sienta natural y transparente, UmlStudio implementa un protocolo de presencia (_awareness_) que refleja la actividad de cada miembro en el canvas.

---

## Cursores Multiusuario

- Cada participante activo en la sala proyecta su cursor en la pantalla de los demás en tiempo real.
- Junto al puntero se visualiza una etiqueta con el **nombre real del colaborador**.
- El **color distintivo** del cursor corresponde al color personalizado que el usuario ha seleccionado en su perfil, facilitando la identificación visual inmediata de quién está realizando cada cambio.

---

## Barra de Participantes Activos

En la barra superior del editor se listan los avatares de todos los colaboradores actualmente en línea:

- Si un usuario está interactuando con un elemento, su avatar muestra un indicador sutil de actividad.
- Al hacer clic sobre el avatar de un compañero, el canvas puede centrar automáticamente la vista en la posición actual de su cursor.

---

## Identidad Real Garantizada

A diferencia de otras pizarras que asignan nombres arbitrarios (como "Anónimo 42"), UmlStudio enlaza la sesión WebSocket directamente a la identidad de usuario autenticada en el backend. Esto garantiza trazabilidad absoluta para revisiones de diseño y registros de auditoría en los snapshots.
