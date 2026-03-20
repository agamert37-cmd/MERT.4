import React, { useState, useRef, useEffect } from 'react';
import { Calendar, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isToday as isTodayFn } from 'date-fns';
import { tr, enUS, ru } from 'date-fns/locale';
import { useLanguage } from '../contexts/LanguageContext';

const localeMap: Record<string, any> = { tr, en: enUS, ru, uz: tr };

interface DatePickerInputProps {
  label: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  showTime?: boolean;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
}

export function DatePickerInput({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  className = '',
  showTime = false,
  minDate,
  maxDate,
  disabled = false,
}: DatePickerInputProps) {
  const { t, lang } = useLanguage();
  const locale = localeMap[lang] || tr;
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(value || new Date());
  const [timeStr, setTimeStr] = useState(() => {
    if (value) return format(value, 'HH:mm');
    return format(new Date(), 'HH:mm');
  });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) {
      setCurrentMonth(value);
      setTimeStr(format(value, 'HH:mm'));
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const dayNames = ['Pzt', 'Sal', 'Car', 'Per', 'Cum', 'Cmt', 'Paz'];
  const dayNamesMap: Record<string, string[]> = {
    tr: ['Pzt', 'Sal', 'Car', 'Per', 'Cum', 'Cmt', 'Paz'],
    en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
    uz: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
  };
  const localDayNames = dayNamesMap[lang] || dayNames;

  const handleSelectDay = (day: Date) => {
    let newDate = new Date(day);
    if (showTime && timeStr) {
      const [h, m] = timeStr.split(':').map(Number);
      newDate.setHours(h || 0, m || 0, 0, 0);
    }
    onChange(newDate);
    if (!showTime) setIsOpen(false);
  };

  const handleTimeChange = (newTime: string) => {
    setTimeStr(newTime);
    if (value) {
      const [h, m] = newTime.split(':').map(Number);
      const updated = new Date(value);
      updated.setHours(h || 0, m || 0, 0, 0);
      onChange(updated);
    }
  };

  const isDayDisabled = (day: Date) => {
    if (minDate && day < new Date(minDate.setHours(0, 0, 0, 0))) return true;
    if (maxDate && day > new Date(maxDate.setHours(23, 59, 59, 999))) return true;
    return false;
  };

  const displayValue = value
    ? showTime
      ? format(value, 'dd MMMM yyyy - HH:mm', { locale })
      : format(value, 'dd MMMM yyyy - EEEE', { locale })
    : '';

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <label className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1.5">
        <Calendar className="w-3.5 h-3.5" />
        {label}
        {required && <span className="text-red-400">*</span>}
      </label>

      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full px-3 py-2.5 bg-accent/50 border rounded-lg text-sm focus:outline-none transition-all duration-200 flex items-center justify-between group ${
          disabled ? 'opacity-50 cursor-not-allowed' :
          isOpen
            ? 'border-primary shadow-[0_0_0_1px_var(--primary),0_0_12px_rgba(59,130,246,0.15)]'
            : 'border-border hover:border-border-hover'
        }`}
      >
        <span className={displayValue ? 'text-white' : 'text-muted-foreground'}>
          {displayValue || placeholder || t('common.date', 'Tarih secin')}
        </span>
        <Calendar className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary' : 'text-muted-foreground group-hover:text-foreground/70'}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="absolute top-full left-0 mt-2 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden w-[320px]"
          >
            {/* Month Navigation */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <button
                type="button"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-white/70" />
              </button>
              <span className="text-white font-semibold text-sm">
                {format(currentMonth, 'MMMM yyyy', { locale })}
              </span>
              <button
                type="button"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-white/70" />
              </button>
            </div>

            {/* Day Names */}
            <div className="grid grid-cols-7 gap-0 px-3 pb-1">
              {localDayNames.map((d, i) => (
                <div key={i} className="text-center text-[10px] font-bold text-white/40 uppercase tracking-wider py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-0.5 px-3 pb-3">
              {days.map((day, i) => {
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isSelected = value ? isSameDay(day, value) : false;
                const isToday = isTodayFn(day);
                const isDisabled = isDayDisabled(day);

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => !isDisabled && handleSelectDay(day)}
                    disabled={isDisabled}
                    className={`relative w-full aspect-square flex items-center justify-center text-xs rounded-lg transition-all duration-150
                      ${isDisabled ? 'opacity-20 cursor-not-allowed' : 'hover:bg-white/10 cursor-pointer'}
                      ${!isCurrentMonth ? 'text-white/20' : 'text-white/80'}
                      ${isSelected ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-600/30 hover:bg-blue-500' : ''}
                      ${isToday && !isSelected ? 'bg-white/10 font-bold text-white ring-1 ring-blue-500/50' : ''}
                    `}
                  >
                    {format(day, 'd')}
                  </button>
                );
              })}
            </div>

            {/* Time Picker */}
            {showTime && (
              <div className="px-4 pb-3 border-t border-white/5 pt-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-white/60 text-xs font-medium">{t('common.time', 'Saat')}:</span>
                  <input
                    type="time"
                    value={timeStr}
                    onChange={(e) => handleTimeChange(e.target.value)}
                    className="flex-1 px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500/50 [color-scheme:dark]"
                  />
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="border-t border-white/5 p-2.5 bg-white/[0.02] flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  if (showTime) {
                    setTimeStr(format(now, 'HH:mm'));
                  }
                  onChange(now);
                  setCurrentMonth(now);
                  if (!showTime) setIsOpen(false);
                }}
                className="flex-1 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs font-medium rounded-lg transition-colors"
              >
                {t('common.today', 'Bugun')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const yesterday = new Date();
                  yesterday.setDate(yesterday.getDate() - 1);
                  onChange(yesterday);
                  setCurrentMonth(yesterday);
                  if (!showTime) setIsOpen(false);
                }}
                className="flex-1 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/60 text-xs font-medium rounded-lg transition-colors"
              >
                {t('common.yesterday', 'Dun')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setIsOpen(false);
                }}
                className="flex-1 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/60 text-xs font-medium rounded-lg transition-colors"
              >
                {t('common.clearDate', 'Temizle')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
