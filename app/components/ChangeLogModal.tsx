import { useState, useEffect } from 'react';
import { X, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { getChangelog, type ChangeEntry } from '../lib/db-changelog';

interface Props {
  tableName: string;
  docId: string;
  onClose: () => void;
}

export function ChangeLogModal({ tableName, docId, onClose }: Props) {
  const [changelog, setChangelog] = useState<ChangeEntry[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadChangelog();
  }, [tableName, docId]);

  const loadChangelog = async () => {
    setLoading(true);
    try {
      const log = await getChangelog(tableName, docId);
      setChangelog(log);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-slate-900 border border-white/10 rounded-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-400" />
            Değişim Geçmişi
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-gray-400 text-sm">Yükleniyor...</p>
          ) : changelog.length === 0 ? (
            <p className="text-gray-500 text-sm">Geçmiş yok</p>
          ) : (
            <div className="space-y-2">
              {changelog.map((entry, idx) => (
                <div
                  key={idx}
                  className="border border-white/5 rounded-lg bg-white/[0.02] overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                    className="w-full flex items-center justify-between p-3 hover:bg-white/[0.05] transition-colors"
                  >
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-semibold text-white">
                        {entry.action === 'create' && '✨ Oluşturuldu'}
                        {entry.action === 'update' && '✏️ Güncellendi'}
                        {entry.action === 'delete' && '🗑️ Silindi'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(entry.timestamp).toLocaleString('tr-TR')}
                        {entry.userName && ` • ${entry.userName}`}
                      </p>
                    </div>
                    {expandedIdx === idx ? (
                      <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    )}
                  </button>

                  {expandedIdx === idx && entry.changes && (
                    <div className="p-3 bg-black/20 border-t border-white/5">
                      <div className="space-y-2 text-xs">
                        {Object.entries(entry.changes).map(([field, change]) => (
                          <div key={field} className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="font-semibold text-gray-400">{field}</p>
                              <p className="text-red-400/60 mt-1 break-all">
                                {JSON.stringify(change.old)}
                              </p>
                            </div>
                            <div>
                              <p className="font-semibold text-green-400/60">Yeni</p>
                              <p className="text-green-400 mt-1 break-all">
                                {JSON.stringify(change.new)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-600/20 hover:bg-gray-600/30 text-gray-400 text-sm font-bold rounded-lg"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
