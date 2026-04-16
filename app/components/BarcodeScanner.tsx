/**
 * BarcodeScanner — Web BarcodeDetector API kullanarak kamera ile barkod/QR okuma
 * Desteklenen tarayıcılar: Chrome 83+, Edge 83+, Samsung Internet
 * Firefox/Safari'de API yoksa dosyadan manuel giriş gösterir
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, X, Loader2, AlertCircle, ScanLine } from 'lucide-react';

interface BarcodeScannerProps {
  onDetect: (value: string) => void;
  onClose: () => void;
}

const SUPPORTED = typeof window !== 'undefined' && 'BarcodeDetector' in window;

export function BarcodeScanner({ onDetect, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const [status, setStatus] = useState<'init' | 'scanning' | 'error'>('init');
  const [errorMsg, setErrorMsg] = useState('');
  const [manualValue, setManualValue] = useState('');

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const startScanning = useCallback(async () => {
    if (!SUPPORTED) {
      setStatus('error');
      setErrorMsg('Bu tarayıcı BarcodeDetector API desteklemiyor. Lütfen barkod numarasını elle girin.');
      return;
    }
    try {
      setStatus('init');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // @ts-ignore — BarcodeDetector is newer API
      const detector = new BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e', 'itf', 'data_matrix'],
      });
      detectorRef.current = detector;
      setStatus('scanning');

      const detect = async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) {
          rafRef.current = requestAnimationFrame(detect);
          return;
        }
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) {
            const val = barcodes[0].rawValue;
            stopCamera();
            onDetect(val);
            return;
          }
        } catch { /* frame not ready */ }
        rafRef.current = requestAnimationFrame(detect);
      };
      rafRef.current = requestAnimationFrame(detect);
    } catch (e: any) {
      setStatus('error');
      setErrorMsg(e?.message || 'Kamera erişimi reddedildi');
    }
  }, [onDetect, stopCamera]);

  useEffect(() => {
    startScanning();
    return () => stopCamera();
  }, [startScanning, stopCamera]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualValue.trim()) return;
    onDetect(manualValue.trim());
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#0d0d12] rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-blue-400" />
            <h2 className="font-bold text-white">Barkod / QR Tara</h2>
          </div>
          <button onClick={() => { stopCamera(); onClose(); }} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Camera view */}
        <div className="relative aspect-video bg-black overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            muted
            playsInline
          />
          {/* Scan overlay */}
          {status === 'scanning' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-48 h-32">
                <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-blue-400 rounded-tl-sm" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-blue-400 rounded-tr-sm" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-blue-400 rounded-bl-sm" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-blue-400 rounded-br-sm" />
                {/* Scanning line animation */}
                <div className="absolute left-1 right-1 h-0.5 bg-blue-400/70 animate-[scan_2s_ease-in-out_infinite] shadow-[0_0_8px_#60a5fa]" style={{ top: '50%' }} />
              </div>
            </div>
          )}
          {status === 'init' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            </div>
          )}
          {status === 'error' && !SUPPORTED && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="text-center px-4">
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                <p className="text-xs text-gray-300">Kamera desteği yok</p>
              </div>
            </div>
          )}
        </div>

        {/* Status & Manual input */}
        <div className="p-4 space-y-3">
          {status === 'scanning' && (
            <p className="text-[11px] text-center text-gray-500 animate-pulse">Barkod kamera alanına tutun…</p>
          )}
          {status === 'error' && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-300">{errorMsg}</p>
            </div>
          )}
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              value={manualValue}
              onChange={e => setManualValue(e.target.value)}
              placeholder="Manuel barkod/SKU gir…"
              className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
            />
            <button
              type="submit"
              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-colors"
            >
              Ara
            </button>
          </form>
        </div>
      </div>

      <style>{`
        @keyframes scan {
          0%, 100% { top: 10%; }
          50% { top: 90%; }
        }
      `}</style>
    </div>
  );
}
