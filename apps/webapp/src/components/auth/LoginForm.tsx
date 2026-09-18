import { useState } from "react";
import { toast } from "react-toastify";
import { Eye, EyeOff, Lock, Mail, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@umlstudio/ui/components/button";
import { Field, FieldError, FieldLabel } from "@umlstudio/ui/components/field";
import { Input } from "@umlstudio/ui/components/input";
import { useAuthStore } from "@/stores/useAuthStore";
import { useTranslation } from "@/i18n";

interface LoginFormProps {
  redirect?: string;
  onSuccess: () => void;
}

const DEMO_ACCOUNTS = [
  {
    label: "Admin",
    email: "admin@umlstudio.com",
    password: "UmlStudio#2026",
    roleKey: "leadModeler" as const,
  },
  {
    label: "Modeler",
    email: "modeler@umlstudio.com",
    password: "UmlStudio#2026",
    roleKey: "collabModeler" as const,
  },
  {
    label: "Reviewer",
    email: "alice@umlstudio.com",
    password: "UmlStudio#2026",
    roleKey: "reviewer" as const,
  },
];

export function LoginForm({ redirect, onSuccess }: LoginFormProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const registerHref = redirect
    ? `/register?redirect=${encodeURIComponent(redirect)}`
    : "/register";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await useAuthStore.getState().login(email.trim(), password);
      onSuccess();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : t.auth.invalidCredentials;
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleQuickFill(demo: (typeof DEMO_ACCOUNTS)[number]) {
    setEmail(demo.email);
    setPassword(demo.password);
    setError(null);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Quick-fill demo accounts */}
      <div className="rounded-xl border border-border-subtle bg-surface-raised/60 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          <Sparkles className="size-3 text-(--dodger-blue)" />
          <span>{t.auth.quickDemoTitle}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DEMO_ACCOUNTS.map((demo) => {
            const roleLabel = t.auth[demo.roleKey];
            return (
              <button
                key={demo.email}
                type="button"
                onClick={() => handleQuickFill(demo)}
                className="group flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface px-2.5 py-1 text-xs font-medium text-foreground transition-all hover:border-(--dodger-blue) hover:bg-(--dodger-blue)/10"
                title={`${demo.label} (${roleLabel}): ${demo.email}`}
              >
                <span className="font-semibold text-(--dodger-blue)">
                  {demo.label}
                </span>
                <span className="text-[11px] text-muted-foreground group-hover:text-foreground">
                  ({roleLabel})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Field>
        <FieldLabel htmlFor="login-email" className="text-xs font-semibold">
          {t.auth.emailLabel}
        </FieldLabel>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
            <Mail className="size-4" />
          </div>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t.auth.emailPlaceholder}
            className="pl-9 text-sm"
          />
        </div>
      </Field>

      <Field>
        <div className="flex items-center justify-between">
          <FieldLabel
            htmlFor="login-password"
            className="text-xs font-semibold"
          >
            {t.auth.passwordLabel}
          </FieldLabel>
        </div>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
            <Lock className="size-4" />
          </div>
          <Input
            id="login-password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t.auth.passwordPlaceholder}
            className="pr-10 pl-9 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground focus:outline-none"
            aria-label={showPassword ? t.auth.hidePassword : t.auth.showPassword}
          >
            {showPassword ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
      </Field>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <FieldError className="text-destructive">{error}</FieldError>
        </div>
      ) : null}

      <Button
        type="submit"
        disabled={submitting}
        className="group relative mt-1 flex w-full items-center justify-center gap-2 overflow-hidden bg-(--dodger-blue) font-semibold text-white shadow-md transition-all hover:bg-(--dodger-blue)/90 hover:shadow-lg"
      >
        <span>{submitting ? t.auth.authenticating : t.auth.loginButton}</span>
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </Button>

      <div className="mt-2 text-center text-xs text-muted-foreground">
        {t.auth.noAccount}{" "}
        <a
          href={registerHref}
          className="font-semibold text-(--dodger-blue) underline-offset-4 hover:underline"
        >
          {t.auth.createAccountLink}
        </a>
      </div>
    </form>
  );
}
