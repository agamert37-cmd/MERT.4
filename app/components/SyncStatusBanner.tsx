// Senkronizasyon durum banner'ı — CouchDB bağlantısı koptuğunda görünür
import React, { useState } from 'react';
import { WifiOff, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { useCouchDbStatus } from '../contexts/GlobalTableSyncContext';
import { restartAllSync } from '../lib/pouchdb';
import { useNavigate } from 'react-router';

export function SyncStatusBanner() {
  const { couchdbConnected, couchdbError } = useCouchDbStatus();
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  // null = henüz bilinmiyor (bağlantı denemeleri devam ediyor) → banner gösterme
  // true = bağlı → banner gösterme
  // false = bağlantı yok → banner göster
  if (couchdbConnected !== false) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[200] select-none">
      {/* Ana satır */}
      <div className="bg-amber-500/95 backdrop-blur-sm border-t border-amber-400/50 shadow-2xl">
        <div className="flex items-center gap-2 px-3 py-2 max-w-4xl mx-auto">
          <WifiOff className="w-4 h-4 text-amber-900 flex-shrink-0" />
          <span className="text-amber-900 font-semibold text-xs flex-1">
            Sunucu bağlantısı yok — veriler yalnızca bu cihazda kaydediliyor
          </span>
          <button
            onClick={() => restartAllSync()}
            className="flex items-center gap-1 text-[10px] font-bold bg-amber-900/20 hover:bg-amber-900/40 text-amber-900 px-2 py-1 rounded-lg transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Yeniden Bağlan
          </button>
          <button
            onClick={() => navigate('/sunucu')}
            className="text-[10px] font-bold text-amber-900/70 hover:text-amber-900 px-2 py-1 rounded-lg hover:bg-amber-900/20 transition-colors"
          >
            Ayarlar
          </button>
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-amber-900/60 hover:text-amber-900 p-1 rounded transition-colors"
            aria-label={expanded ? 'Gizle' : 'Detay'}
          >
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Genişletilmiş hata detayı */}
        {expanded && couchdbError && (
          <div className="px-3 pb-2 pt-0 max-w-4xl mx-auto">
            <div className="bg-amber-900/10 rounded-lg px-3 py-1.5 text-[10px] font-mono text-amber-900/80 break-all">
              {couchdbError}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
