/**
 * useModuleBus - Hafif ModuleBus hook'u
 * 
 * Zaten useAuth/useLanguage kullanan modullerde sadece
 * event dinleme/yayinlama icin kullanilir.
 * 
 * Kullanim:
 * ```ts
 * const bus = useModuleBus();
 * 
 * // Dinle
 * bus.on('stok:updated', (payload) => { refresh(); });
 * 
 * // Yayinla
 * bus.emit('cari:balance_changed', { ... });
 * ```
 */

import { useEffect, useRef, useCallback } from 'react';
import { moduleBus, ModuleEvent, ModuleEventMap } from '../lib/module-bus';

export function useModuleBus() {
  const subscriptions = useRef<Array<() => void>>([]);

  const on = useCallback(<E extends ModuleEvent>(
    event: E,
    listener: (payload: ModuleEventMap[E]) => void
  ) => {
    const unsub = moduleBus.on(event, listener);
    subscriptions.current.push(unsub);
    return unsub;
  }, []);

  const onPrefix = useCallback((
    prefix: string,
    listener: (data: { event: string; payload: any }) => void
  ) => {
    const unsub = moduleBus.onPrefix(prefix, listener);
    subscriptions.current.push(unsub);
    return unsub;
  }, []);

  const once = useCallback(<E extends ModuleEvent>(
    event: E,
    listener: (payload: ModuleEventMap[E]) => void
  ) => {
    const unsub = moduleBus.once(event, listener);
    subscriptions.current.push(unsub);
    return unsub;
  }, []);

  const emit = useCallback(<E extends ModuleEvent>(
    event: E,
    payload: ModuleEventMap[E]
  ) => {
    moduleBus.emit(event, payload);
  }, []);

  // Unmount'ta tum subscription'lari temizle
  useEffect(() => {
    return () => {
      subscriptions.current.forEach(unsub => unsub());
      subscriptions.current = [];
    };
  }, []);

  return { on, onPrefix, once, emit, bus: moduleBus };
}
