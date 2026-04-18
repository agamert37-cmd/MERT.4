// Soft Delete & Trash System — 30-gün recovery penceresi
import { getDb } from './pouchdb';
import { TABLE_NAMES } from './db-config';

export interface DeletedRecord {
  _id: string;
  tableName: string;
  originalDoc: any;
  deletedAt: string;
  deletedBy: string;
  deletedByName?: string;
}

const TRASH_DB_NAME = 'mert_trash';
const TRASH_TTL_DAYS = 30;

/** Kaydı trash'a taşı (soft delete) */
export async function softDelete(
  tableName: string,
  docId: string,
  userId: string,
  userName?: string
): Promise<void> {
  try {
    const db = getDb(tableName);
    const doc = await db.get(docId);

    // Trash DB'sine kaydet
    const trashDb = getDb(TRASH_DB_NAME);
    const trashRecord: DeletedRecord = {
      _id: `${tableName}__${docId}__${Date.now()}`,
      tableName,
      originalDoc: doc,
      deletedAt: new Date().toISOString(),
      deletedBy: userId,
      deletedByName: userName,
    };
    await trashDb.put(trashRecord);

    // Orijinal DB'den sil
    await db.remove(doc);
  } catch (e) {
    console.error('[softDelete]', e);
    throw e;
  }
}

/** Trash'tan geri al */
export async function restoreFromTrash(trashRecordId: string): Promise<{ tableName: string; docId: string }> {
  try {
    const trashDb = getDb(TRASH_DB_NAME);
    const trashRecord = await trashDb.get(trashRecordId) as any;

    const { tableName, originalDoc } = trashRecord;
    const db = getDb(tableName);

    // Orijinal doc'u restore et (aynı _id ile)
    await db.put({
      ...originalDoc,
      _rev: undefined, // Yeni revision oluştur
    });

    // Trash record'u sil
    await trashDb.remove(trashRecord);

    return { tableName, docId: originalDoc._id };
  } catch (e) {
    console.error('[restoreFromTrash]', e);
    throw e;
  }
}

/** Trash listesi (30 gün içinde silinmiş) */
export async function getTrashList(): Promise<DeletedRecord[]> {
  try {
    const trashDb = getDb(TRASH_DB_NAME);
    const result = await trashDb.allDocs({ include_docs: true });
    const cutoff = new Date(Date.now() - TRASH_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    return result.rows
      .map(row => row.doc as any)
      .filter(doc => doc.deletedAt > cutoff)
      .sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
  } catch (e) {
    console.error('[getTrashList]', e);
    return [];
  }
}

/** Kalıcı silme (trash'tan tamamen çıkar) */
export async function permanentlyDelete(trashRecordId: string): Promise<void> {
  try {
    const trashDb = getDb(TRASH_DB_NAME);
    const doc = await trashDb.get(trashRecordId);
    await trashDb.remove(doc);
  } catch (e) {
    console.error('[permanentlyDelete]', e);
    throw e;
  }
}

/** Eski trash kayıtlarını otomatik temizle (30+ gün) */
export async function cleanupExpiredTrash(): Promise<number> {
  try {
    const trashDb = getDb(TRASH_DB_NAME);
    const result = await trashDb.allDocs({ include_docs: true });
    const cutoff = new Date(Date.now() - TRASH_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    let deleted = 0;
    for (const row of result.rows) {
      const doc = row.doc as any;
      if (doc.deletedAt <= cutoff) {
        await trashDb.remove(doc);
        deleted++;
      }
    }
    return deleted;
  } catch (e) {
    console.error('[cleanupExpiredTrash]', e);
    return 0;
  }
}

/** Sayfalara soft delete eklemek için helper — _deleted flag set et */
export async function markDeleted(tableName: string, docId: string): Promise<void> {
  try {
    const db = getDb(tableName);
    const doc = await db.get(docId);
    await db.put({
      ...doc,
      _deleted: true,
      _deletedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[markDeleted]', e);
    throw e;
  }
}

/** Soft deleted kayıtları list'te gösterme (default) */
export async function getAllDocsExcludeDeleted(tableName: string): Promise<any[]> {
  try {
    const db = getDb(tableName);
    const result = await db.allDocs({ include_docs: true });
    return result.rows
      .map(row => row.doc as any)
      .filter(doc => !doc._deleted);
  } catch (e) {
    console.error('[getAllDocsExcludeDeleted]', e);
    return [];
  }
}
