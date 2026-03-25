/**
 * Vitrin Analytics - Login sayfası etkileşim takibi
 * Tüm veriler Pazarlama modülünden izlenebilir.
 */
import { getFromStorage, setInStorage, StorageKey } from './storage';
import { kvSet } from '../lib/supabase-kv';

export interface VitrinEvent {
  id: string;
  type: 'page_view' | 'product_view' | 'product_click' | 'cart_add' | 'cart_remove' | 'quote_request' | 'news_view' | 'recipe_view' | 'banner_view' | 'catalog_search' | 'category_filter' | 'login_attempt';
  timestamp: string;
  data?: Record<string, any>;
}

export interface VitrinAnalytics {
  events: VitrinEvent[];
  summary: {
    totalPageViews: number;
    totalProductViews: number;
    totalCartAdds: number;
    totalQuoteRequests: number;
    totalNewsViews: number;
    lastVisit: string;
  };
}

function getAnalytics(): VitrinAnalytics {
  return getFromStorage<VitrinAnalytics>(StorageKey.VITRIN_ANALYTICS) || {
    events: [],
    summary: {
      totalPageViews: 0,
      totalProductViews: 0,
      totalCartAdds: 0,
      totalQuoteRequests: 0,
      totalNewsViews: 0,
      lastVisit: '',
    },
  };
}

function saveAnalytics(analytics: VitrinAnalytics) {
  // Son 500 eventi tut
  if (analytics.events.length > 500) {
    analytics.events = analytics.events.slice(-500);
  }
  setInStorage(StorageKey.VITRIN_ANALYTICS, analytics);
  // [AJAN-2] KV sync — analitik verileri Pazarlama modülünden tüm cihazlarda izlensin
  kvSet('vitrin_analytics', analytics).catch(() => {});
}

export function trackVitrinEvent(type: VitrinEvent['type'], data?: Record<string, any>) {
  const analytics = getAnalytics();
  const event: VitrinEvent = {
    id: `ve-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    type,
    timestamp: new Date().toISOString(),
    data,
  };
  analytics.events.push(event);

  // Summary güncelle
  switch (type) {
    case 'page_view':
      analytics.summary.totalPageViews++;
      analytics.summary.lastVisit = event.timestamp;
      break;
    case 'product_view':
    case 'product_click':
      analytics.summary.totalProductViews++;
      break;
    case 'cart_add':
      analytics.summary.totalCartAdds++;
      break;
    case 'quote_request':
      analytics.summary.totalQuoteRequests++;
      break;
    case 'news_view':
      analytics.summary.totalNewsViews++;
      break;
  }

  saveAnalytics(analytics);
}

export function getVitrinAnalytics(): VitrinAnalytics {
  return getAnalytics();
}

export function getVitrinEventsByType(type: VitrinEvent['type']): VitrinEvent[] {
  const analytics = getAnalytics();
  return analytics.events.filter(e => e.type === type);
}

export function getVitrinEventsToday(): VitrinEvent[] {
  const analytics = getAnalytics();
  const today = new Date().toISOString().split('T')[0];
  return analytics.events.filter(e => e.timestamp.startsWith(today));
}

export function getPopularProducts(): { name: string; views: number; cartAdds: number }[] {
  const analytics = getAnalytics();
  const productMap = new Map<string, { views: number; cartAdds: number }>();
  
  analytics.events.forEach(e => {
    const name = e.data?.productName;
    if (!name) return;
    const existing = productMap.get(name) || { views: 0, cartAdds: 0 };
    if (e.type === 'product_view' || e.type === 'product_click') existing.views++;
    if (e.type === 'cart_add') existing.cartAdds++;
    productMap.set(name, existing);
  });

  return Array.from(productMap.entries())
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => (b.views + b.cartAdds) - (a.views + a.cartAdds));
}

export function getDailyStats(days: number = 7): { date: string; views: number; cartAdds: number; quotes: number }[] {
  const analytics = getAnalytics();
  const result: Map<string, { views: number; cartAdds: number; quotes: number }> = new Map();
  
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    result.set(dateStr, { views: 0, cartAdds: 0, quotes: 0 });
  }

  analytics.events.forEach(e => {
    const dateStr = e.timestamp.split('T')[0];
    const existing = result.get(dateStr);
    if (!existing) return;
    if (e.type === 'page_view') existing.views++;
    if (e.type === 'cart_add') existing.cartAdds++;
    if (e.type === 'quote_request') existing.quotes++;
  });

  return Array.from(result.entries())
    .map(([date, stats]) => ({ date, ...stats }))
    .reverse();
}

export function clearVitrinAnalytics() {
  const empty = {
    events: [],
    summary: {
      totalPageViews: 0,
      totalProductViews: 0,
      totalCartAdds: 0,
      totalQuoteRequests: 0,
      totalNewsViews: 0,
      lastVisit: '',
    },
  };
  setInStorage(StorageKey.VITRIN_ANALYTICS, empty);
  kvSet('vitrin_analytics', empty).catch(() => {});
}
