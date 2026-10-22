import type { ReactNode } from "react"
import Link from "@docusaurus/Link"
import useDocusaurusContext from "@docusaurus/useDocusaurusContext"
import Layout from "@theme/Layout"
import Heading from "@theme/Heading"
import {
  Layers,
  Users,
  Sparkles,
  Code2,
  Share2,
  Keyboard,
  ArrowRight,
  BookOpen,
} from "lucide-react"

type FeatureItem = {
  title: string
  icon: ReactNode
  description: string
  link: string
}

const FeatureList: FeatureItem[] = [
  {
    title: "Primeros Pasos",
    icon: <BookOpen className="size-6 text-sky-500" />,
    description:
      "Aprende a registrarte, recorrer la interfaz y crear tu primer diagrama de clases en menos de 5 minutos.",
    link: "/primeros-pasos/inicio-rapido",
  },
  {
    title: "Modelado UML 2.5",
    icon: <Layers className="size-6 text-indigo-500" />,
    description:
      "Clases, interfaces, enums, paquetes, herencia, composiciones y clases de asociación con validación semántica.",
    link: "/modelado-de-clases/elementos",
  },
  {
    title: "Colaboración en Vivo",
    icon: <Users className="size-6 text-emerald-500" />,
    description:
      "Edición simultánea multiusuario con CRDTs Yjs, bloqueo fino de elementos (object locking) y presencia real.",
    link: "/colaboracion/salas-compartidas",
  },
  {
    title: "Asistente de IA & MCP",
    icon: <Sparkles className="size-6 text-amber-500" />,
    description:
      "Modelado interactivo por lenguaje natural (texto y voz), diff visual de cambios y servidor FastMCP para agentes.",
    link: "/asistente-ia/modelado-por-lenguaje-natural",
  },
  {
    title: "Generación de Código",
    icon: <Code2 className="size-6 text-purple-500" />,
    description:
      "Generación instantánea de backend Spring Boot 3.x con JPA/PostgreSQL y especificaciones OpenAPI 3.0 interactivas.",
    link: "/generacion-de-codigo/spring-boot",
  },
  {
    title: "Atajos de Teclado",
    icon: <Keyboard className="size-6 text-rose-500" />,
    description:
      "Catálogo completo de atajos de teclado para modeladores profesionales. Acelera tu flujo de trabajo al máximo.",
    link: "/atajos-de-teclado/atajos",
  },
]

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext()
  return (
    <header className="hero hero--primary py-16 px-4 text-center">
      <div className="container max-w-4xl mx-auto">
        <Heading as="h1" className="hero__title text-4xl sm:text-5xl font-extrabold mb-4">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle text-lg sm:text-xl text-slate-300 mb-8 max-w-2xl mx-auto">
          {siteConfig.tagline}
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link
            className="button button--primary button--lg flex items-center gap-2 shadow-lg"
            to="/primeros-pasos/inicio-rapido"
          >
            Comenzar la Guía
            <ArrowRight className="size-4" />
          </Link>
          <Link
            className="button button--secondary button--lg flex items-center gap-2"
            to="/atajos-de-teclado/atajos"
          >
            Ver Atajos de Teclado
          </Link>
        </div>
      </div>
    </header>
  )
}

export default function Home(): ReactNode {
  return (
    <Layout
      title="Manual Oficial"
      description="Documentación completa y manual de usuario para el modelador de clases OMG UML 2.5 UmlStudio."
    >
      <HomepageHeader />
      <main className="py-12 px-4">
        <div className="container max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FeatureList.map((props, idx) => (
              <Link
                key={idx}
                to={props.link}
                className="card p-6 no-underline text-inherit flex flex-col justify-between"
              >
                <div>
                  <div className="mb-4 inline-flex p-3 rounded-xl bg-slate-100 dark:bg-slate-800">
                    {props.icon}
                  </div>
                  <Heading as="h3" className="text-xl font-bold mb-2">
                    {props.title}
                  </Heading>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {props.description}
                  </p>
                </div>
                <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-sky-500">
                  <span>Leer sección</span>
                  <ArrowRight className="size-3.5" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </Layout>
  )
}
