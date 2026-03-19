import { createBrowserRouter, Navigate, Outlet } from "react-router";
import { MainLayout } from "./components/MainLayout";
import { ErrorPage } from "./pages/ErrorPage";
import { AuthProvider } from "./contexts/AuthContext";
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
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: "dashboard", element: <DashboardPage /> },
          { path: "sales", element: <SalesPage /> },
          { path: "tahsilat", element: <TahsilatPage /> },
          { path: "gun-sonu", element: <GunSonuPage /> },
          { path: "arac-takip", element: <AracTakipPage /> },
          { path: "chat", element: <ChatPage /> },
          { path: "stok", element: <StokPage /> },
          { path: "stok-hareket", element: <StokHareketPage /> },
          { path: "uretim", element: <UretimPage /> },
          { path: "pazarlama", element: <PazarlamaPage /> },
          { path: "cekler", element: <CeklerPage /> },
          { path: "cari", element: <CariPage /> },
          { path: "cari/:id", element: <CariDetailPage /> },
          { path: "kasa", element: <KasaPage /> },
          { path: "arac", element: <AracPage /> },
          { path: "personel", element: <PersonelPage /> },
          { path: "raporlar", element: <RaporlarPage /> },
          { path: "dosyalar", element: <FilesPage /> },
          { path: "fis-gecmisi", element: <FisHistoryPage /> },
          { path: "settings", element: <SettingsPage /> },
          { path: "yedekler", element: <YedeklerPage /> },
          { path: "guvenlik", element: <SecurityPage /> },
          { path: "faturalar", element: <FaturaPage /> },
        ],
      },
      {
        path: "*",
        element: <Navigate to="/dashboard" replace />,
      },
    ],
  },
]);