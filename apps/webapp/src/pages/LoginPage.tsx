import { useNavigate } from "@tanstack/react-router"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@umlstudio/ui/components/card"
import { Badge } from "@umlstudio/ui/components/badge"
import { LoginForm } from "@/components/auth/LoginForm"
import { safeRedirectTarget } from "@/components/auth/redirect"
import { BrandLockup } from "@/components/navbar/BrandLockup"
import { ThemeSwitcherMenu } from "@/components/navbar/ThemeSwitcher"
import { LanguageSwitcher } from "@/components/navbar/LanguageSwitcher"
import { useTranslation } from "@/i18n"
import { Layers, ShieldCheck, Zap, Users } from "lucide-react"

interface LoginPageProps {
  redirect?: string
}

export function LoginPage({ redirect }: LoginPageProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()

  function handleSuccess() {
    void navigate({ to: safeRedirectTarget(redirect) as "/", replace: true })
  }

  return (
    <div className="relative flex min-h-screen flex-col justify-between bg-background text-foreground selection:bg-(--dodger-blue)/30 selection:text-(--dodger-blue)">
      {/* Ambient background glow & technical grid */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] size-150 rounded-full bg-(--dodger-blue)/10 blur-[130px]" />
        <div className="absolute top-[60%] right-[-10%] size-125 rounded-full bg-(--deep-sky-blue)/10 blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(var(--border-subtle)_1px,transparent_1px)] bg-size-[24px_24px] opacity-25" />
      </div>

      {/* Top navigation header */}
      <header className="z-10 flex items-center justify-between border-b border-border-subtle/60 bg-surface/60 px-6 py-3.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <BrandLockup />
          <Badge
            variant="outline"
            className="hidden border-(--dodger-blue)/30 bg-(--dodger-blue)/10 text-[11px] font-semibold text-(--dodger-blue) sm:inline-flex"
          >
            OMG UML 2.5
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeSwitcherMenu />
        </div>
      </header>

      {/* Main hero & auth container */}
      <main className="z-10 flex flex-1 items-center justify-center px-4 py-8 md:px-8">
        <div className="mx-auto grid w-full max-w-5xl items-center gap-10 lg:grid-cols-12 lg:gap-14">
          {/* Left Hero showcase (hidden on small screens) */}
          <div className="hidden flex-col gap-6 lg:col-span-6 lg:flex">
            <div className="flex items-center gap-2">
              <span className="flex size-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20 animate-pulse" />
              <span className="text-xs font-semibold tracking-wider text-(--dodger-blue) uppercase">
                {t.auth.precisionStudio}
              </span>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl lg:text-5xl leading-tight">
                {t.auth.loginTitle}{" "}
                <span className="bg-linear-to-r from-(--dodger-blue) via-(--deep-sky-blue) to-(--baby-blue-ice) bg-clip-text text-transparent">
                  {t.auth.loginTitleHighlight}
                </span>
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t.auth.loginDescription}
              </p>
            </div>

            {/* Interactive Mock UML Class Node preview */}
            <div className="relative rounded-xl border border-border bg-surface-raised/80 p-4 shadow-xl backdrop-blur-md">
              <div className="absolute -top-3 right-4 rounded-full border border-(--dodger-blue)/40 bg-(--dodger-blue) px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                {t.auth.liveBlueprint}
              </div>

              {/* UML Node Representation */}
              <div className="rounded-lg border border-(--dodger-blue)/60 bg-surface text-xs font-mono shadow-sm">
                <div className="border-b border-border-subtle bg-(--dodger-blue)/10 px-3 py-2 text-center">
                  <div className="text-[10px] italic text-(--periwinkle)">
                    &laquo;interface&raquo;
                  </div>
                  <div className="font-bold text-(--dodger-blue)">AuthManager</div>
                </div>
                <div className="border-b border-border-subtle px-3 py-2 space-y-1 text-muted-foreground">
                  <div>
                    <span className="font-bold text-rose-400">-</span> session:{" "}
                    <span className="text-foreground">JWTAccessToken</span>
                  </div>
                  <div>
                    <span className="font-bold text-rose-400">-</span> role:{" "}
                    <span className="text-foreground">ModelerRole</span>
                  </div>
                </div>
                <div className="px-3 py-2 space-y-1 text-muted-foreground">
                  <div>
                    <span className="font-bold text-emerald-400">+</span> authenticate():{" "}
                    <span className="text-foreground">Promise&lt;User&gt;</span>
                  </div>
                  <div>
                    <span className="font-bold text-emerald-400">+</span> collaborate():{" "}
                    <span className="text-foreground">CRDTStream</span>
                  </div>
                </div>
              </div>

              {/* Feature pills below */}
              <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] font-medium text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Zap className="size-3.5 text-amber-400" />
                  <span>Sub-millisecond Yjs Sync</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="size-3.5 text-(--deep-sky-blue)" />
                  <span>Presence & Awareness</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Layers className="size-3.5 text-(--periwinkle)" />
                  <span>Strict UML 2.5 Metamodel</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 text-emerald-400" />
                  <span>Redis & JWT Session Gate</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Login Card */}
          <div className="lg:col-span-6 flex justify-center">
            <Card className="w-full max-w-md border-border/80 bg-surface/90 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-1.5 pb-4">
                <CardTitle className="text-xl font-bold tracking-tight">
                  {t.auth.welcomeBack}
                </CardTitle>
                <CardDescription className="text-xs">{t.auth.signInSubtitle}</CardDescription>
              </CardHeader>
              <CardContent>
                <LoginForm redirect={redirect} onSuccess={handleSuccess} />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border-subtle/60 py-3 text-center text-xs text-muted-foreground">
        <p>UmlStudio &copy; 2026 — Formal Object-Oriented Software Architecture Studio</p>
      </footer>
    </div>
  )
}
