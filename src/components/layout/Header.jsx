import { LogOut, Menu } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ThemeToggle from "../../theme/ThemeToggle";
import { useAuth } from "../../hooks/useAuth";
import { Button } from "../ui/button";
import { getPageInfo } from "../navigation/navigation";
import { cx } from "../../utils/cx";

function Header({ onMenuClick, menuButtonRef, isMobileOpen }) {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const [isSigningOut, setIsSigningOut] = useState(false);
    const [signOutError, setSignOutError] = useState("");
    const page = getPageInfo(pathname);
    const displayName = user?.displayName || user?.email || "Nexora user";
    const nameParts = displayName.trim().split(/\s+/u);
    const initials =
        nameParts.length > 1
            ? `${Array.from(nameParts[0])[0]}${Array.from(nameParts.at(-1))[0]}`
            : Array.from(nameParts[0]).slice(0, 2).join("");

    async function handleSignOut() {
        if (isSigningOut) return;
        setIsSigningOut(true);
        setSignOutError("");
        try {
            await logout();
            navigate("/login", { replace: true });
        } catch {
            setSignOutError("Unable to sign out. Check your connection and try again.");
        } finally {
            setIsSigningOut(false);
        }
    }

    return (
        <header
            className={cx(
                "glass-header sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b px-4 sm:px-5 lg:px-6",
            )}
        >
            <div className={cx("flex min-w-0 items-center gap-3")}>
                <Button
                    ref={menuButtonRef}
                    variant="ghost"
                    size="icon-lg"
                    onClick={onMenuClick}
                    className={cx("md:hidden")}
                    aria-label="Open navigation menu"
                    aria-controls={isMobileOpen ? "mobile-sidebar" : undefined}
                    aria-expanded={isMobileOpen}
                >
                    <Menu />
                </Button>
                <div className={cx("min-w-0")}>
                    <p className={cx("truncate text-sm font-semibold tracking-tight")}>{page?.label ?? "Nexora"}</p>
                    <p className={cx("hidden truncate text-xs text-muted-foreground sm:block")}>
                        {page?.description ?? "Your private cloud workspace."}
                    </p>
                </div>
            </div>
            <div className={cx("flex shrink-0 items-center gap-3")}>
                <div className={cx("flex min-w-0 items-center gap-2")}>
                    <span
                        aria-hidden="true"
                        className={cx(
                            "flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold text-foreground",
                        )}
                    >
                        {initials}
                    </span>
                    <span className={cx("hidden max-w-44 truncate text-sm font-medium sm:block")} title={displayName}>
                        {displayName}
                    </span>
                </div>
                <ThemeToggle />
                <Button
                    type="button"
                    variant="ghost"
                    size="lg"
                    className={cx("min-h-11 min-w-11 gap-2")}
                    onClick={handleSignOut}
                    disabled={isSigningOut}
                    aria-label="Sign out"
                    aria-busy={isSigningOut}
                    title={signOutError || "Sign out"}
                >
                    <LogOut aria-hidden="true" />
                    <span className={cx("hidden sm:inline")}>{isSigningOut ? "Signing out…" : "Sign out"}</span>
                </Button>
            </div>
            {signOutError && (
                <p
                    className={cx(
                        "absolute right-4 top-full mt-2 max-w-[calc(100vw-2rem)] rounded-lg border border-destructive/30 bg-background px-3 py-2 text-xs text-destructive shadow-lg sm:right-6",
                    )}
                    role="alert"
                    aria-live="polite"
                >
                    {signOutError}
                </p>
            )}
        </header>
    );
}

export default Header;
