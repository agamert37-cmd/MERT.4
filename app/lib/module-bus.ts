/**
 * ModuleBus - Merkezlestirilmis Moduller Arasi Iletisim Protokolu
 * 
 * Tum ERP modulleri bu event bus uzerinden birbirleriyle haberlesir.
 * Ornegin StokPage'de stok degistiginde DashboardPage, SalesPage, UretimPage
 * otomatik olarak haberdar olur ve verilerini gunceller.
 * 
 * Kullanim:
 * ```ts
 * // Yayinlama (publish)
 * moduleBus.emit('stok:updated', { productId: '123', newQty: 50 });
 * 
 * // Dinleme (subscribe) 
 * const unsub = moduleBus.on('stok:updated', (payload) => { refresh(); });
 * // Cleanup: unsub();
 * ```
 */

// ─── Event Turleri ──────────────────────────────────────────────────────────

export type ModuleEventMap = {
  // Stok modulu
  'stok:added': { productId: string; productName: string; quantity: number };
  'stok:updated': { productId: string; productName: string; changes: Record<string, any>; source?: string; faturaId?: string };
  'stok:deleted': { productId: string; productName: string };
  'stok:batch_updated': { count: number };
  'stok:movement': { productId: string; productName: string; type: string; quantity: number; partyName?: string };
  'stok:stock_alert': { productId: string; productName: string; currentStock: number; minStock: number; alertType: 'critical' | 'negative' };
  'stok:category_changed': { action: 'add' | 'edit' | 'delete'; categoryName: string; oldName?: string };

  // Cari modulu
  'cari:added': { cariId: string; firmaAdi: string };
  'cari:updated': { cariId: string; firmaAdi: string; changes: Record<string, any> };
  'cari:deleted': { cariId: string; firmaAdi: string };
  'cari:balance_changed': { cariId: string; firmaAdi: string; oldBalance: number; newBalance: number };

  // Fis modulu
  'fis:created': { fisId: string; mode: string; total: number; cariId?: string };
  'fis:updated': { fisId: string; changes: Record<string, any> };
  'fis:deleted': { fisId: string; mode?: string };
  'fis:restored': { fisId: string };

  // Kasa modulu
  'kasa:transaction_added': { transactionId: string; type: string; amount: number };
  'kasa:transaction_deleted': { transactionId: string };

  // Personel modulu
  'personel:added': { personnelId: string; name: string };
  'personel:updated': { personnelId: string; name: string };
  'personel:deleted': { personnelId: string; name: string };
  'personel:status_changed': { personnelId: string; status: string };

  // Arac modulu
  'arac:added': { vehicleId: string; plate: string };
  'arac:updated': { vehicleId: string; plate: string };
  'arac:deleted': { vehicleId: string; plate: string };
  'arac:shift_started': { vehicleId?: string; driverId?: string; vehiclePlate?: string; startKm?: number };
  'arac:shift_ended': { vehicleId?: string; driverId?: string; vehiclePlate?: string; totalKm?: number };

  // Uretim modulu
  'uretim:completed': { kayitId: string; inputKg: number; outputKg: number; productName: string };
  'uretim:deleted': { kayitId: string };
  'uretim:profile_saved': { profileId: string; profileName: string };

  // Cek modulu
  'cek:added': { cekId: string; amount: number };
  'cek:created': { cekId: string; direction: string; amount: number };
  'cek:status_changed': { cekId: string; newStatus: string; bankName?: string; direction?: string };
  'cek:deleted': { cekId: string; bankName?: string };

  // Fatura modulu
  'fatura:added': { faturaId: string; type: string; amount: number; items: number };
  'fatura:cancelled': { faturaId: string; type: string; amount: number };
  'fatura:deleted': { faturaId: string };
  'faturaStok:added': { id: string; name: string };
  'faturaStok:deleted': { id: string; name?: string };

  // Gun sonu modulu
  'gunsonu:closed': { date: string; totalSales: number };
  'gunsonu:reopened': { date: string };

  // Tahsilat modulu
  'tahsilat:collected': { cariId: string; amount: number };
  'tahsilat:created': { cariId: string; amount: number; type: string };

  // Pazarlama modulu
  'pazarlama:saved': { updatedAt: string };

  // Sistem geneli
  'system:settings_changed': { key: string; value: any };
  'system:backup_created': { backupId: string };
  'system:backup_restored': { backupId: string };
  'system:data_refreshed': { source: string };
  'system:language_changed': { lang: string };

  // Auth
  'auth:login': { userId: string; userName: string };
  'auth:logout': { userId: string };

  // Guvenlik
  'security:threat_detected': { threatId: string; type: string; severity: string; title: string };
  'security:threat_resolved': { threatId: string };
  'security:session_created': { sessionId: string; userId: string };
  'security:session_terminated': { sessionId: string; userId: string; reason: string };
  'security:policy_updated': { key: string; value: any };
  'security:brute_force_blocked': { username: string; attemptCount: number };
  'security:fingerprint_mismatch': { userId: string };
};

export type ModuleEvent = keyof ModuleEventMap;

type Listener<T = any> = (payload: T) => void;

// ─── ModuleBus Singleton ────────────────────────────────────────────────────

class ModuleBusImpl {
  private listeners = new Map<string, Set<Listener>>();
  private eventLog: Array<{ event: string; payload: any; timestamp: number }> = [];
  private maxLogSize = 200;

  /**
   * Bir event'e abone ol. Temizlik icin unsubscribe fonksiyonu doner.
   */
  on<E extends ModuleEvent>(event: E, listener: Listener<ModuleEventMap[E]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    // Unsubscribe fonksiyonu
    return () => {
      const set = this.listeners.get(event);
      if (set) {
        set.delete(listener);
        if (set.size === 0) this.listeners.delete(event);
      }
    };
  }

  /**
   * Belirli bir prefix ile baslayan tum event'lere abone ol.
   * Ornegin 'stok:*' icin 'stok:' prefix'i kullanilir.
   */
  onPrefix(prefix: string, listener: Listener<{ event: string; payload: any }>): () => void {
    const wrappedKey = `__prefix__${prefix}`;
    if (!this.listeners.has(wrappedKey)) {
      this.listeners.set(wrappedKey, new Set());
    }
    this.listeners.get(wrappedKey)!.add(listener);

    return () => {
      const set = this.listeners.get(wrappedKey);
      if (set) {
        set.delete(listener);
        if (set.size === 0) this.listeners.delete(wrappedKey);
      }
    };
  }

  /**
   * Event yayinla. Tum abone olan listener'lara iletilir.
   */
  emit<E extends ModuleEvent>(event: E, payload: ModuleEventMap[E]): void {
    // Event log'a kaydet
    this.eventLog.push({ event, payload, timestamp: Date.now() });
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog = this.eventLog.slice(-this.maxLogSize);
    }

    // Exact match listener'lari cagir
    const exactListeners = this.listeners.get(event);
    if (exactListeners) {
      exactListeners.forEach(fn => {
        try { fn(payload); } catch (e) { console.error(`[ModuleBus] Error in listener for ${event}:`, e); }
      });
    }

    // Prefix match listener'lari cagir
    this.listeners.forEach((fns, key) => {
      if (key.startsWith('__prefix__') && event.startsWith(key.replace('__prefix__', ''))) {
        fns.forEach(fn => {
          try { fn({ event, payload }); } catch (e) { console.error(`[ModuleBus] Error in prefix listener:`, e); }
        });
      }
    });

    // Window event olarak da yayinla (tab'lar arasi senkronizasyon)
    try {
      window.dispatchEvent(new CustomEvent('module_bus_event', { detail: { event, payload } }));
    } catch {}
  }

  /**
   * Bir event'i sadece bir kez dinle, sonra otomatik unsubscribe ol.
   */
  once<E extends ModuleEvent>(event: E, listener: Listener<ModuleEventMap[E]>): () => void {
    const unsub = this.on(event, (payload) => {
      unsub();
      listener(payload);
    });
    return unsub;
  }

  /**
   * Son N event log kaydini dondurur.
   */
  getRecentEvents(count: number = 50): Array<{ event: string; payload: any; timestamp: number }> {
    return this.eventLog.slice(-count);
  }

  /**
   * Belirli bir event turundeki son kaydi dondurur.
   */
  getLastEvent<E extends ModuleEvent>(event: E): { payload: ModuleEventMap[E]; timestamp: number } | null {
    for (let i = this.eventLog.length - 1; i >= 0; i--) {
      if (this.eventLog[i].event === event) {
        return { payload: this.eventLog[i].payload, timestamp: this.eventLog[i].timestamp };
      }
    }
    return null;
  }

  /**
   * Tum listener'lari temizle (test icin).
   */
  clear(): void {
    this.listeners.clear();
    this.eventLog = [];
  }

  /**
   * Debug: Aktif listener sayisini goster.
   */
  getListenerCount(): Record<string, number> {
    const counts: Record<string, number> = {};
    this.listeners.forEach((fns, key) => {
      counts[key] = fns.size;
    });
    return counts;
  }
}

// Singleton export
export const moduleBus = new ModuleBusImpl();

// Window'a ekle (debug icin console'dan erisim)
if (typeof window !== 'undefined') {
  (window as any).__moduleBus = moduleBus;
}