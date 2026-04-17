/**
 * BroadcastChannel tabanlı çapraz-sekme senkronizasyonu.
 * Aynı cihazdaki birden fazla sekmede açık uygulama,
 * birinde yapılan değişikliği diğerine anında yansıtır.
 *
 * Kullanım: useTableSync.ts CRUD işlemlerinden sonra broadcastTableChange() çağrılır.
 * Diğer sekmeler bu mesajı alınca ilgili tabloyu PouchDB'den yeniden okur.
 */

const CHANNEL_NAME = 'mert-db-sync';

export interface BroadcastMessage {
  type: 'TABLE_CHANGED' | 'LOGOUT' | 'LOCK';
  tableName?: string;
  operation?: 'add' | 'update' | 'delete' | 'batch';
  timestamp: number;
  tabId: string;
}

// Her sekme için benzersiz ID
const TAB_ID = Math.random().toString(36).slice(2, 8);

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (!('BroadcastChannel' in window)) return null;
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

/** Diğer sekmelere tablo değişikliğini bildir */
export function broadcastTableChange(
  tableName: string,
  operation: BroadcastMessage['operation'] = 'update'
): void {
  const ch = getChannel();
  if (!ch) return;
  const msg: BroadcastMessage = {
    type: 'TABLE_CHANGED',
    tableName,
    operation,
    timestamp: Date.now(),
    tabId: TAB_ID,
  };
  try {
    ch.postMessage(msg);
  } catch {}
}

/** Oturum kapatma bildirimini diğer sekmelere yay */
export function broadcastLogout(): void {
  const ch = getChannel();
  if (!ch) return;
  try {
    ch.postMessage({ type: 'LOGOUT', timestamp: Date.now(), tabId: TAB_ID });
  } catch {}
}

/** Uygulama kilit bildirimini yay */
export function broadcastLock(): void {
  const ch = getChannel();
  if (!ch) return;
  try {
    ch.postMessage({ type: 'LOCK', timestamp: Date.now(), tabId: TAB_ID });
  } catch {}
}

/** Kanal dinleyicisi — mesaj gelince callback çağrılır */
export function onBroadcastMessage(
  handler: (msg: BroadcastMessage) => void
): () => void {
  const ch = getChannel();
  if (!ch) return () => {};

  const listener = (event: MessageEvent<BroadcastMessage>) => {
    // Kendi sekmemizden gelen mesajları yoksay
    if (event.data?.tabId === TAB_ID) return;
    handler(event.data);
  };

  ch.addEventListener('message', listener);
  return () => ch.removeEventListener('message', listener);
}

export function closeBroadcastChannel(): void {
  channel?.close();
  channel = null;
}
