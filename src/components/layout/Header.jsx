import { Menu } from "lucide-react";
import { useLocation } from "react-router-dom";
import ThemeToggle from "../../theme/ThemeToggle";
import { Button } from "../ui/button";
import { getPageInfo } from "../navigation/navigation";
import { cx } from "../../utils/cx";

function Header({ onMenuClick, menuButtonRef, isMobileOpen }) {
  const { pathname } = useLocation();
  const page = getPageInfo(pathname);

  return (
    <header className={cx("glass-header sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b px-4 sm:px-5 lg:px-6")}>
      <div className={cx("flex min-w-0 items-center gap-3")}>
        <Button ref={menuButtonRef} variant="ghost" size="icon-lg" onClick={onMenuClick} className={cx("md:hidden")} aria-label="Open navigation menu" aria-controls={isMobileOpen ? "mobile-sidebar" : undefined} aria-expanded={isMobileOpen}>
          <Menu />
        </Button>
        <div className={cx("min-w-0")}>
          <p className={cx("truncate text-sm font-semibold tracking-tight")}>{page?.label ?? "Nexora"}</p>
          <p className={cx("hidden truncate text-xs text-muted-foreground sm:block")}>{page?.description ?? "Your private cloud workspace."}</p>
        </div>
      </div>
      <div className={cx("flex shrink-0 items-center gap-3")}>
        <span className={cx("hidden text-xs text-muted-foreground sm:block")}>Private Cloud</span>
        <ThemeToggle />
      </div>
    </header>
  );
}

export default Header;
