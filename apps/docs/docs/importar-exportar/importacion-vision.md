# Importación desde Imagen Mediante Visión y OCR

¿Tienes un boceto dibujado a mano en una pizarra o una captura de pantalla de un diagrama antiguo? UmlStudio incluye un pipeline de visión computacional y OCR especializado en diagramas de clases.

---

## Cómo Digitalizar un Boceto

1. Haz clic en el menú superior **Importar > Importar desde Imagen (Visión)**.
2. Arrastra una fotografía o captura en formato PNG, JPEG o WebP (o usa el botón para explorar tus archivos).
3. El microservicio de Visión procesará la imagen:
   - Identifica rectángulos y compartimentos de clases.
   - Extrae nombres de clases, atributos, visibilidades y tipos mediante OCR.
   - Detecta aristas, puntas de flecha y rombos clasificándolos en su tipo de relación correspondiente (Herencia, Asociación, Composición, etc.).
4. Se presentará un diálogo de confirmación con el diagrama digitalizado para que puedas ajustar cualquier detalle antes de incorporarlo a tu canvas.
