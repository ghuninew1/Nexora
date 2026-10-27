import { ChevronRight, Home } from "lucide-react";

import { cx } from "../../utils/cx";

function FileBreadcrumbs({ items, onNavigate, abbreviated = false }) {
  return (
    <nav aria-label="Breadcrumb" className={cx("max-w-full overflow-x-auto")}>
      <ol className={cx("flex min-w-max items-center gap-1 text-sm")}>
        {items.map(({ id, label }, index) => {
          const current = index === items.length - 1;
          const displayLabel = abbreviated && index === 0 ? "…" : label;

          return (
            <li
              key={id ?? "home"}
              className={cx("flex items-center gap-1")}
            >
              {index > 0 && (
                <ChevronRight
                  className={cx("size-4 shrink-0 text-muted-foreground")}
                  aria-hidden="true"
                />
              )}

              <button
                type="button"
                disabled={current}
                aria-current={current ? "page" : undefined}
                aria-label={abbreviated && index === 0 ? "Go to My Files; earlier folders are not shown" : undefined}
                onClick={() => onNavigate(id)}
                className={cx(
                  "flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors",
                  current
                    ? "cursor-default font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {index === 0 && <Home className={cx("size-4")} aria-hidden="true" />}
                <span>{displayLabel}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default FileBreadcrumbs;
