import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import Files from "./pages/Files/Files";
import WorkspacePage from "./pages/WorkspacePage";
import { navigationItems } from "./components/navigation/navigation";
import { FilesProvider } from "./context/FilesProvider";
import { StorageProvider } from "./context/StorageProvider";
import { AuthProvider } from "./context/AuthProvider";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import LoginRoute from "./components/auth/LoginRoute";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<StorageProvider><FilesProvider><AppLayout /></FilesProvider></StorageProvider>}>
              <Route index element={<Navigate to="/files" replace />} />
              <Route path="/files" element={<Files />} />
              {navigationItems.filter((item) => item.to !== "/files").map((item) => (
                <Route key={item.to} path={item.to} element={<WorkspacePage />} />
              ))}
              <Route path="*" element={<WorkspacePage />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
