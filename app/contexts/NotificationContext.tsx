import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { CURRENT_VERSION, SEEN_VERSION_KEY, UPDATE_NOTES } from '../utils/updateNotes';
import { kvSet } from '../lib/pouchdb-kv';

export interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  category: 'stok' | 'odeme' | 'sistem' | 'genel' | 'guncelleme';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
  priority: 'low' | 'medium' | 'high';
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    // LocalStorage'dan bildirimleri yükle
    const saved = localStorage.getItem('isleyen_et_notifications');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Convert timestamp strings back to Date objects
      return parsed.map((n: any) => ({
        ...n,
        timestamp: new Date(n.timestamp)
      }));
    }
    return [];
  });

  // LocalStorage'a kaydet + KV store'a yaz (CouchDB yedekleme)
  useEffect(() => {
    localStorage.setItem('isleyen_et_notifications', JSON.stringify(notifications));
    kvSet('app_notifications', notifications).catch(() => {});
  }, [notifications]);

  // Yeni versiyon bildirimi — sayfa yüklenince bir kez kontrol et
  useEffect(() => {
    const seen = localStorage.getItem(SEEN_VERSION_KEY);
    if (!seen || seen !== CURRENT_VERSION) {
      const newCount = UPDATE_NOTES.filter(n => n.isNew).length;
      if (newCount > 0) {
        // Aynı versiyon bildirimi daha önce eklenmediyse ekle
        const existing = JSON.parse(localStorage.getItem('isleyen_et_notifications') || '[]');
        const alreadyAdded = existing.some((n: any) => n.category === 'guncelleme' && n.title?.includes(CURRENT_VERSION));
        if (!alreadyAdded) {
          const notif = {
            type: 'success' as const,
            category: 'guncelleme' as const,
            title: `Yeni Güncelleme: ${CURRENT_VERSION}`,
            message: `${newCount} yeni iyileştirme ve düzeltme mevcut. Güncelleme notlarını görüntülemek için tıklayın.`,
            priority: 'medium' as const,
            actionUrl: '/guncelleme-notlari',
          };
          setNotifications(prev => [{
            ...notif,
            id: `update-${CURRENT_VERSION}`,
            timestamp: new Date(),
            read: false,
          }, ...prev]);
        }
      }
    }

    // "Okundu işaretle" eventi dinle — UpdateNotesPage'den tetiklenir
    const handleSeen = () => {
      setNotifications(prev =>
        prev.map(n => n.category === 'guncelleme' ? { ...n, read: true } : n)
      );
    };
    window.addEventListener('update_notes_seen', handleSeen);
    return () => window.removeEventListener('update_notes_seen', handleSeen);
  }, []);

  // Otomatik bildirim kontrolleri
  useEffect(() => {
    const checkInterval = setInterval(() => {
      checkStockLevels();
      checkPaymentDueDates();
    }, 60000); // Her dakika kontrol et

    return () => clearInterval(checkInterval);
  }, []);

  const checkStockLevels = () => {
    // Gerçek uygulamada burası API'den stok verilerini çeker
    // Demo için statik kontrol
  };

  const checkPaymentDueDates = () => {
    // Gerçek uygulamada burası API'den ödeme vadelerini kontrol eder
    // Demo için statik kontrol
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const addNotification = (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: Notification = {
      ...notification,
      id: Date.now().toString(),
      timestamp: new Date(),
      read: false,
    };
    setNotifications(prev => [newNotification, ...prev]);
  };

  const markAsRead = (id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        removeNotification,
        clearAll,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}