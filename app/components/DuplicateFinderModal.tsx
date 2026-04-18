import { useState, useEffect } from 'react';
import { X, Zap, Plus } from 'lucide-react';
import { findDuplicates, mergeDuplicates, getDefaultDedupFields, type DuplicateCandidate } from '../lib/db-dedup';
import { toast } from 'sonner';

interface Props {
  tableName: string;
  onClose: () => void;
  onMergeComplete?: () => void;
}

export function DuplicateFinderModal({ tableName, onClose, onMergeComplete }: Props) {
  const [candidates, setCandidates] = useState<DuplicateCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    findDups();
  }, [tableName]);

  const findDups = async () => {
    setLoading(true);
    try {
      const fields = getDefaultDedupFields(tableName);
      const dups = await findDuplicates(tableName, fields, 0.85);
      setCandidates(dups);
      if (dups.length === 0) {
        toast.info('Benzer kayıt bulunamadı', { duration: 2000 });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMerge = async (candidate: DuplicateCandidate, primary: 'A' | 'B') => {
    if (!window.confirm('Bu kayıtları birleştirmek istediğinize emin misiniz?')) return;

    setMerging(true);
    try {
      const primaryId = primary === 'A' ? candidate.docA._id : candidate.docB._id;
      const secondaryId = primary === 'A' ? candidate.docB._id : candidate.docA._id;

      await mergeDuplicates(tableName, primaryId, secondaryId, 'system', {});

      toast.success('Kayıtlar birleştirildi', { duration: 2000 });
      setCandidates(candidates.filter(c => c !== candidate));
      onMergeComplete?.();
    } catch (e: any) {
      toast.error(`Merge hatası: ${e.message}`, { duration: 2000 });
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-slate-900 border border-white/10 rounded-xl max-w-3xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            Benzer Kayıtları Bul
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-gray-400 text-sm">Taranıyor...</p>
          ) : candidates.length === 0 ? (
            <p className="text-gray-500 text-sm">Benzer kayıt yok</p>
          ) : (
            <div className="space-y-4">
              {candidates.map((cand, idx) => (
                <div key={idx} className="border border-amber-500/20 bg-amber-500/5 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-amber-300">
                      Benzerlik: {cand.score}% • Eşleşen: {cand.matchedFields.join(', ')}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { doc: cand.docA, label: 'A' },
                      { doc: cand.docB, label: 'B' },
                    ].map(({ doc, label }) => (
                      <div key={label} className="bg-white/5 border border-white/10 rounded-lg p-3">
                        <p className="text-xs font-bold text-gray-400 mb-2">Kayıt {label}</p>
                        <div className="space-y-1 text-xs">
                          {cand.matchedFields.map(field => (
                            <div key={field} className="flex justify-between">
                              <span className="text-gray-500">{field}:</span>
                              <span className="text-white font-semibold truncate ml-2">
                                {String(doc[field]).substring(0, 30)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => handleMerge(cand, label as 'A' | 'B')}
                          disabled={merging}
                          className="w-full mt-3 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 disabled:opacity-40 text-blue-400 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Bunu Tut ve Birleştir
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex gap-2">
          <button
            onClick={findDups}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 disabled:opacity-40 text-amber-400 text-sm font-bold rounded-lg"
          >
            Yeniden Tara
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-600/20 hover:bg-gray-600/30 text-gray-400 text-sm font-bold rounded-lg"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
