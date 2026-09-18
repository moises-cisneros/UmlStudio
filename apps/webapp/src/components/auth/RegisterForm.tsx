import { useState, useMemo } from "react";
import { toast } from "react-toastify";
import {
  Check,
  Eye,
  EyeOff,
  Lock,
  Mail,
  User,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { Button } from "@umlstudio/ui/components/button";
import { Field, FieldError, FieldLabel } from "@umlstudio/ui/components/field";
import { Input } from "@umlstudio/ui/components/input";
import { AuthRegisterError, useAuthStore } from "@/stores/useAuthStore";
import { useTranslation } from "@/i18n";

interface RegisterFormProps {
  redirect?: string;
  onSuccess: () => void;
}

export function RegisterForm({ redirect, onSuccess }: RegisterFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [duplicate, setDuplicate] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loginHref = redirect
    ? `/login?redirect=${encodeURIComponent(redirect)}`
    : "/login";

  // Password rules validation (OMG UML 2.5 studio policy)
  const passwordRules = useMemo(() => {
    return {
      hasMinLen: password.length >= 8,
      hasLetterAndDigit: /[a-zA-Z]/.test(password) && /\d/.test(password),
      hasSymbol: /[^a-zA-Z0-9]/.test(password),
    };
  }, [password]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setDuplicate(false);
    try {
      await useAuthStore
        .getState()
        .register(name.trim(), email.trim(), password);
      onSuccess();
    } catch (err) {
      if (err instanceof AuthRegisterError && err.status === 409) {
        setDuplicate(true);
        return;
      }
      if (
        err instanceof AuthRegisterError &&
        err.status === 400 &&
        err.fields
      ) {
        setFieldErrors(err.fields);
        const [field, message] = Object.entries(err.fields)[0] ?? [];
        toast.error(
          field ? `Invalid ${field}: ${message}` : "Invalid registration data",
        );
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : t.auth.registrationFailed;
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="register-name" className="text-xs font-semibold">
          {t.auth.nameLabel}
        </FieldLabel>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
            <User className="size-4" />
          </div>
          <Input
            id="register-name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t.auth.namePlaceholder}
            className="pl-9 text-sm"
          />
        </div>
        {fieldErrors.name ? <FieldError>{fieldErrors.name}</FieldError> : null}
      </Field>

      <Field>
        <FieldLabel htmlFor="register-email" className="text-xs font-semibold">
          {t.auth.emailLabel}
        </FieldLabel>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
            <Mail className="size-4" />
          </div>
          <Input
            id="register-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t.auth.emailPlaceholder}
            className="pl-9 text-sm"
          />
        </div>
        {fieldErrors.email ? (
          <FieldError>{fieldErrors.email}</FieldError>
        ) : null}
      </Field>

      <Field>
        <FieldLabel htmlFor="register-password" className="text-xs font-semibold">
          {t.auth.passwordLabel}
        </FieldLabel>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
            <Lock className="size-4" />
          </div>
          <Input
            id="register-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
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
        {fieldErrors.password ? (
          <FieldError>{fieldErrors.password}</FieldError>
        ) : null}

        {/* Dynamic password requirements badges */}
        {password.length > 0 && (
          <div className="mt-2 flex flex-col gap-1 rounded-lg border border-border-subtle bg-surface-raised/50 p-2.5 text-[11px]">
            <span className="font-semibold text-muted-foreground">
              {t.auth.passwordRequirements}
            </span>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
              <div
                className={`flex items-center gap-1.5 ${passwordRules.hasMinLen ? "text-emerald-500 font-medium" : "text-muted-foreground"}`}
              >
                <Check
                  className={`size-3.5 ${passwordRules.hasMinLen ? "opacity-100" : "opacity-30"}`}
                />
                <span>{t.auth.reqMinLength}</span>
              </div>
              <div
                className={`flex items-center gap-1.5 ${passwordRules.hasLetterAndDigit ? "text-emerald-500 font-medium" : "text-muted-foreground"}`}
              >
                <Check
                  className={`size-3.5 ${passwordRules.hasLetterAndDigit ? "opacity-100" : "opacity-30"}`}
                />
                <span>{t.auth.reqLettersAndDigits}</span>
              </div>
              <div
                className={`flex items-center gap-1.5 ${passwordRules.hasSymbol ? "text-emerald-500 font-medium" : "text-muted-foreground"}`}
              >
                <Check
                  className={`size-3.5 ${passwordRules.hasSymbol ? "opacity-100" : "opacity-30"}`}
                />
                <span>{t.auth.reqSymbol}</span>
              </div>
            </div>
          </div>
        )}
      </Field>

      {duplicate ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500"
        >
          <span>{t.auth.duplicateEmail}</span>
          <a
            href={loginHref}
            className="font-bold underline underline-offset-4 hover:text-amber-400"
          >
            {t.auth.signInNow}
          </a>
        </div>
      ) : null}

      <Button
        type="submit"
        disabled={submitting}
        className="group relative mt-1 flex w-full items-center justify-center gap-2 overflow-hidden bg-(--dodger-blue) font-semibold text-white shadow-md transition-all hover:bg-(--dodger-blue)/90 hover:shadow-lg"
      >
        <span>{submitting ? t.auth.creatingAccount : t.auth.registerButton}</span>
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </Button>

      <div className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Sparkles className="size-3 text-(--deep-sky-blue)" />
        <span>{t.auth.registerSubtitle}</span>
      </div>

      <div className="mt-1 text-center text-xs text-muted-foreground">
        {t.auth.hasAccount}{" "}
        <a
          href={loginHref}
          className="font-semibold text-(--dodger-blue) underline-offset-4 hover:underline"
        >
          {t.auth.loginLink}
        </a>
      </div>
    </form>
  );
}
