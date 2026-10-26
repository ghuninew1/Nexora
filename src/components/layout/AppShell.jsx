import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { cx } from "../../utils/cx";
import Header from "./Header";
import Sidebar from "./Sidebar";
import { getPageInfo } from "../navigation/navigation";

function AppShell({ children }) {
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const menuButtonRef = useRef(null);
    const { pathname } = useLocation();

    useEffect(() => {
        const media = window.matchMedia("(min-width: 768px)");
        const closeOnDesktop = (event) => { if (event.matches) setIsMobileSidebarOpen(false); };
        media.addEventListener("change", closeOnDesktop);
        return () => media.removeEventListener("change", closeOnDesktop);
    }, []);

    useEffect(() => {
        window.scrollTo({ top: 0, behavior: "instant" });
        document.title = `${getPageInfo(pathname)?.label ?? "Page not found"} — Nexora`;
    }, [pathname]);

    return (
        <div className={cx("relative isolate min-h-dvh bg-background text-foreground antialiased selection:bg-primary/20")}>
            <a href="#main-content" className={cx("sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-60 focus:rounded-xl focus:bg-primary focus:px-4 focus:py-3 focus:text-primary-foreground")}>Skip to content</a>
            <div aria-hidden="true" className={cx("pointer-events-none absolute inset-0 -z-10 overflow-hidden")}>
                <div className={cx("absolute -left-24 top-1/4 size-96 rounded-full bg-cyan-500/5 blur-3xl")} />
                <div className={cx("absolute -right-24 bottom-1/4 size-96 rounded-full bg-indigo-500/5 blur-3xl")} />
            </div>
            <Sidebar
                isCollapsed={isSidebarCollapsed}
                isMobileOpen={isMobileSidebarOpen}
                onMobileOpenChange={setIsMobileSidebarOpen}
                menuButtonRef={menuButtonRef}
                onToggle={() => setIsSidebarCollapsed((current) => !current)}
            />
                <Header onMenuClick={() => setIsMobileSidebarOpen(true)} menuButtonRef={menuButtonRef} isMobileOpen={isMobileSidebarOpen} />
            <div className={cx("relative flex min-h-dvh min-w-0 flex-col transition-[padding] duration-200 motion-reduce:transition-none", isSidebarCollapsed ? "md:pl-0" : "md:pl-0")}>
                <main id="main-content" tabIndex={-1} className={cx("mx-auto w-full min-w-0 max-w-[1600px] flex-1 p-4 outline-none sm:p-5 lg:p-6")}>
                    {children}
                </main>
            </div>
        </div>
    );
}

export default AppShell;
