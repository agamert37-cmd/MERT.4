import { useState } from 'react';
import { GitMerge, X, Check, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import type { ConflictInfo } from '../hooks/useTableSync';

interface Props {
  conflicts: ConflictInfo[];
  resolveConflict: (id: string, winnerRev: string) => Promise<void>;
  tableName?: string;
}

/** Tarih string'ini okunabilir formata çevirir */
function fmtDate(val: unknown): string {
  if (!val) return '—';
  const d = new Date(val as string);
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Değeri okunabilir stringe dönüştür */
function displayVal(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'Evet' : 'Hayır';
  if (typeof val === 'object') return JSON.stringify(val, null, 1);
  // Tarih gibi görünüyorsa formatla
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return fmtDate(val);
  return String(val);
}

/** İki doc arasındaki farklı alanları döner */
function diffKeys(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const skip = new Set(['_id', '_rev', '_conflicts', '_deleted', '_attachments']);
  const all = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...all].filter(k => !skip.has(k) && String(a[k]) !== String(b[k]));
}

interface ConflictCardProps {
  conflict: ConflictInfo;
  onResolve: (winnerRev: string) => Promise<void>;
}

function ConflictCard({ conflict, onResolve }: ConflictCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);

  const localDoc = conflict.localDoc;
  // conflictDocs dizi boşsa, conflictRevs'den rev bilgisini göster
  const otherDocs = conflict.conflictDocs.length > 0
    ? conflict.conflictDocs
    : conflict.conflictRevs.map(rev => ({ _rev: rev, _id: conflict.id, _noData: true }));

  const allVersions = [localDoc, ...otherDocs];
  const changed = otherDocs.length > 0 && !otherDocs[0]._noData
    ? diffKeys(localDoc, otherDocs[0])
    : Object.keys(localDoc).filter(k => !['_id', '_rev', '_conflicts', '_deleted', '_attachments'].includes(k));

  const handleChoose = async (rev: string) => {
    setResolving(true);
    setChosen(rev);
    try {
      await onResolve(rev);
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-xl overflow-hidden">
      {/* Başlık */}
      <div className="flex items-center gap-3 px-4 py-3">
        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            ID: {conflict.id.slice(0, 16)}…
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {conflict.conflictRevs.length + 1} versiyon çakışıyor
          </p>
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Farklı alanlar özeti */}
      {changed.length > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1">
          {changed.slice(0, 5).map(k => (
            <span key={k} className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full">
              {k}
            </span>
          ))}
          {changed.length > 5 && (
            <span className="text-[10px] px-2 py-0.5 text-gray-500">+{changed.length - 5} alan</span>
          )}
        </div>
      )}

      {/* Versiyon karşılaştırması */}
      {expanded && (
        <div className="border-t border-white/5">
          <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${allVersions.length}, 1fr)` }}>
            {allVersions.map((doc, idx) => {
              const isLocal = idx === 0;
              const rev = (doc as any)._rev as string;
              const isChosen = chosen === rev;
              return (
                <div key={rev} className={`p-3 ${isLocal ? 'bg-blue-500/5' : 'bg-white/[0.02]'}`}>
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      isLocal ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {isLocal ? 'Mevcut' : `Versiyon ${idx}`}
                    </span>
                    <button
                      onClick={() => handleChoose(rev)}
                      disabled={resolving}
                      className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg transition-colors ${
                        isChosen
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-white/5 text-gray-400 hover:bg-green-500/10 hover:text-green-400'
                      }`}
                    >
                      <Check className="w-3 h-3" />
                      {isChosen ? 'Seçildi' : 'Bunu Kullan'}
                    </button>
                  </div>
                  {(doc as any)._noData ? (
                    <p className="text-xs text-gray-600 italic">Rev: {rev.slice(0, 20)}…</p>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {(changed.length > 0 ? changed : Object.keys(doc).filter(k => !['_id', '_rev', '_conflicts', '_deleted'].includes(k))).map(k => (
                        <div key={k} className="flex gap-2 text-xs">
                          <span className="text-gray-500 min-w-0 truncate flex-shrink-0" style={{ maxWidth: '40%' }}>{k}</span>
                          <span className="text-gray-300 truncate">{displayVal((doc as any)[k])}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Çakışma Çözümleme Paneli
 * - `conflicts` boşsa render etmez
 * - Köşede badge gösterir, tıklanınca panel açılır
 */
export function ConflictResolver({ conflicts, resolveConflict, tableName }: Props) {
  const [open, setOpen] = useState(false);

  if (conflicts.length === 0) return null;

  return (
    <>
      {/* Tetikleyici badge */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-[500] flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold text-xs px-3 py-2 rounded-full shadow-lg shadow-amber-500/30 transition-colors"
      >
        <GitMerge className="w-4 h-4" />
        {conflicts.length} çakışma
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-[600] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-[#0d1117] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
              <GitMerge className="w-5 h-5 text-amber-400" />
              <div className="flex-1">
                <h2 className="text-base font-bold text-white">Veri Çakışmaları</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {tableName ? `${tableName} — ` : ''}{conflicts.length} kayıtta çakışma tespit edildi
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Liste */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <p className="text-xs text-gray-500">
                Aynı kayıt birden fazla cihazda veya sekmede farklı şekilde değiştirildi.
                Hangi versiyonu korumak istediğinizi seçin.
              </p>
              {conflicts.map(c => (
                <ConflictCard
                  key={c.id}
                  conflict={c}
                  onResolve={(rev) => resolveConflict(c.id, rev)}
                />
              ))}
            </div>

            <div className="px-5 py-3 border-t border-white/10">
              <p className="text-[10px] text-gray-600 text-center">
                "Bunu Kullan" seçiminden sonra diğer versiyonlar kalıcı olarak silinir.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
