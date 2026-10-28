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

import SharedPage from './pages/SharedPage';
import PublicSharePage from './pages/PublicSharePage';
import { SharesProvider } from './context/SharesProvider';
import { useAuth } from './hooks/useAuth';

function WorkspaceProviders() {
  const { user } = useAuth();
  return <StorageProvider key={user?.id}><SharesProvider><FilesProvider><AppLayout /></FilesProvider></SharesProvider></StorageProvider>;
}
function WorkspaceRoutes() {
  return <AuthProvider><Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<WorkspaceProviders />}>
              <Route index element={<Navigate to="/files" replace />} />
              <Route path="/files" element={<Files />} />
              <Route path="/shared" element={<SharedPage />} />
              {navigationItems.filter((item) => !['/files', '/shared'].includes(item.to)).map((item) => (
                <Route key={item.to} path={item.to} element={<WorkspacePage />} />
              ))}
              <Route path="*" element={<WorkspacePage />} />
            </Route>
          </Route>
        </Routes></AuthProvider>;
}
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/s/:shareId/:secret" element={<PublicSharePage />} />
        <Route path="/s/*" element={<PublicSharePage />} />
        <Route path="*" element={<WorkspaceRoutes />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
