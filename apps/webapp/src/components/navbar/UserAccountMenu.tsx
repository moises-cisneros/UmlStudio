import { useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@umlstudio/ui/components/dropdown-menu";
import { Button } from "@umlstudio/ui/components/button";
import { useAuthStore } from "@/stores/useAuthStore";
import { useTranslation } from "@/i18n";

interface UserAccountMenuProps {
  variant?: "navbar" | "home";
}

export function UserAccountMenu({ variant = "navbar" }: UserAccountMenuProps) {
  const { user, status, logout } = useAuthStore();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  if (status !== "authenticated" || !user) {
    return (
      <div className="flex items-center gap-1.5">
        <Link to="/login">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs font-medium text-foreground hover:bg-surface-raised"
          >
            {t.auth.accountMenuLogin}
          </Button>
        </Link>
        <Link to="/register">
          <Button
            variant="default"
            size="sm"
            className="bg-(--dodger-blue) text-xs font-semibold text-white hover:bg-(--dodger-blue)/90"
          >
            {t.auth.accountMenuSignUp}
          </Button>
        </Link>
      </div>
    );
  }

  const initials = user.name
    ? user.name
        .split(" ")
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "U";

  const userColor = user.color || "#3590F3";

  async function handleLogout() {
    setIsOpen(false);
    await logout();
    void navigate({ to: "/login", replace: true });
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`${t.auth.userMenuAria}: ${user.name}`}
            className="group flex items-center gap-2 rounded-full p-0.5 transition-opacity hover:opacity-85 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--dodger-blue)"
          >
            <div
              className="flex size-7 items-center justify-center rounded-full text-xs font-bold text-white shadow-xs"
              style={{ backgroundColor: userColor }}
              title={`${user.name} (${user.email})`}
            >
              {initials}
            </div>
            {variant === "home" && (
              <span className="hidden text-xs font-medium text-(--home-text-primary) sm:inline max-w-28 truncate">
                {user.name}
              </span>
            )}
          </button>
        }
      />
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-56 rounded-xl border border-border bg-popover p-1.5 shadow-lg"
      >
        <div className="flex items-center gap-2.5 px-2.5 py-2">
          <div
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-xs"
            style={{ backgroundColor: userColor }}
          >
            {initials}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="truncate text-xs font-semibold text-popover-foreground">
              {user.name}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {user.email}
            </span>
          </div>
        </div>

        <DropdownMenuSeparator className="my-1 bg-border" />

        <DropdownMenuItem
          onClick={() => void handleLogout()}
          className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="size-3.5" />
          <span>{t.auth.signOut}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
