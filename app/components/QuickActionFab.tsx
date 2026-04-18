import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  ShoppingCart,
  Users,
  Package,
  Banknote,
  Receipt,
  X,
  CalendarCheck,
  Wallet,
  FileText
} from 'lucide-react';

interface QuickAction {
  id: string;
  label: string;
  icon: React.ElementType;
  path: string;
  color: string;
  bg: string;
}

const quickActions: QuickAction[] = [
  { id: 'sale', label: 'Yeni Fiş', icon: ShoppingCart, path: '/sales', color: 'text-green-400', bg: 'bg-green-600/20 border-green-500/30' },
  { id: 'cari', label: 'Cari Ekle', icon: Users, path: '/cari', color: 'text-sky-400', bg: 'bg-sky-600/20 border-sky-500/30' },
  { id: 'tahsilat', label: 'Tahsilat', icon: Banknote, path: '/tahsilat', color: 'text-lime-400', bg: 'bg-lime-600/20 border-lime-500/30' },
  { id: 'stok', label: 'Stok Girişi', icon: Package, path: '/stok', color: 'text-indigo-400', bg: 'bg-indigo-600/20 border-indigo-500/30' },
  { id: 'kasa', label: 'Kasa İşlemi', icon: Wallet, path: '/kasa', color: 'text-emerald-400', bg: 'bg-emerald-600/20 border-emerald-500/30' },
  { id: 'gunsonu', label: 'Gün Sonu', icon: CalendarCheck, path: '/gun-sonu', color: 'text-rose-400', bg: 'bg-rose-600/20 border-rose-500/30' },
];

export function QuickActionFab() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Close on route change
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Close on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[44]"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Actions */}
      <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-6 right-4 lg:right-6 z-[48] flex flex-col-reverse items-end gap-2">
        {/* Quick action buttons */}
        <AnimatePresence>
          {isOpen && quickActions.map((action, index) => {
            const Icon = action.icon;
            return (
              <motion.button
                key={action.id}
                initial={{ opacity: 0, y: 20, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.8 }}
                transition={{ delay: index * 0.04, type: "spring", stiffness: 400, damping: 25 }}
                onClick={() => {
                  navigate(action.path);
                  setIsOpen(false);
                }}
                className={`flex items-center gap-3 pl-4 pr-5 py-2.5 rounded-xl border ${action.bg} backdrop-blur-md shadow-lg hover:scale-105 transition-transform`}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${action.color}`} />
                <span className="text-sm font-medium text-white whitespace-nowrap">{action.label}</span>
              </motion.button>
            );
          })}
        </AnimatePresence>

        {/* FAB Button */}
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => setIsOpen(prev => !prev)}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 ${
            isOpen 
              ? 'bg-accent shadow-background/50 rotate-0' 
              : 'bg-gradient-to-br from-blue-600 to-blue-700 shadow-blue-600/30 hover:shadow-blue-500/50'
          }`}
        >
          <motion.div
            animate={{ rotate: isOpen ? 45 : 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            {isOpen ? <X className="w-5 h-5 text-white" /> : <Plus className="w-6 h-6 text-white" />}
          </motion.div>
        </motion.button>
      </div>
    </>
  );
}