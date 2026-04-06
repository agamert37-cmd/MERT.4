import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Sayfa seviyesi hata yakalayıcı.
 * Lazy-loaded sayfalarda bir crash oluşursa beyaz ekran yerine
 * kullanıcıya anlamlı bir hata mesajı ve çözüm seçenekleri gösterir.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Sayfa hatası:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const msg = this.state.error?.message || 'Bilinmeyen hata';

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-6">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Sayfa yüklenemedi</h2>
        <p className="text-sm text-gray-500 mb-1">Bir hata oluştu. Lütfen sayfayı yenileyin.</p>
        <p className="text-xs text-gray-600 font-mono mb-8 max-w-md break-all">{msg}</p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Tekrar Dene
          </button>
          <a
            href="/dashboard"
            className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm font-bold rounded-xl transition-colors"
          >
            <Home className="w-4 h-4" /> Ana Sayfa
          </a>
        </div>
      </div>
    );
  }
}
