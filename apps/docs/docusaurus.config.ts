import { themes as prismThemes } from "prism-react-renderer"
import type { Config } from "@docusaurus/types"
import type * as Preset from "@docusaurus/preset-classic"

const config: Config = {
  title: "UmlStudio",
  tagline: "Estudio Profesional de Modelado de Diagramas de Clases OMG UML 2.5",
  favicon: "img/favicon.ico",

  // URL de producción donde vive la app
  url: "https://umlstudio.com",
  baseUrl: "/docs/",

  organizationName: "umlstudio",
  projectName: "umlstudio",

  onBrokenLinks: "warn",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn",
    },
  },

  i18n: {
    defaultLocale: "es",
    locales: ["es"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          routeBasePath: "/",
          editUrl: undefined,
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/umlstudio-social-card.jpg",
    navbar: {
      title: "UmlStudio Docs",
      logo: {
        alt: "UmlStudio Logo",
        src: "img/logo.svg",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "tutorialSidebar",
          position: "left",
          label: "Manual de Usuario",
        },
        {
          to: "/atajos-de-teclado/atajos",
          label: "Atajos de Teclado",
          position: "left",
        },
        {
          to: "/preguntas-frecuentes/faq",
          label: "FAQ",
          position: "left",
        },
        {
          href: "/",
          label: "Volver a UmlStudio",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Documentación",
          items: [
            {
              label: "Primeros Pasos",
              to: "/primeros-pasos/inicio-rapido",
            },
            {
              label: "Modelado UML 2.5",
              to: "/modelado-de-clases/elementos",
            },
            {
              label: "Colaboración en Vivo",
              to: "/colaboracion/salas-compartidas",
            },
          ],
        },
        {
          title: "Capacidades Avanzadas",
          items: [
            {
              label: "Asistente de IA & MCP",
              to: "/asistente-ia/modelado-por-lenguaje-natural",
            },
            {
              label: "Generación Spring Boot & OpenAPI",
              to: "/generacion-de-codigo/spring-boot",
            },
            {
              label: "Interoperabilidad XMI",
              to: "/importar-exportar/interoperabilidad-xmi",
            },
          ],
        },
        {
          title: "Soporte y Referencia",
          items: [
            {
              label: "Atajos de Teclado",
              to: "/atajos-de-teclado/atajos",
            },
            {
              label: "Preguntas Frecuentes",
              to: "/preguntas-frecuentes/faq",
            },
            {
              label: "Diagnóstico y Problemas",
              to: "/solucion-de-problemas/troubleshooting",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} UmlStudio. Construido con Docusaurus para ingeniería de software.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["java", "json", "bash", "yaml"],
    },
  } satisfies Preset.ThemeConfig,
}

export default config
