import React, { useState } from 'react';
import { Bell, X, Check, AlertTriangle, Info, AlertCircle, CheckCircle, ChevronRight, Sparkles, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as Popover from '@radix-ui/react-popover';
import { useNotifications } from '../contexts/NotificationContext';
import { useNavigate } from 'react-router';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';

export function NotificationPanel() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, removeNotification, clearAll } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const handleNotificationClick = (notification: any) => {
    markAsRead(notification.id);
    if (notification.actionUrl) {
      navigate(notification.actionUrl);
      setIsOpen(false);
    }
  };

  const getNotificationIcon = (type: string, category?: string) => {
    if (category === 'guncelleme') return <Sparkles className="w-5 h-5 text-emerald-400" />;
    switch (type) {
      case 'error':   return <AlertCircle className="w-5 h-5 text-red-400" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-orange-400" />;
      case 'success': return <CheckCircle className="w-5 h-5 text-green-400" />;
      default:        return <Info className="w-5 h-5 text-blue-400" />;
    }
  };

  const getNotificationBg = (type: string, read: boolean) => {
    const opacity = read ? '30' : '50';
    switch (type) {
      case 'error':
        return `bg-red-600/${opacity}`;
      case 'warning':
        return `bg-orange-600/${opacity}`;
      case 'success':
        return `bg-green-600/${opacity}`;
      default:
        return `bg-blue-600/${opacity}`;
    }
  };

  const sortedNotifications = [...notifications].sort((a, b) => {
    // Önce okunmamışlar
    if (a.read !== b.read) return a.read ? 1 : -1;
    // Sonra önceliğe göre
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    if (a.priority !== b.priority) return priorityOrder[a.priority] - priorityOrder[b.priority];
    // Son olarak tarihe göre - ensure timestamps are Date objects
    const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
    const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
    return timeB - timeA;
  });

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger className="relative p-2 rounded-lg hover:bg-secondary transition-colors cursor-pointer border-none bg-transparent">
          <Bell className="w-5 h-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="w-[min(420px,calc(100vw-1rem))] bg-card border border-border rounded-xl shadow-2xl z-50"
          sideOffset={5}
          align="end"
        >
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-blue-400" />
                <h3 className="text-base font-bold text-white">Bildirimler</h3>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.5 bg-blue-600 text-white text-xs font-bold rounded-full">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" />
                    <span className="hidden sm:inline">Tümünü Okundu</span>
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={() => { if (confirm('Tüm bildirimler silinsin mi?')) clearAll(); }}
                    className="text-xs text-gray-500 hover:text-red-400 transition-colors flex items-center gap-1"
                    title="Tümünü Sil"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Notifications List */}
            <div className="max-h-[60vh] sm:max-h-[500px] overflow-y-auto">
              {sortedNotifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground">Bildirim bulunmuyor</p>
                </div>
              ) : (
                <AnimatePresence>
                  {sortedNotifications.map((notification) => (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className={`relative p-4 border-b border-border hover:bg-secondary/50 transition-all cursor-pointer group ${
                        !notification.read ? 'bg-secondary/30' : ''
                      }`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      {/* Unread Indicator */}
                      {!notification.read && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />
                      )}

                      <div className="flex gap-3">
                        {/* Icon */}
                        <div className={`flex-shrink-0 p-2 rounded-lg ${
                          notification.category === 'guncelleme'
                            ? 'bg-emerald-600/40'
                            : getNotificationBg(notification.type, notification.read)
                        }`}>
                          {getNotificationIcon(notification.type, notification.category)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h4 className={`font-semibold ${notification.read ? 'text-foreground' : 'text-white'}`}>
                              {notification.title}
                            </h4>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeNotification(notification.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-accent rounded"
                            >
                              <X className="w-4 h-4 text-muted-foreground" />
                            </button>
                          </div>
                          <p className={`text-sm mb-2 ${notification.read ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                            {notification.message}
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(notification.timestamp), {
                                addSuffix: true,
                                locale: tr,
                              })}
                            </span>
                            {notification.actionUrl && (
                              <span className="text-xs text-blue-400 flex items-center gap-1">
                                Detay
                                <ChevronRight className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Priority Badge */}
                      {notification.priority === 'high' && !notification.read && (
                        <div className="absolute top-2 right-2">
                          <span className="px-2 py-0.5 bg-red-600 text-white text-xs font-bold rounded-full">
                            ÖNEMLİ
                          </span>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>

            {/* Footer */}
            {sortedNotifications.length > 0 && (
              <div className="p-3 border-t border-border flex items-center justify-between">
                <button
                  onClick={() => { navigate('/guncelleme-notlari'); setIsOpen(false); }}
                  className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  Güncelleme Notları
                </button>
                <span className="text-xs text-gray-600">{sortedNotifications.length} bildirim</span>
              </div>
            )}
          </motion.div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}