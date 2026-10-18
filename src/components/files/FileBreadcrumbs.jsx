import { ChevronRight, Home } from "lucide-react";

import { cx } from "../../utils/cx";

function FileBreadcrumbs({ items, onNavigate }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-1 text-sm">
        {items.map(({ id, label }, index) => {
          const current = index === items.length - 1;

          return (
            <li
              key={id ?? "home"}
              className="flex items-center gap-1"
            >
              {index > 0 && (
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              )}

              <button
                type="button"
                disabled={current}
                onClick={() => onNavigate(id)}
                className={cx(
                  "flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors",
                  current
                    ? "cursor-default font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {index === 0 && <Home className="size-4" />}
                <span>{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default FileBreadcrumbs;