import { Bell, Search } from "lucide-react";

import ThemeToggle from "../theme/ThemeToggle";

function Header() {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-6">
      <div className="flex min-w-0 flex-1 items-center">
        <button
          type="button"
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Search"
        >
          <Search className="size-5" />
        </button>
      </div>

      <div className="flex items-center gap-1">
        <ThemeToggle />

        <button
          type="button"
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell className="size-5" />
        </button>
      </div>
    </header>
  );
}

export default Header;
