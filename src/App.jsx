import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import Files from "./pages/Files/Files";
import WorkspacePage from "./pages/WorkspacePage";
import { navigationItems } from "./components/navigation/navigation";
import { FilesProvider } from "./context/FilesProvider";

function App() {
  return (
    <BrowserRouter>
      <FilesProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/files" replace />} />
          <Route path="/files" element={<Files />} />
          {navigationItems.filter((item) => item.to !== "/files").map((item) => (
            <Route key={item.to} path={item.to} element={<WorkspacePage />} />
          ))}
          <Route path="*" element={<WorkspacePage />} />
        </Route>
      </Routes>
      </FilesProvider>
    </BrowserRouter>
  );
}

export default App;
