import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Minus, LucideIcon } from 'lucide-react';

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  placeholder?: string;
  icon?: LucideIcon;
  required?: boolean;
  showButtons?: boolean;
  precision?: number;
  className?: string;
  highlight?: boolean;
  quickButtons?: number[];
  disabled?: boolean;
}

export function NumberInput({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  unit,
  placeholder = '0',
  icon: Icon,
  required = false,
  showButtons = true,
  precision = 2,
  className = '',
  highlight = false,
  quickButtons,
  disabled = false,
}: NumberInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [rawInput, setRawInput] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clamp = useCallback((val: number) => {
    let result = val;
    if (min !== undefined && result < min) result = min;
    if (max !== undefined && result > max) result = max;
    return parseFloat(result.toFixed(precision));
  }, [min, max, precision]);

  const handleIncrement = useCallback(() => {
    onChange(clamp(value + step));
  }, [value, step, onChange, clamp]);

  const handleDecrement = useCallback(() => {
    onChange(clamp(value - step));
  }, [value, step, onChange, clamp]);

  // Long press for rapid increment/decrement
  const startLongPress = useCallback((action: 'inc' | 'dec') => {
    const fn = action === 'inc' ? handleIncrement : handleDecrement;
    fn();
    let speed = 200;
    let count = 0;
    longPressTimer.current = setInterval(() => {
      fn();
      count++;
      if (count > 5 && speed > 50) {
        if (longPressTimer.current) clearInterval(longPressTimer.current);
        speed = 80;
        longPressTimer.current = setInterval(fn, speed);
      }
    }, speed);
  }, [handleIncrement, handleDecrement]);

  const stopLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearInterval(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setRawInput(raw);

    if (raw === '' || raw === '-') {
      return; // Don't update parent yet
    }

    // Allow decimal comma (Turkish style) and dot
    const normalized = raw.replace(',', '.');
    const numValue = parseFloat(normalized);

    if (!isNaN(numValue)) {
      onChange(clamp(numValue));
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    setIsEditing(true);
    setRawInput(value ? value.toString() : '');
  };

  const handleBlur = () => {
    setIsFocused(false);
    setIsEditing(false);

    if (rawInput === '' || rawInput === '-') {
      onChange(min || 0);
    }
    setRawInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleIncrement();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleDecrement();
    } else if (e.key === 'Enter') {
      inputRef.current?.blur();
    }
  };

  // Smart display: when editing show raw, otherwise show formatted
  const displayValue = isEditing ? rawInput : (value ? value.toString() : '');

  return (
    <div className={`relative ${className}`}>
      <label className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium mb-1.5">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
        {required && <span className="text-red-400">*</span>}
        {highlight && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 15 }}
            className="ml-1 w-1.5 h-1.5 bg-yellow-400 rounded-full inline-block"
            title="Fiyat alani"
          />
        )}
      </label>

      <div className={`relative flex items-center gap-1.5 ${showButtons ? 'group' : ''}`}>
        {showButtons && (
          <motion.button
            type="button"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onMouseDown={() => startLongPress('dec')}
            onMouseUp={stopLongPress}
            onMouseLeave={stopLongPress}
            onTouchStart={() => startLongPress('dec')}
            onTouchEnd={stopLongPress}
            disabled={disabled || value <= min}
            className="w-9 h-9 flex items-center justify-center bg-accent hover:bg-accent/80 disabled:bg-secondary disabled:opacity-30 text-white rounded-lg transition-all disabled:cursor-not-allowed select-none"
          >
            <Minus className="w-3.5 h-3.5" />
          </motion.button>
        )}

        <div
          className="flex-1 relative rounded-lg transition-shadow duration-200"
          style={{
            boxShadow: isFocused
              ? highlight
                ? '0 0 0 1px #eab308, 0 0 12px rgba(234,179,8,0.18)'
                : '0 0 0 1px var(--primary), 0 0 12px rgba(59,130,246,0.15)'
              : '0 0 0 0px transparent',
          }}
        >
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            value={displayValue}
            onChange={handleInputChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className={`w-full px-3 py-2 bg-accent/50 border ${
              highlight
                ? 'border-yellow-500/50 focus:border-yellow-500'
                : 'border-border focus:border-primary'
            } rounded-lg text-white text-sm font-medium focus:outline-none transition-colors duration-150 placeholder-muted-foreground text-center disabled:opacity-50 disabled:cursor-not-allowed ${
              unit ? 'pr-10' : ''
            }`}
          />
          {unit && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-medium pointer-events-none">
              {unit}
            </span>
          )}
        </div>

        {showButtons && (
          <motion.button
            type="button"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onMouseDown={() => startLongPress('inc')}
            onMouseUp={stopLongPress}
            onMouseLeave={stopLongPress}
            onTouchStart={() => startLongPress('inc')}
            onTouchEnd={stopLongPress}
            disabled={disabled || (max !== undefined && value >= max)}
            className="w-9 h-9 flex items-center justify-center bg-accent hover:bg-accent/80 disabled:bg-secondary disabled:opacity-30 text-white rounded-lg transition-all disabled:cursor-not-allowed select-none"
          >
            <Plus className="w-3.5 h-3.5" />
          </motion.button>
        )}
      </div>

      {/* Quick Buttons for common quantities */}
      <AnimatePresence>
        {quickButtons && quickButtons.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="flex gap-1 mt-1.5 flex-wrap"
          >
            {quickButtons.map((qty) => (
              <button
                key={qty}
                type="button"
                onClick={() => onChange(clamp(qty))}
                disabled={disabled}
                className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-all ${
                  value === qty
                    ? 'bg-blue-600/30 text-blue-400 border border-blue-500/30'
                    : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60 border border-white/5'
                }`}
              >
                {qty} {unit || ''}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Value Preview */}
      {value > 0 && !isEditing && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-1 text-xs text-muted-foreground flex items-center gap-1"
        >
          <span className="w-1 h-1 bg-primary rounded-full" />
          {value.toLocaleString('tr-TR', { maximumFractionDigits: precision })} {unit}
        </motion.div>
      )}
    </div>
  );
}
