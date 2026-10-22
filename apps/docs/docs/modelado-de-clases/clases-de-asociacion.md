# Clases de Asociación (Relaciones N:M con Atributos)

En el estándar OMG UML 2.5, una **Clase de Asociación (`AssociationClass`)** es un elemento de modelado que es simultáneamente una **asociación** entre dos clases y una **clase** por derecho propio.

---

## ¿Cuándo Utilizar una Clase de Asociación?

Se utiliza cuando una relación de muchos a muchos ($N:M$) posee atributos o comportamiento que no pertenecen naturalmente a ninguna de las dos entidades participantes por separado, sino al vínculo existente entre ambas.

### Ejemplo Clásico: Matrícula

- **Entidad A**: `Estudiante`
- **Entidad B**: `Curso`
- **Clase de Asociación**: `Matricula`
  - Atributos propios del vínculo: `fechaInscripcion: LocalDate`, `calificacionFinal: Double`.

---

## Representación Visual en UmlStudio

1. Existe una arista de asociación continua entre la clase origen y la clase destino.
2. La clase de asociación se representa como un nodo de clase estándar flotante.
3. Se dibuja automáticamente una **línea discontinua perpendicular** que conecta el centro de la arista de asociación con la clase de asociación.

---

## Cómo Crear una Clase de Asociación en el Canvas

1. Crea las dos clases principales y conéctalas con una relación de tipo **Asociación**.
2. Crea una tercera clase que actuará como clase de asociación y asígnale sus atributos.
3. En el menú contextual de la relación o en el panel de herramientas, selecciona **Convertir en Clase de Asociación** (o arrastra el conector especial desde la relación hacia la clase).
4. El motor gráfico de UmlStudio recalcula los puntos ortogonales para mantener la línea discontinua perpendicular incluso cuando mueves cualquiera de las tres clases en el canvas.
