# Revisión y Diff Visual de Cambios con IA

En UmlStudio, la inteligencia artificial **nunca altera tu diagrama a ciegas**. Toda sugerencia pasa por un flujo de inspección de diferencias (_visual diff_) donde el diseñador tiene el control total.

---

## El Diálogo de Previsualización (Visual Diff)

Cuando la IA procesa tu solicitud, genera una propuesta de mutaciones expresada como un `ModelDiff`. Antes de fusionarse con tu canvas, se abre el visor de diferencias:

- **Elementos Agregados (Verde)**: Clases, atributos o relaciones nuevas que se añadirán al modelo.
- **Elementos Modificados (Ámbar / Amarillo)**: Cambios en visibilidades, tipos de datos o nombres existentes.
- **Elementos Eliminados (Rojo)**: Elementos que el prompt solicitó retirar o simplificar.

---

## Aprobación Selectiva

Dentro del modal de revisión puedes:

1. **Aceptar Todo**: Aplica la totalidad del parche al canvas en una sola transacción atómica y reversible.
2. **Rechazar / Descartar**: Cancela la propuesta sin afectar en absoluto tu trabajo actual.
3. **Deshacer Posterior**: Si aplicas el cambio y luego cambias de opinión, puedes simplemente presionar <kbd>Ctrl</kbd>+<kbd>Z</kbd> para regresar al estado previo en un solo paso.
