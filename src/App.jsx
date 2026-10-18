import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import AppShell from "./components/layout/AppShell";
import Files from "./pages/Files/Files";

function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/files" element={<Files />} />
          <Route path="*" element={<Navigate to="/files" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}

export default App;
