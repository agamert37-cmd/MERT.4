import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wallet, Banknote, CreditCard, TrendingUp, Receipt, X } from 'lucide-react';
import { NumberInput } from './NumberInput';

interface PaymentInfo {
  method: 'nakit' | 'kredi-karti' | 'havale' | 'cek';
  amount: number;
  bankName?: string;
  slipPhoto?: string;
  receiverEmployee?: string;
  receiverBank?: string;
  receiptPhoto?: string;
  dueDate?: string;
  checkPhoto?: string;
}

interface PaymentSelectorProps {
  totalAmount: number;
  paymentInfo: PaymentInfo | null;
  onChange: (payment: PaymentInfo | null) => void;
}

export function PaymentSelector({ totalAmount, paymentInfo, onChange }: PaymentSelectorProps) {
  return (
    <div className="col-span-2 border-t border-border pt-4 sm:pt-5 mt-2">
      {/* Başlık */}
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div>
          <p className="text-muted-foreground text-xs sm:text-sm font-medium">Ödeme Durumu</p>
          <p className="text-muted-foreground/70 text-[10px] sm:text-xs mt-0.5 sm:mt-1">Müşteri nasıl ödeme yaptı?</p>
        </div>
        <div className="text-right">
          <p className="text-white text-base sm:text-lg font-bold">₺{totalAmount.toLocaleString('tr-TR')}</p>
          <p className="text-muted-foreground text-[10px] sm:text-xs">Toplam Tutar</p>
        </div>
      </div>

      {/* Veresiye veya Ödeme Seçimi */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3 sm:mb-4">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => onChange(null)}
          className={`p-3 sm:p-4 rounded-xl border-2 transition-all active:opacity-80 ${
            !paymentInfo
              ? 'border-orange-500 bg-orange-600/10'
              : 'border-border bg-accent/50 hover:border-border-hover'
          }`}
        >
          <Wallet className={`w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1.5 sm:mb-2 ${
            !paymentInfo ? 'text-orange-400' : 'text-muted-foreground'
          }`} />
          <p className={`text-xs sm:text-sm font-bold ${
            !paymentInfo ? 'text-orange-400' : 'text-muted-foreground'
          }`}>
            VERESİYE
          </p>
          <p className={`text-[10px] sm:text-xs mt-0.5 sm:mt-1 ${
            !paymentInfo ? 'text-orange-300' : 'text-muted-foreground/70'
          }`}>
            Ödeme yok
          </p>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => onChange({ 
            method: 'nakit',
            amount: totalAmount
          })}
          className={`p-3 sm:p-4 rounded-xl border-2 transition-all active:opacity-80 ${
            paymentInfo
              ? 'border-green-500 bg-green-600/10'
              : 'border-border bg-accent/50 hover:border-border-hover'
          }`}
        >
          <Banknote className={`w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1.5 sm:mb-2 ${
            paymentInfo ? 'text-green-400' : 'text-muted-foreground'
          }`} />
          <p className={`text-xs sm:text-sm font-bold ${
            paymentInfo ? 'text-green-400' : 'text-muted-foreground'
          }`}>
            ÖDEME VAR
          </p>
          <p className={`text-[10px] sm:text-xs mt-0.5 sm:mt-1 ${
            paymentInfo ? 'text-green-300' : 'text-muted-foreground/70'
          }`}>
            Tam/Kısmi ödeme
          </p>
        </motion.button>
      </div>

      {/* Ödeme Detayları */}
      <AnimatePresence>
        {paymentInfo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <div className="p-3 sm:p-5 bg-secondary/50 border border-border rounded-xl space-y-3 sm:space-y-4">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <h4 className="text-white font-bold flex items-center gap-2 text-sm sm:text-base">
                  <CreditCard className="w-4 h-4" />
                  Ödeme Bilgileri
                </h4>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => onChange(null)}
                  className="p-2 hover:bg-accent active:bg-accent/80 rounded-lg transition-colors"
                  title="Ödemeyi İptal Et (Veresiye Yap)"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </motion.button>
              </div>

              {/* Ödeme Yöntemi */}
              <div>
                <label className="text-muted-foreground text-[10px] sm:text-xs font-medium mb-1.5 sm:mb-2 block">
                  Ödeme Yöntemi <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                  {[
                    { value: 'nakit' as const, label: 'Nakit', icon: Banknote },
                    { value: 'kredi-karti' as const, label: 'Kart', icon: CreditCard },
                    { value: 'havale' as const, label: 'Havale', icon: TrendingUp },
                    { value: 'cek' as const, label: 'Çek', icon: Receipt },
                  ].map(method => {
                    const Icon = method.icon;
                    return (
                      <motion.button
                        key={method.value}
                        whileTap={{ scale: 0.93 }}
                        onClick={() => onChange({ 
                          ...paymentInfo, 
                          method: method.value,
                          amount: paymentInfo?.amount || totalAmount
                        })}
                        className={`p-2.5 sm:p-3 rounded-xl sm:rounded-lg border transition-all active:opacity-80 ${
                          paymentInfo?.method === method.value
                            ? 'border-blue-500 bg-blue-600/20'
                            : 'border-border bg-accent/50 hover:border-border-hover'
                        }`}
                      >
                        <Icon className={`w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-1 ${
                          paymentInfo?.method === method.value ? 'text-blue-400' : 'text-muted-foreground'
                        }`} />
                        <p className={`text-[9px] sm:text-[10px] font-medium leading-tight ${
                          paymentInfo?.method === method.value ? 'text-blue-400' : 'text-muted-foreground'
                        }`}>
                          {method.label}
                        </p>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Ödeme Tutarı */}
              <div>
                <NumberInput
                  label="Ödenen Tutar"
                  value={paymentInfo?.amount || 0}
                  onChange={(value) => onChange({ ...paymentInfo, amount: value })}
                  min={0}
                  max={totalAmount}
                  step={0.01}
                  unit="₺"
                  showButtons={false}
                  precision={2}
                  required={true}
                  placeholder={totalAmount.toFixed(2)}
                />
                
                {/* Kalan Tutar Uyarısı */}
                {paymentInfo?.amount > 0 && paymentInfo.amount < totalAmount && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 p-2 bg-yellow-600/10 border border-yellow-600/30 rounded-xl sm:rounded-lg"
                  >
                    <p className="text-yellow-400 text-[10px] sm:text-xs font-medium">
                      Kısmi Ödeme: Kalan ₺{(totalAmount - paymentInfo.amount).toLocaleString('tr-TR')} veresiye
                    </p>
                  </motion.div>
                )}
                
                {/* Tam Tutar Butonu */}
                {paymentInfo?.amount !== totalAmount && (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => onChange({ ...paymentInfo, amount: totalAmount })}
                    className="mt-2 w-full px-3 py-2.5 sm:py-2 bg-blue-600/20 hover:bg-blue-600/30 active:bg-blue-600/40 text-blue-400 text-xs font-medium rounded-xl sm:rounded-lg transition-colors"
                  >
                    Tam Tutarı Gir (₺{totalAmount.toLocaleString('tr-TR')})
                  </motion.button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}