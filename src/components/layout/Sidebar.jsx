import {
  Files,
  FolderClock,
  Heart,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Share2,
  Trash2,
} from "lucide-react";

import { cx } from "../../utils/cx";

const navigation = [
  {
    label: "Files",
    icon: Files,
    active: true,
  },
  {
    label: "Recent",
    icon: FolderClock,
  },
  {
    label: "Favorites",
    icon: Heart,
  },
  {
    label: "Shared",
    icon: Share2,
  },
  {
    label: "Trash",
    icon: Trash2,
  },
];

function Sidebar({ collapsed, onToggle }) {
  return (
    <aside
      className={cx(
        "flex shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div
        className={cx(
          "flex h-16 items-center border-b border-border",
          collapsed ? "justify-center px-2" : "px-5",
        )}
      >
        {collapsed ? (
          <span className="text-xl font-semibold tracking-tight text-foreground">
            N
          </span>
        ) : (
          <span className="text-xl font-semibold tracking-tight text-foreground">
            Nexora
          </span>
        )}
      </div>

      <nav className="flex-1 p-3">
        <ul className="space-y-1">
          {navigation.map(({ label, icon: Icon, active }) => (
            <li key={label}>
              <button
                type="button"
                title={collapsed ? label : undefined}
                className={cx(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  collapsed && "justify-center px-2",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-5 shrink-0" />

                {!collapsed && <span>{label}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-border p-3">
        <button
          type="button"
          title={collapsed ? "Settings" : undefined}
          className={cx(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            collapsed && "justify-center px-2",
          )}
        >
          <Settings className="size-5 shrink-0" />

          {!collapsed && <span>Settings</span>}
        </button>

        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cx(
            "mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            collapsed && "justify-center px-2",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-5 shrink-0" />
          ) : (
            <PanelLeftClose className="size-5 shrink-0" />
          )}

          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;