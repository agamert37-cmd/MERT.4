// [AJAN-2 | claude/serene-gagarin | 2026-03-25] Son düzenleyen: Claude Opus 4.6
import { RouterProvider } from 'react-router';
import { GlobalTableSyncProvider } from './contexts/GlobalTableSyncContext';
import { SyncStatusBanner } from './components/SyncStatusBanner';
import { router } from './routes';
import { Toaster } from 'sonner';
import { useEffect } from 'react';
import { useUpdateCheck } from './hooks/useUpdateCheck';
import { StorageQuotaBanner } from './components/StorageQuotaBanner';
import { AppLockScreen } from './components/AppLockScreen';

export default function App() {
  // Dark tema
  useEffect(() => {
    document.documentElement.classList.add('dark');
    return () => document.documentElement.classList.remove('dark');
  }, []);

  useUpdateCheck();

  return (
    <div className="dark min-h-screen bg-background">
      {/* Tüm tabloları PouchDB ↔ CouchDB ile senkronize et */}
      <GlobalTableSyncProvider>
        <AppLockScreen>
          <RouterProvider router={router} />
        </AppLockScreen>
        <SyncStatusBanner />
        <StorageQuotaBanner />
      </GlobalTableSyncProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'hsl(var(--card))',
            color: 'hsl(var(--foreground))',
            border: '1px solid hsl(var(--border))',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(37, 99, 235, 0.1)',
            backdropFilter: 'blur(16px)',
            borderRadius: '0.75rem',
            fontFamily: "'Inter', system-ui, sans-serif",
          },
          className: 'font-medium',
          duration: 3000,
        }}
      />
    </div>
  );
}
