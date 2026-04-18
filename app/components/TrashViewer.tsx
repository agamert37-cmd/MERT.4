import { useState, useEffect } from 'react';
import { Trash2, RotateCcw, Zap, Calendar } from 'lucide-react';
import { getTrashList, restoreFromTrash, permanentlyDelete } from '../lib/db-trash';
import { toast } from 'sonner';

export function TrashViewer() {
  const [trashList, setTrashList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    refreshTrash();
  }, []);

  const refreshTrash = async () => {
    setLoading(true);
    try {
      const list = await getTrashList();
      setTrashList(list);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (trashId: string) => {
    try {
      const { tableName, docId } = await restoreFromTrash(trashId);
      toast.success(`${tableName} / ${docId} geri alındı`, { duration: 2000 });
      refreshTrash();
    } catch (e: any) {
      toast.error(`Restore hatası: ${e.message}`, { duration: 2000 });
    }
  };

  const handlePermanentlyDelete = async (trashId: string) => {
    if (!window.confirm('Kalıcı olarak sil? Geri alınamaz.')) return;
    try {
      await permanentlyDelete(trashId);
      toast.success('Kalıcı silindi', { duration: 2000 });
      refreshTrash();
    } catch (e: any) {
      toast.error(`Hata: ${e.message}`, { duration: 2000 });
    }
  };

  if (loading) return <p className="text-gray-400">Yükleniyor...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Trash2 className="w-5 h-5 text-red-400" />
        <h3 className="font-semibold text-white">{trashList.length} silinmiş kayıt (30 gün recovery)</h3>
      </div>

      {trashList.length === 0 ? (
        <p className="text-gray-500 text-sm">Trash boş</p>
      ) : (
        <div className="space-y-2">
          {trashList.map((item, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-white/[0.03] border border-red-500/20 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{item.tableName} / {item.originalDoc._id}</p>
                <div className="flex gap-3 text-xs text-gray-500 mt-1">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(item.deletedAt).toLocaleDateString('tr-TR')}
                  </span>
                  {item.deletedByName && <span>Silen: {item.deletedByName}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleRestore(item._id)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 text-xs font-bold rounded-lg transition-colors"
                >
                  <RotateCcw className="w-3 h-3" /> Geri Al
                </button>
                <button
                  onClick={() => handlePermanentlyDelete(item._id)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-bold rounded-lg transition-colors"
                >
                  <Zap className="w-3 h-3" /> Sil
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={refreshTrash}
        disabled={loading}
        className="w-full mt-4 px-3 py-2 bg-gray-600/20 hover:bg-gray-600/30 disabled:opacity-40 text-gray-400 text-sm font-bold rounded-lg"
      >
        Yenile
      </button>
    </div>
  );
}
