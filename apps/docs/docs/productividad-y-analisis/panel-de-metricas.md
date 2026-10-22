# Métricas de Calidad de Software Orientado a Objetos

UmlStudio integra un motor de análisis estático que calcula en tiempo real métricas reconocidas en la literatura de ingeniería de software (Chidamber & Kemerer) para evaluar la cohesión, acoplamiento y complejidad del diseño.

---

## Métricas Calculadas

| Métrica  | Nombre Completo                       | Interpretación y Umbral Recomendado                                                                     |
| -------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Ca**   | **Acoplamiento Aferente**             | Número de clases externas que dependen de esta clase. Un valor alto indica alta responsabilidad.        |
| **Ce**   | **Acoplamiento Eferente**             | Número de clases externas de las cuales depende esta clase. Un valor alto indica alta inestabilidad.    |
| **DIT**  | **Profundidad del Árbol de Herencia** | Longitud máxima desde la clase hasta la raíz de la jerarquía. Valores $> 5$ aumentan la fragilidad.     |
| **NOC**  | **Número de Hijos**                   | Cantidad de subclases inmediatas derivadas de la clase.                                                 |
| **WMC**  | **Complejidad de Métodos Ponderada**  | Suma de la complejidad de los métodos definidos en la clase.                                            |
| **LCOM** | **Falta de Cohesión en Métodos**      | Mide si los métodos comparten atributos comunes. Un LCOM alto sugiere dividir la clase (principio SRP). |

---

## Semáforo de Calidad Arquitectónica

El panel clasifica las clases mediante un código de colores intuitivo:

- **Verde**: Diseño balanceado, bajo acoplamiento y alta cohesión.
- **Amarillo**: Advertencia leve (por ejemplo, clase con más de 15 atributos o métodos).
- **Rojo (God Class / Clases Monstruo)**: Clases con excesivo acoplamiento y responsabilidades concentradas que requieren refactorización.
