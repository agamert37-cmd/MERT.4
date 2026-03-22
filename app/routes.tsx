import { createBrowserRouter, Navigate, Outlet } from "react-router";
import { MainLayout } from "./components/MainLayout";
import { ErrorPage } from "./pages/ErrorPage";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { EmployeeProvider } from "./contexts/EmployeeContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { SyncProvider } from "./contexts/SyncContext";
import { LanguageProvider } from "./contexts/LanguageContext";

// Direct static imports (NO lazy loading to avoid dynamic import errors)
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { StokPage } from "./pages/StokPage";
import { CariPage } from "./pages/CariPage";
import { PersonelPage } from "./pages/PersonelPage";
import { SalesPage } from "./pages/SalesPage";
import { TahsilatPage } from "./pages/TahsilatPage";
import { GunSonuPage } from "./pages/GunSonuPage";
import { AracTakipPage } from "./pages/AracTakipPage";
import { ChatPage } from "./pages/ChatPage";
import { CariDetailPage } from "./pages/CariDetailPage";
import { KasaPage } from "./pages/KasaPage";
import { AracPage } from "./pages/AracPage";
import { RaporlarPage } from "./pages/RaporlarPage";
import { FilesPage } from "./pages/FilesPage";
import { FisHistoryPage } from "./pages/FisHistoryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { YedeklerPage } from "./pages/YedeklerPage";
import { StokHareketPage } from "./pages/StokHareketPage";
import { UretimPage } from "./pages/UretimPage";
import { PazarlamaPage } from "./pages/PazarlamaPage";
import { CeklerPage } from "./pages/CeklerPage";
import { SecurityPage } from "./pages/SecurityPage";
import { FaturaPage } from "./pages/FaturaPage";
import { UpdateNotesPage } from "./pages/UpdateNotesPage";

/**
 * Route guard: kullanıcı giriş yapmamışsa /login'e yönlendirir.
 * Tüm korumalı sayfalarda component mount'tan ÖNCE kontrol yapılır.
 */
function ProtectedRoute({ element }: { element: React.ReactElement }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return element;
}

/**
 * Error page wrapper that provides contexts for the error boundary.
 * When an error occurs, the errorElement replaces RootProviders,
 * so we need to provide minimal context here.
 */
function RootErrorBoundary() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <EmployeeProvider>
          <NotificationProvider>
            <SyncProvider>
              <ErrorPage />
            </SyncProvider>
          </NotificationProvider>
        </EmployeeProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}

/**
 * Root layout that provides all contexts inside the router tree.
 * RouterProvider creates its own React tree, so contexts must live HERE,
 * not around <RouterProvider>.
 */
function RootProviders() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <EmployeeProvider>
          <NotificationProvider>
            <SyncProvider>
              <Outlet />
            </SyncProvider>
          </NotificationProvider>
        </EmployeeProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}

export const router = createBrowserRouter([
  {
    // Invisible root — only provides context, no path segment
    element: <RootProviders />,
    errorElement: <RootErrorBoundary />,
    children: [
      {
        path: "/login",
        element: <LoginPage />,
      },
      {
        path: "/",
        Component: MainLayout,
        children: [
          { index: true, element: <ProtectedRoute element={<Navigate to="/dashboard" replace />} /> },
          { path: "dashboard", element: <ProtectedRoute element={<DashboardPage />} /> },
          { path: "sales", element: <ProtectedRoute element={<SalesPage />} /> },
          { path: "tahsilat", element: <ProtectedRoute element={<TahsilatPage />} /> },
          { path: "gun-sonu", element: <ProtectedRoute element={<GunSonuPage />} /> },
          { path: "arac-takip", element: <ProtectedRoute element={<AracTakipPage />} /> },
          { path: "chat", element: <ProtectedRoute element={<ChatPage />} /> },
          { path: "stok", element: <ProtectedRoute element={<StokPage />} /> },
          { path: "stok-hareket", element: <ProtectedRoute element={<StokHareketPage />} /> },
          { path: "uretim", element: <ProtectedRoute element={<UretimPage />} /> },
          { path: "pazarlama", element: <ProtectedRoute element={<PazarlamaPage />} /> },
          { path: "cekler", element: <ProtectedRoute element={<CeklerPage />} /> },
          { path: "cari", element: <ProtectedRoute element={<CariPage />} /> },
          { path: "cari/:id", element: <ProtectedRoute element={<CariDetailPage />} /> },
          { path: "kasa", element: <ProtectedRoute element={<KasaPage />} /> },
          { path: "arac", element: <ProtectedRoute element={<AracPage />} /> },
          { path: "personel", element: <ProtectedRoute element={<PersonelPage />} /> },
          { path: "raporlar", element: <ProtectedRoute element={<RaporlarPage />} /> },
          { path: "dosyalar", element: <ProtectedRoute element={<FilesPage />} /> },
          { path: "fis-gecmisi", element: <ProtectedRoute element={<FisHistoryPage />} /> },
          { path: "settings", element: <ProtectedRoute element={<SettingsPage />} /> },
          { path: "yedekler", element: <ProtectedRoute element={<YedeklerPage />} /> },
          { path: "guvenlik", element: <ProtectedRoute element={<SecurityPage />} /> },
          { path: "faturalar", element: <ProtectedRoute element={<FaturaPage />} /> },
          { path: "guncelleme-notlari", element: <ProtectedRoute element={<UpdateNotesPage />} /> },
        ],
      },
      {
        path: "*",
        element: <Navigate to="/dashboard" replace />,
      },
    ],
  },
]);