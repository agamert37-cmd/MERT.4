import React, { useState } from 'react';
import { LucideIcon } from 'lucide-react';

interface CompactFormInputProps {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'tel' | 'number' | 'password';
  placeholder?: string;
  icon?: LucideIcon;
  required?: boolean;
  className?: string;
  maxLength?: number;
  disabled?: boolean;
  autoComplete?: string;
}

export function CompactFormInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder = '',
  icon: Icon,
  required = false,
  className = '',
  maxLength,
  disabled = false,
  autoComplete
}: CompactFormInputProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className={`relative ${className}`}>
      <label className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium mb-1.5">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
        {required && <span className="text-red-400">*</span>}
      </label>

      <div
        className="rounded-lg transition-shadow duration-200"
        style={{
          boxShadow: isFocused
            ? '0 0 0 1px var(--primary), 0 0 12px rgba(59,130,246,0.15)'
            : '0 0 0 0px transparent',
        }}
      >
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          autoComplete={autoComplete}
          className="w-full px-3 py-2 bg-accent/50 border border-border rounded-lg text-white text-sm focus:outline-none focus:border-primary hover:border-border-hover transition-colors duration-150 placeholder-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Character Counter */}
      {maxLength && value.toString().length > 0 && (
        <div
          className={`absolute right-2 top-[1.85rem] text-[10px] transition-opacity duration-150 ${
            value.toString().length >= maxLength ? 'text-red-400' : 'text-muted-foreground'
          }`}
        >
          {value.toString().length}/{maxLength}
        </div>
      )}
    </div>
  );
}
