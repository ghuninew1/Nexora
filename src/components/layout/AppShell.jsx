import { useState } from "react";

import Header from "./Header";
import Sidebar from "./Sidebar";

function AppShell({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  function handleSidebarToggle() {
    setSidebarCollapsed((current) => !current);
  }

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={handleSidebarToggle}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header />

        <main className="min-w-0 flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export default AppShell;