/**
 * Supabase Bağlantı Durumu Göstergesi
 * Online/Offline durum ve senkronizasyon bilgisi
 */

import React, { useState, useEffect } from 'react';
import { Cloud, CloudOff, WifiOff, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useSyncContext } from '../contexts/SyncContext';

export function SupabaseStatus() {
  const { isOnline, isSyncing, pendingCount } = useSyncContext();
  const [showStatus, setShowStatus] = useState(false);

  const isPending = isSyncing || pendingCount > 0;

  useEffect(() => {
    if (!isOnline) {
      setShowStatus(true);
    } else {
      // Online'a geçişte 3 saniye göster sonra kapat
      setShowStatus(true);
      const t = setTimeout(() => setShowStatus(false), 3000);
      return () => clearTimeout(t);
    }
  }, [isOnline]);

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
                    <p className="text-xs opacity-90">Değişiklikler CouchDB'ye gönderiliyor</p>
                    <p className="text-xs opacity-90">PouchDB → CouchDB senkronize ediliyor</p>
                  </div>
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  <div>
                    <p className="font-semibold text-sm">Bağlı</p>
                    <p className="text-xs opacity-90">CouchDB ile senkronize</p>
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
  const { isOnline, isSyncing, pendingCount } = useSyncContext();

  const hasPending = isSyncing || pendingCount > 0;

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
      isOnline
        ? 'bg-green-600/20 text-green-400'
        : 'bg-red-600/20 text-red-400'
    }`}>
      {isOnline ? (
        <>
          {hasPending
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Cloud className="w-4 h-4" />
          }
          <span className="text-xs font-medium">
            {hasPending ? `Sync (${pendingCount})` : 'Çevrimiçi'}
          </span>
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
