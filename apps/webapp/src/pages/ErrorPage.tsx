import React from "react"
import { Link } from "@tanstack/react-router"
import { ChromeSubHeader } from "@/components/navbar/ChromeSubHeader"
import { PageShell } from "@/components/PageShell"
import { navbarButtonStyle } from "@/components/navbar/styleConstants"

type ErrorPageProps = {
  title?: string
  message?: string
  buttonLabel?: string
  backPath?: string
  withChrome?: boolean
}

export const ErrorPage: React.FC<ErrorPageProps> = ({
  title = "Oops!",
  message = "Something went wrong.",
  buttonLabel = "Back to all diagrams",
  backPath = "/",
  withChrome = true,
}) => {
  return (
    <PageShell
      header={withChrome ? <ChromeSubHeader /> : null}
      mainClassName="pb-[max(2.5rem,var(--safe-area-inset-bottom,0px))]"
    >
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-2 text-center">
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">{title}</h1>
        <p className="mt-2 max-w-prose text-base text-muted-foreground">{message}</p>
        <Link to={backPath} className={navbarButtonStyle("umlstudio-chrome-accent-btn mt-4")}>
          {buttonLabel}
        </Link>
      </div>
    </PageShell>
  )
}
