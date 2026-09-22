import { useState, type FormEvent } from "react"
import {
  User,
  ShieldCheck,
  Check,
  Eye,
  EyeOff,
  Palette,
  KeyRound,
  AlertCircle,
  CheckCircle2,
} from "lucide-react"
import { useAuthStore } from "@/stores/useAuthStore"
import { useTranslation } from "@/i18n"
import { Button } from "@umlstudio/ui/components/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@umlstudio/ui/components/tabs"
import { cn } from "@umlstudio/ui/lib/utils"

const PRESENCE_PALETTE = [
  "#3590F3", // Dodger blue
  "#7C5CFF", // Purple
  "#22B07D", // Emerald
  "#F35959", // Rose
  "#F5A524", // Amber
  "#EC4899", // Pink
  "#14B8A6", // Teal
  "#F97316", // Orange
]

interface UserProfileModalProps {
  onClose?: () => void
}

export function UserProfileModal({ onClose }: UserProfileModalProps) {
  const { user, updateProfile, changePassword } = useAuthStore()
  const { t } = useTranslation()

  // Profile tab state
  const [name, setName] = useState(user?.name ?? "")
  const [selectedColor, setSelectedColor] = useState(user?.color ?? PRESENCE_PALETTE[0]!)
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null)
  const [profileErrorMsg, setProfileErrorMsg] = useState<string | null>(null)

  // Security tab state
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [passwordSuccessMsg, setPasswordSuccessMsg] = useState<string | null>(null)
  const [passwordErrorMsg, setPasswordErrorMsg] = useState<string | null>(null)

  // Password rules validation
  const hasMinLength = newPassword.length >= 8
  const hasLetters = /[A-Za-z]/.test(newPassword)
  const hasDigits = /[0-9]/.test(newPassword)
  const hasSymbol = /[^A-Za-z0-9]/.test(newPassword)
  const isPolicySatisfied = hasMinLength && hasLetters && hasDigits && hasSymbol
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setIsUpdatingProfile(true)
    setProfileSuccessMsg(null)
    setProfileErrorMsg(null)

    try {
      await updateProfile({
        name: name.trim(),
        color: selectedColor,
      })
      setProfileSuccessMsg(t.profile.profileUpdatedToast)
      setTimeout(() => setProfileSuccessMsg(null), 4000)
    } catch (err: unknown) {
      setProfileErrorMsg(err instanceof Error ? err.message : "Failed to update profile")
    } finally {
      setIsUpdatingProfile(false)
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault()
    if (!currentPassword || !isPolicySatisfied || !passwordsMatch) return

    setIsChangingPassword(true)
    setPasswordSuccessMsg(null)
    setPasswordErrorMsg(null)

    try {
      await changePassword(currentPassword, newPassword)
      setPasswordSuccessMsg(t.profile.passwordUpdatedToast)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setTimeout(() => setPasswordSuccessMsg(null), 4000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to change password"
      if (msg.includes("Invalid current password")) {
        setPasswordErrorMsg(t.profile.wrongCurrentPassword)
      } else if (msg.includes("at least 8") || msg.includes("letter") || msg.includes("symbol")) {
        setPasswordErrorMsg(t.profile.weakPassword)
      } else {
        setPasswordErrorMsg(msg)
      }
    } finally {
      setIsChangingPassword(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 text-foreground">
      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-2 rounded-xl border border-border/50 bg-muted/60 p-1">
          <TabsTrigger
            value="profile"
            className="flex items-center gap-2 rounded-lg text-xs font-semibold"
          >
            <User className="size-3.5" />
            <span>{t.profile.tabProfile}</span>
          </TabsTrigger>
          <TabsTrigger
            value="security"
            className="flex items-center gap-2 rounded-lg text-xs font-semibold"
          >
            <ShieldCheck className="size-3.5" />
            <span>{t.profile.tabSecurity}</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Profile Information */}
        <TabsContent value="profile" className="flex flex-col gap-4 pt-3">
          <form onSubmit={handleProfileSubmit} className="flex flex-col gap-4">
            {profileSuccessMsg && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>{profileSuccessMsg}</span>
              </div>
            )}

            {profileErrorMsg && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                <span>{profileErrorMsg}</span>
              </div>
            )}

            {/* Email Field (Readonly) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t.profile.email}</label>
              <input
                type="email"
                value={user?.email ?? ""}
                readOnly
                disabled
                className="h-9 w-full rounded-lg border border-border/50 bg-muted/30 px-3 text-xs text-muted-foreground cursor-not-allowed select-none opacity-80"
              />
              <span className="text-[11px] text-muted-foreground/80">
                {t.profile.emailReadonlyHint}
              </span>
            </div>

            {/* Display Name Field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">{t.profile.displayName}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.profile.displayNamePlaceholder}
                required
                className="h-9 w-full rounded-lg border border-border/80 bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-(--dodger-blue) focus:outline-none focus:ring-2 focus:ring-(--dodger-blue)/20 transition-all"
              />
            </div>

            {/* Presence Color Selector */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <Palette className="size-3.5 text-(--dodger-blue)" />
                <label className="text-xs font-medium text-foreground">
                  {t.profile.cursorColor}
                </label>
              </div>
              <span className="text-[11px] text-muted-foreground leading-snug">
                {t.profile.cursorColorDesc}
              </span>
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                {PRESENCE_PALETTE.map((color) => {
                  const isSelected = selectedColor.toLowerCase() === color.toLowerCase()
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setSelectedColor(color)}
                      aria-label={`Select color ${color}`}
                      className={cn(
                        "relative size-7 rounded-full transition-transform hover:scale-110 focus:outline-none cursor-pointer shadow-xs",
                        isSelected
                          ? "ring-2 ring-foreground ring-offset-2 ring-offset-background scale-105"
                          : "opacity-85 hover:opacity-100"
                      )}
                      style={{ backgroundColor: color }}
                    >
                      {isSelected && (
                        <Check className="absolute inset-0 m-auto size-3.5 text-white stroke-[2.5]" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              {onClose && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  className="rounded-xl text-xs"
                >
                  {t.common.cancel}
                </Button>
              )}
              <Button
                type="submit"
                variant="default"
                size="sm"
                disabled={isUpdatingProfile || !name.trim()}
                className="rounded-xl bg-(--dodger-blue) text-xs font-semibold text-white hover:bg-(--dodger-blue)/90 cursor-pointer shadow-xs"
              >
                {isUpdatingProfile ? t.profile.saving : t.profile.saveProfile}
              </Button>
            </div>
          </form>
        </TabsContent>

        {/* Tab 2: Security & Password Change */}
        <TabsContent value="security" className="flex flex-col gap-4 pt-3">
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
            {passwordSuccessMsg && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>{passwordSuccessMsg}</span>
              </div>
            )}

            {passwordErrorMsg && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                <span>{passwordErrorMsg}</span>
              </div>
            )}

            {/* Current Password Field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">
                {t.profile.currentPassword}
              </label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={t.profile.currentPasswordPlaceholder}
                  required
                  className="h-9 w-full rounded-lg border border-border/80 bg-background px-3 pr-9 text-xs text-foreground placeholder:text-muted-foreground focus:border-(--dodger-blue) focus:outline-none focus:ring-2 focus:ring-(--dodger-blue)/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  aria-label={showCurrentPassword ? t.auth.hidePassword : t.auth.showPassword}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {showCurrentPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {/* New Password Field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">{t.profile.newPassword}</label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t.profile.newPasswordPlaceholder}
                  required
                  className="h-9 w-full rounded-lg border border-border/80 bg-background px-3 pr-9 text-xs text-foreground placeholder:text-muted-foreground focus:border-(--dodger-blue) focus:outline-none focus:ring-2 focus:ring-(--dodger-blue)/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  aria-label={showNewPassword ? t.auth.hidePassword : t.auth.showPassword}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>

              {/* Password Policy Validation Badges */}
              <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
                <span
                  className={cn(
                    "flex items-center gap-1 transition-colors",
                    hasMinLength ? "text-emerald-500 font-medium" : "text-muted-foreground"
                  )}
                >
                  <Check className={cn("size-3", hasMinLength ? "opacity-100" : "opacity-30")} />
                  <span>{t.auth.reqMinLength}</span>
                </span>
                <span
                  className={cn(
                    "flex items-center gap-1 transition-colors",
                    hasLetters && hasDigits
                      ? "text-emerald-500 font-medium"
                      : "text-muted-foreground"
                  )}
                >
                  <Check
                    className={cn("size-3", hasLetters && hasDigits ? "opacity-100" : "opacity-30")}
                  />
                  <span>{t.auth.reqLettersAndDigits}</span>
                </span>
                <span
                  className={cn(
                    "flex items-center gap-1 col-span-2 transition-colors",
                    hasSymbol ? "text-emerald-500 font-medium" : "text-muted-foreground"
                  )}
                >
                  <Check className={cn("size-3", hasSymbol ? "opacity-100" : "opacity-30")} />
                  <span>{t.auth.reqSymbol}</span>
                </span>
              </div>
            </div>

            {/* Confirm New Password Field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">
                {t.profile.confirmPassword}
              </label>
              <input
                type={showNewPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t.profile.confirmPasswordPlaceholder}
                required
                className={cn(
                  "h-9 w-full rounded-lg border bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-all",
                  confirmPassword && !passwordsMatch
                    ? "border-destructive focus:border-destructive focus:ring-destructive/20"
                    : "border-border/80 focus:border-(--dodger-blue) focus:ring-(--dodger-blue)/20"
                )}
              />
              {confirmPassword && !passwordsMatch && (
                <span className="text-[11px] text-destructive font-medium">
                  {t.profile.passwordMismatch}
                </span>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              {onClose && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  className="rounded-xl text-xs"
                >
                  {t.common.cancel}
                </Button>
              )}
              <Button
                type="submit"
                variant="default"
                size="sm"
                disabled={
                  isChangingPassword || !currentPassword || !isPolicySatisfied || !passwordsMatch
                }
                className="rounded-xl bg-(--dodger-blue) text-xs font-semibold text-white hover:bg-(--dodger-blue)/90 cursor-pointer shadow-xs"
              >
                <KeyRound className="size-3.5 mr-1" />
                <span>
                  {isChangingPassword ? t.profile.updatingPassword : t.profile.changePasswordBtn}
                </span>
              </Button>
            </div>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  )
}
