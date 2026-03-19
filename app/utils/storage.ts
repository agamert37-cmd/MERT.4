/**
 * Storage utility - Now powered by Supabase with localStorage fallback
 * All data operations now sync with Supabase automatically
 */

import {
  getFromStorage as getFromLS,
  setInStorage as setInLS,
  removeFromStorage as removeFromLS,
  fetchFromSupabase,
  saveToSupabase,
  insertToSupabase,
  updateInSupabase,
  deleteFromSupabase,
  subscribeToTable,
  createSystemBackup,
  getSystemBackups,
  restoreSystemBackup,
  StorageKey as SK,
  syncFromCloud,
  pushAllToCloud,
  syncKeyToCloud,
  startInitialSync,
  startRealtimeSync,
  stopRealtimeSync,
} from './supabase-storage';

// Re-export everything
export {
  fetchFromSupabase,
  saveToSupabase,
  insertToSupabase,
  updateInSupabase,
  deleteFromSupabase,
  subscribeToTable,
  createSystemBackup,
  getSystemBackups,
  restoreSystemBackup,
  syncFromCloud,
  pushAllToCloud,
  syncKeyToCloud,
  startInitialSync,
  startRealtimeSync,
  stopRealtimeSync,
};

export const StorageKey = SK;

const STORAGE_PREFIX = 'isleyen_et_';

/**
 * Get item from storage (localStorage + Supabase)
 */
export const getFromStorage = getFromLS;

/**
 * Set item in storage (localStorage + Supabase)
 */
export const setInStorage = setInLS;

/**
 * Remove item from storage
 */
export const removeFromStorage = removeFromLS;

/**
 * Clear all app data from localStorage
 */
export const clearAllStorage = (): boolean => {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(STORAGE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
    return true;
  } catch (error) {
    console.error('Error clearing localStorage:', error);
    return false;
  }
};

/**
 * Check if localStorage is available
 */
export const isStorageAvailable = (): boolean => {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
};

/**
 * Get storage size in bytes
 */
export const getStorageSize = (): number => {
  let total = 0;
  for (const key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      total += localStorage[key].length + key.length;
    }
  }
  return total;
};

/**
 * Get app-specific storage size
 */
export const getAppStorageSize = (): number => {
  let total = 0;
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith(STORAGE_PREFIX)) {
      total += localStorage[key].length + key.length;
    }
  });
  return total;
};

/**
 * Backup all app data
 */
export const backupStorage = (): string | null => {
  try {
    const data: Record<string, any> = {};
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(STORAGE_PREFIX)) {
        data[key] = localStorage[key];
      }
    });
    return JSON.stringify(data);
  } catch (error) {
    console.error('Error backing up storage:', error);
    return null;
  }
};

/**
 * Restore data from backup
 */
export const restoreStorage = (backup: string): boolean => {
  try {
    const data = JSON.parse(backup);
    Object.keys(data).forEach(key => {
      localStorage.setItem(key, data[key]);
    });
    return true;
  } catch (error) {
    console.error('Error restoring storage:', error);
    return false;
  }
};

/**
 * Migrate data to new version (for future use)
 */
export const migrateStorageVersion = (fromVersion: number, toVersion: number): boolean => {
  try {
    // Add migration logic here when needed
    console.log(`Migrating storage from v${fromVersion} to v${toVersion}`);
    return true;
  } catch (error) {
    console.error('Error migrating storage:', error);
    return false;
  }
};