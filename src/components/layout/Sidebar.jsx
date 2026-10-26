import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Hexagon, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { NavLink } from "react-router-dom";
import { Button } from "../ui/button";
import { navigationGroups } from "../navigation/navigation";
import { cx } from "../../utils/cx";
import { glassHover, updateGlassPointer } from "../../utils/glass";

function SidebarContent({ isCollapsed = false, onNavigate, onToggle, mobile = false }) {
  return (
    <>
      <div className={cx("flex h-16 shrink-0 items-center", isCollapsed ? "justify-center" : "gap-2 px-3")}>
        <NavLink to="/files" onClick={onNavigate} aria-label="Nexora home" title={isCollapsed ? "Nexora" : undefined} className={cx(glassHover, "flex min-w-0 items-center gap-3 rounded-xl p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring")} onPointerMove={updateGlassPointer}>
          <span className={cx("flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-primary text-primary-foreground")}><Hexagon className={cx("size-5")} aria-hidden="true" /></span>
          {!isCollapsed && <span className={cx("min-w-0")}><span className={cx("block truncate text-sm font-semibold tracking-tight")}>Nexora</span><span className={cx("block text-xs text-muted-foreground")}>Private Cloud</span></span>}
        </NavLink>
        {mobile && (
          <DialogPrimitive.Close render={<Button variant="ghost" size="icon-lg" className={cx("ml-auto shrink-0")} aria-label="Close navigation menu" />}><X /></DialogPrimitive.Close>
        )}
      </div>
      <nav aria-label={mobile ? "Mobile workspace navigation" : "Workspace navigation"} className={cx("flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden px-2 pb-3")}>
        {navigationGroups.map((group, index) => (
          <section key={group.label} aria-label={group.label} className={cx("flex flex-col gap-1", index > 0 && "border-t border-sidebar-border pt-3")}>
            <h2 className={cx("px-3 pb-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground", isCollapsed && "sr-only")}>{group.label}</h2>
            {group.items.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} onClick={onNavigate} title={isCollapsed ? label : undefined} onPointerMove={updateGlassPointer} className={({ isActive }) => cx(
                glassHover,
                "flex min-h-11 shrink-0 items-center rounded-xl text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                isCollapsed ? "size-11 justify-center self-center" : "gap-3 px-3",
                isActive ? "glass-nav-active font-medium text-sidebar-accent-foreground" : "text-muted-foreground hover:text-sidebar-foreground",
              )}>
                <Icon className={cx("relative size-5 shrink-0")} aria-hidden="true" />
                <span className={cx("relative truncate", isCollapsed && "sr-only")}>{label}</span>
              </NavLink>
            ))}
          </section>
        ))}
      </nav>
      {onToggle && (
        <div className={cx("flex shrink-0 border-t border-sidebar-border p-2", isCollapsed ? "justify-center" : "flex-col")}>
          <Button variant="ghost" size={isCollapsed ? "icon-lg" : "lg"} onClick={onToggle} aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!isCollapsed} title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {isCollapsed ? <PanelLeftOpen /> : <PanelLeftClose data-icon="inline-start" />}
            {!isCollapsed && "Collapse sidebar"}
          </Button>
        </div>
      )}
    </>
  );
}

function Sidebar({ isCollapsed, isMobileOpen, onMobileOpenChange, menuButtonRef, onToggle }) {
  return (
    <>
      <DialogPrimitive.Root open={isMobileOpen} onOpenChange={onMobileOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className={cx("glass-overlay fixed inset-0 z-40 transition-opacity duration-200 data-closed:opacity-0 motion-reduce:transition-none")} />
          <DialogPrimitive.Popup id="mobile-sidebar" finalFocus={() => menuButtonRef.current?.getClientRects().length ? menuButtonRef.current : false} className={cx("glass-sidebar fixed inset-y-0 left-0 z-50 flex w-72 max-w-[calc(100vw-2rem)] flex-col border-r text-sidebar-foreground outline-none transition-transform duration-200 data-closed:-translate-x-full motion-reduce:transition-none")}>
            <DialogPrimitive.Title className={cx("sr-only")}>Nexora navigation</DialogPrimitive.Title>
            <SidebarContent mobile onNavigate={() => onMobileOpenChange(false)} />
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <aside aria-label="Main sidebar" data-collapsed={isCollapsed} className={cx("glass-sidebar fixed left-3 top-1/2 z-30 hidden max-h-[calc(100dvh-2rem)] -translate-y-1/2 flex-col overflow-hidden rounded-[1.4rem] border text-sidebar-foreground shadow-xl transition-[width] duration-200 motion-reduce:transition-none md:flex", isCollapsed ? "w-[60px]" : "w-60")}>
        <SidebarContent isCollapsed={isCollapsed} onToggle={onToggle} />
      </aside>
    </>
  );
}

export default Sidebar;
