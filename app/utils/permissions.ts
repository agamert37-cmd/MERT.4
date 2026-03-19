/**
 * Merkezi Yetkilendirme Utility - ISLEYEN ET ERP
 * 
 * Tum sayfalarda kullanilacak tek bir hasPermission fonksiyonu.
 * RBAC (Role Based Access Control) kurallarini uygular.
 */

interface PermissionCheckParams {
  user: { id?: string; role?: string; name?: string } | null;
  currentEmployee: { permissions?: string[]; role?: string } | null;
  permission: string; // e.g. 'stok_add', 'cari_edit', 'ayarlar_delete'
}

/**
 * Merkezi yetki kontrolu.
 * 
 * Yetki onceligi:
 * 1. Super Admin (admin-super, admin-1) -> her sey serbest
 * 2. Yonetici rolu -> her sey serbest
 * 3. Personel -> sadece belirli izinler
 * 
 * Kullanim:
 * ```ts
 * const canAdd = hasPermission({ user, currentEmployee, permission: 'stok_add' });
 * ```
 */
export function hasPermission({ user, currentEmployee, permission }: PermissionCheckParams): boolean {
  if (!user) return false;
  
  // Super admin her zaman yetkili
  if (user.id === 'admin-super' || user.id === 'admin-1') return true;
  
  // Yonetici rolu her zaman yetkili
  if (user.role === 'Yönetici') return true;
  
  // Personel icin izin kontrolu
  if (currentEmployee?.permissions?.includes(permission)) return true;
  
  return false;
}

/**
 * Birden fazla yetkiden herhangi birine sahip mi kontrol eder.
 */
export function hasAnyPermission({ user, currentEmployee, permissions }: { 
  user: { id?: string; role?: string; name?: string } | null; 
  currentEmployee: { permissions?: string[]; role?: string } | null; 
  permissions: string[];
}): boolean {
  return permissions.some(p => hasPermission({ user, currentEmployee, permission: p }));
}

/**
 * Tum yetkilere sahip mi kontrol eder.
 */
export function hasAllPermissions({ user, currentEmployee, permissions }: { 
  user: { id?: string; role?: string; name?: string } | null; 
  currentEmployee: { permissions?: string[]; role?: string } | null; 
  permissions: string[];
}): boolean {
  return permissions.every(p => hasPermission({ user, currentEmployee, permission: p }));
}

/**
 * Sayfa bazli yetki modulleri
 * Her sayfa icin add/edit/delete/view izinlerini tek satirda kontrol edin.
 */
export function getPagePermissions(
  user: { id?: string; role?: string; name?: string } | null,
  currentEmployee: { permissions?: string[]; role?: string } | null,
  module: string // e.g. 'stok', 'cari', 'kasa', 'personel', 'araclar', 'uretim', 'ayarlar', 'yedekler', 'fisler', 'gunsonu'
) {
  return {
    canView: hasPermission({ user, currentEmployee, permission: `${module}_view` }),
    canAdd: hasPermission({ user, currentEmployee, permission: `${module}_add` }),
    canEdit: hasPermission({ user, currentEmployee, permission: `${module}_edit` }),
    canDelete: hasPermission({ user, currentEmployee, permission: `${module}_delete` }),
    canManage: hasPermission({ user, currentEmployee, permission: `${module}_manage` }),
  };
}
