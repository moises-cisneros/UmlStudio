import React, { ReactNode } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { EditorProvider, ModalProvider } from "@/contexts"
import { queryClient } from "@/queryClient"

interface Props {
  children: ReactNode
}

const SHOW_QUERY_DEVTOOLS =
  import.meta.env.DEV &&
  (() => {
    try {
      return localStorage.getItem("umlstudio:query-devtools") === "1"
    } catch {
      return false
    }
  })()

export const AppProviders: React.FC<Props> = ({ children }) => {
  return (
    <QueryClientProvider client={queryClient}>
      <EditorProvider>
        <ModalProvider>{children}</ModalProvider>
      </EditorProvider>
      {SHOW_QUERY_DEVTOOLS && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  )
}
