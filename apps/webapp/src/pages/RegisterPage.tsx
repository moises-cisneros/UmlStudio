import { useNavigate } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@umlstudio/ui/components/card";
import { Badge } from "@umlstudio/ui/components/badge";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { safeRedirectTarget } from "@/components/auth/redirect";
import { BrandLockup } from "@/components/navbar/BrandLockup";
import { ThemeSwitcherMenu } from "@/components/navbar/ThemeSwitcher";
import { LanguageSwitcher } from "@/components/navbar/LanguageSwitcher";
import { useTranslation } from "@/i18n";
import { CheckCircle2, Sparkles, Cpu, GitBranch } from "lucide-react";

interface RegisterPageProps {
  redirect?: string;
}

export function RegisterPage({ redirect }: RegisterPageProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  function handleSuccess() {
    void navigate({ to: safeRedirectTarget(redirect) as "/", replace: true });
  }

  return (
    <div className="relative flex min-h-screen flex-col justify-between bg-background text-foreground selection:bg-(--dodger-blue)/30 selection:text-(--dodger-blue)">
      {/* Ambient background glow & technical grid */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-[-15%] right-[-10%] size-150 rounded-full bg-(--deep-sky-blue)/10 blur-[130px]" />
        <div className="absolute top-[50%] left-[-10%] size-125 rounded-full bg-(--dodger-blue)/10 blur-[140px]" />
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
          {/* Left Hero showcase */}
          <div className="hidden flex-col gap-6 lg:col-span-6 lg:flex">
            <div className="flex items-center gap-2">
              <span className="flex size-2 rounded-full bg-(--dodger-blue) ring-4 ring-(--dodger-blue)/20 animate-pulse" />
              <span className="text-xs font-semibold tracking-wider text-(--dodger-blue) uppercase">
                {t.auth.precisionStudio}
              </span>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl lg:text-5xl leading-tight">
                {t.auth.registerTitle}{" "}
                <span className="bg-linear-to-r from-(--dodger-blue) via-(--deep-sky-blue) to-(--baby-blue-ice) bg-clip-text text-transparent">
                  {t.auth.registerTitleHighlight}
                </span>
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t.auth.registerDescription}
              </p>
            </div>

            {/* Showcase card */}
            <div className="relative rounded-xl border border-border bg-surface-raised/80 p-5 shadow-xl backdrop-blur-md">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">
                  UmlStudio Core:
                </span>
                <Sparkles className="size-4 text-(--dodger-blue)" />
              </div>

              <ul className="space-y-3 text-xs text-muted-foreground">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-500 mt-0.5" />
                  <span>
                    <strong className="text-foreground">OMG UML 2.5</strong>: Classes, Interfaces, Enums, Packages, Association Classes.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <GitBranch className="size-4 shrink-0 text-(--dodger-blue) mt-0.5" />
                  <span>
                    <strong className="text-foreground">CRDT Yjs & Snapshots</strong>: Real-time collaboration and immutable version history.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Cpu className="size-4 shrink-0 text-(--deep-sky-blue) mt-0.5" />
                  <span>
                    <strong className="text-foreground">XMI & Code Generation</strong>: Enterprise Architect interoperability and Spring Boot.
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* Right Column: Register Card */}
          <div className="lg:col-span-6 flex justify-center">
            <Card className="w-full max-w-md border-border/80 bg-surface/90 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-1.5 pb-4">
                <CardTitle className="text-xl font-bold tracking-tight">
                  {t.auth.getStarted}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t.auth.registerSubtitle}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RegisterForm redirect={redirect} onSuccess={handleSuccess} />
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
  );
}
