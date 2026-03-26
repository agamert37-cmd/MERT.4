/**
 * PasswordStrengthBar - Glassmorphism tasarimli animasyonlu sifre guc gostergesi
 * analyzePasswordStrength utility fonksiyonunu kullanir
 */
import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, ShieldAlert, ShieldCheck, ShieldX, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { analyzePasswordStrength, type PasswordStrength } from '../utils/security';

interface PasswordStrengthBarProps {
  password: string;
  showSuggestions?: boolean;
  compact?: boolean;
}

const LEVEL_CONFIG: Record<string, { icon: any; glow: string; bgBar: string; borderColor: string; badgeBg: string }> = {
  cok_zayif: { icon: ShieldX, glow: 'shadow-red-500/30', bgBar: 'bg-red-500', borderColor: 'border-red-500/30', badgeBg: 'bg-red-500/15' },
  zayif: { icon: ShieldAlert, glow: 'shadow-orange-500/30', bgBar: 'bg-orange-500', borderColor: 'border-orange-500/30', badgeBg: 'bg-orange-500/15' },
  orta: { icon: Shield, glow: 'shadow-yellow-500/30', bgBar: 'bg-yellow-500', borderColor: 'border-yellow-500/30', badgeBg: 'bg-yellow-500/15' },
  guclu: { icon: ShieldCheck, glow: 'shadow-green-500/30', bgBar: 'bg-green-500', borderColor: 'border-green-500/30', badgeBg: 'bg-green-500/15' },
  cok_guclu: { icon: ShieldCheck, glow: 'shadow-cyan-500/30', bgBar: 'bg-cyan-500', borderColor: 'border-cyan-500/30', badgeBg: 'bg-cyan-500/15' },
};

export function PasswordStrengthBar({ password, showSuggestions = true, compact = false }: PasswordStrengthBarProps) {
  const strength = useMemo(() => analyzePasswordStrength(password), [password]);
  
  if (!password) return null;

  const config = LEVEL_CONFIG[strength.level];
  const Icon = config.icon;

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="mt-2"
      >
        <div className="flex items-center gap-2 mb-1">
          <div className={`h-1.5 flex-1 rounded-full bg-white/5 overflow-hidden`}>
            <motion.div
              className={`h-full rounded-full ${config.bgBar}`}
              initial={{ width: 0 }}
              animate={{ width: `${strength.score}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              style={{ boxShadow: `0 0 8px ${strength.color}40` }}
            />
          </div>
          <span className="text-[10px] font-bold shrink-0" style={{ color: strength.color }}>
            {strength.label}
          </span>
        </div>
      </motion.div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8, height: 0 }}
        animate={{ opacity: 1, y: 0, height: 'auto' }}
        exit={{ opacity: 0, y: -8, height: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="mt-3"
      >
        <div className={`p-3 rounded-xl bg-black/40 backdrop-blur-xl border ${config.borderColor} transition-all duration-300`}>
          {/* Header: Icon + Label + Score */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <motion.div
                key={strength.level}
                initial={{ scale: 0.5, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              >
                <Icon className="w-4 h-4" style={{ color: strength.color, filter: `drop-shadow(0 0 4px ${strength.color}50)` }} />
              </motion.div>
              <span className="text-xs font-bold" style={{ color: strength.color }}>
                {strength.label}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-gray-500">{strength.score}/100</span>
              <motion.div
                className={`px-1.5 py-0.5 rounded-md text-[9px] font-black ${config.badgeBg}`}
                style={{ color: strength.color }}
                key={strength.score}
                initial={{ scale: 1.3 }}
                animate={{ scale: 1 }}
              >
                {strength.score}%
              </motion.div>
            </div>
          </div>

          {/* Progress Bar - 5 Segment */}
          <div className="flex gap-1 mb-2">
            {[0, 1, 2, 3, 4].map(seg => {
              const segThreshold = (seg + 1) * 20;
              const isActive = strength.score >= segThreshold;
              const isPartial = !isActive && strength.score > seg * 20;
              return (
                <motion.div
                  key={seg}
                  className="flex-1 h-1.5 rounded-full overflow-hidden bg-white/5"
                  initial={false}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: strength.color }}
                    initial={{ width: 0 }}
                    animate={{ width: isActive ? '100%' : isPartial ? `${((strength.score - seg * 20) / 20) * 100}%` : '0%' }}
                    transition={{ duration: 0.4, delay: seg * 0.06, ease: 'easeOut' }}
                  />
                </motion.div>
              );
            })}
          </div>

          {/* Suggestions */}
          {showSuggestions && strength.suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="space-y-1 mt-2 pt-2 border-t border-white/5"
            >
              {strength.suggestions.slice(0, 3).map((suggestion, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + i * 0.08 }}
                  className="flex items-start gap-1.5"
                >
                  <AlertTriangle className="w-3 h-3 text-amber-500/70 mt-0.5 shrink-0" />
                  <span className="text-[10px] text-gray-400 leading-tight">{suggestion}</span>
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* All checks passed */}
          {strength.suggestions.length === 0 && strength.score >= 80 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-white/5"
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span className="text-[10px] text-emerald-400 font-medium">Tum guvenlik kontrolleri gecti!</span>
            </motion.div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
