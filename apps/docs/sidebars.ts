import type { SidebarsConfig } from "@docusaurus/plugin-content-docs"

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    {
      type: "category",
      label: "1. Introducción",
      collapsed: false,
      items: [
        "introduccion/index",
        "introduccion/navegadores-y-requisitos",
        "introduccion/conceptos-uml",
      ],
    },
    {
      type: "category",
      label: "2. Primeros Pasos",
      collapsed: false,
      items: ["primeros-pasos/inicio-rapido", "primeros-pasos/interfaz-de-usuario"],
    },
    {
      type: "category",
      label: "3. Modelado de Clases",
      items: [
        "modelado-de-clases/elementos",
        "modelado-de-clases/atributos-y-metodos",
        "modelado-de-clases/relaciones",
        "modelado-de-clases/clases-de-asociacion",
        "modelado-de-clases/gestion-de-diagramas",
      ],
    },
    {
      type: "category",
      label: "4. Colaboración en Tiempo Real",
      items: [
        "colaboracion/salas-compartidas",
        "colaboracion/presencia-y-cursores",
        "colaboracion/bloqueo-de-elementos",
        "colaboracion/modo-offline",
      ],
    },
    {
      type: "category",
      label: "5. Asistente de Inteligencia Artificial",
      items: [
        "asistente-ia/modelado-por-lenguaje-natural",
        "asistente-ia/diff-visual-y-revision",
        "asistente-ia/sugerencias-de-patrones",
        "asistente-ia/protocolo-mcp",
      ],
    },
    {
      type: "category",
      label: "6. Importar y Exportar",
      items: [
        "importar-exportar/exportacion-imagenes",
        "importar-exportar/importacion-vision",
        "importar-exportar/interoperabilidad-xmi",
      ],
    },
    {
      type: "category",
      label: "7. Generación de Código",
      items: ["generacion-de-codigo/spring-boot", "generacion-de-codigo/openapi-swagger"],
    },
    {
      type: "category",
      label: "8. Historial y Versionado",
      items: ["historial-y-versiones/snapshots", "historial-y-versiones/timeline-y-restauracion"],
    },
    {
      type: "category",
      label: "9. Productividad y Análisis",
      items: ["productividad-y-analisis/panel-de-metricas", "productividad-y-analisis/reportes"],
    },
    {
      type: "category",
      label: "10. Cuenta y Seguridad",
      items: ["cuenta-y-seguridad/perfil-de-usuario", "cuenta-y-seguridad/seguridad-y-contrasenas"],
    },
    {
      type: "category",
      label: "11. Atajos de Teclado",
      items: ["atajos-de-teclado/atajos"],
    },
    {
      type: "category",
      label: "12. Preguntas Frecuentes",
      items: ["preguntas-frecuentes/faq"],
    },
    {
      type: "category",
      label: "13. Solución de Problemas",
      items: ["solucion-de-problemas/troubleshooting"],
    },
  ],
}

export default sidebars
