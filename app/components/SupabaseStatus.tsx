/**
 * Supabase Bağlantı Durumu Göstergesi
 * Online/Offline durum ve senkronizasyon bilgisi
 */

import React, { useState, useEffect } from 'react';
import { Cloud, CloudOff, WifiOff, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function SupabaseStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isPending, setIsPending] = useState(false);
  const [showStatus, setShowStatus] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowStatus(true);
      setTimeout(() => setShowStatus(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowStatus(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Pending changes kontrolü
    const checkPending = () => {
      try {
        const pending = localStorage.getItem('isleyen_et_pending_changes');
        setIsPending(!!pending && JSON.parse(pending).length > 0);
      } catch {
        setIsPending(false);
      }
    };

    checkPending();
    const interval = setInterval(checkPending, 2000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  if (!showStatus && isOnline && !isPending) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="fixed top-4 right-4 z-50"
      >
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg backdrop-blur-sm border ${
          isOnline
            ? 'bg-green-600/90 border-green-500 text-white'
            : 'bg-red-600/90 border-red-500 text-white'
        }`}>
          {isOnline ? (
            <>
              {isPending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <div>
                    <p className="font-semibold text-sm">Senkronize ediliyor...</p>
                    <p className="text-xs opacity-90">Değişiklikler Supabase'e gönderiliyor</p>
                  </div>
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  <div>
                    <p className="font-semibold text-sm">Bağlı</p>
                    <p className="text-xs opacity-90">Supabase ile senkronize</p>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <WifiOff className="w-5 h-5" />
              <div>
                <p className="font-semibold text-sm">Offline Mod</p>
                <p className="text-xs opacity-90">Veriler yerel olarak kaydediliyor</p>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Kompakt Durum Badge (Sidebar için)
 */
export function SupabaseStatusBadge() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
      isOnline
        ? 'bg-green-600/20 text-green-400'
        : 'bg-red-600/20 text-red-400'
    }`}>
      {isOnline ? (
        <>
          <Cloud className="w-4 h-4" />
          <span className="text-xs font-medium">Çevrimiçi</span>
        </>
      ) : (
        <>
          <CloudOff className="w-4 h-4" />
          <span className="text-xs font-medium">Çevrimdışı</span>
        </>
      )}
    </div>
  );
}
