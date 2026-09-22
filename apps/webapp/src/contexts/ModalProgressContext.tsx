import { createContext, type ReactNode, use, useMemo, useState } from "react"

type ModalProgressContextValue = {
  isLoading: boolean
  setLoading: (value: boolean) => void
}

const ModalProgressContext = createContext<ModalProgressContextValue | undefined>(undefined)

export const useModalProgress = () => {
  const context = use(ModalProgressContext)

  if (!context) {
    throw new Error("useModalProgress must be used within a ModalProgressProvider")
  }

  return context
}

export const ModalProgressProvider = ({ children }: { children: ReactNode }) => {
  const [isLoading, setIsLoading] = useState(false)
  const value = useMemo(
    () => ({
      isLoading,
      setLoading: setIsLoading,
    }),
    [isLoading]
  )

  return <ModalProgressContext value={value}>{children}</ModalProgressContext>
}
