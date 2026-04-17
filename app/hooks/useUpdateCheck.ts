import { useEffect } from 'react';
import { toast } from 'sonner';
import { CURRENT_VERSION, SEEN_VERSION_KEY, SEED_NOTES } from '../utils/updateNotes';

/**
 * Uygulama yüklendiğinde versiyon kontrolü yapar.
 * Kullanıcı henüz bu versiyonu görmediyse "Yeni güncelleme" toastı gösterir.
 */
export function useUpdateCheck() {
  useEffect(() => {
    const seen = localStorage.getItem(SEEN_VERSION_KEY);
    if (seen === CURRENT_VERSION) return;

    // Yeni özelliklerin sayısını bul
    const newNotes = SEED_NOTES.filter(n => n.isNew);
    const featureCount = newNotes.length;

    // Kısa gecikme — uygulama tam yüklensin
    const timer = setTimeout(() => {
      toast.info(
        `Güncelleme: ${CURRENT_VERSION}${featureCount > 0 ? ` · ${featureCount} yenilik` : ''}`,
        {
          id: 'update-check',
          duration: 6000,
          action: {
            label: 'Detaylar',
            onClick: () => {
              window.location.href = '/guncelleme-notlari';
            },
          },
        }
      );
    }, 1500);

    return () => clearTimeout(timer);
  }, []);
}
