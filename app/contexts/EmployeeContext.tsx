import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { StorageKey, getFromStorage, setInStorage } from '../utils/storage';
import { kvSet } from '../lib/supabase-kv';

export interface Employee {
  id: string;
  name: string;
  username?: string;
  role: 'Yönetici' | 'Personel';
  department: string;
  permissions?: string[];
  pinCode?: string;
  password?: string;
}

interface EmployeeContextType {
  currentEmployee: Employee | null;
  setCurrentEmployee: (employee: Employee | null) => void;
  availableEmployees: Employee[];
}

const EmployeeContext = createContext<EmployeeContextType | undefined>(undefined);

export function EmployeeProvider({ children }: { children: ReactNode }) {
  const [availableEmployees, setAvailableEmployees] = useState<Employee[]>([]);

  // Load available employees from storage
  useEffect(() => {
    const fetchEmployees = () => {
      const storedPersonnel = getFromStorage<any[]>(StorageKey.PERSONEL_DATA) || [];
      
      // Always inject the super admin so it's undeletable and available for AuthContext
      const superAdmin: Employee = { 
        id: 'admin-super', 
        name: 'Sistem Yöneticisi (Admin)', 
        role: 'Yönetici', 
        department: 'Yönetim', 
        permissions: ['dashboard', 'satis', 'stok', 'kasa', 'cari', 'raporlar', 'personel', 'ayarlar'] 
      };

      const allPersonnel = [superAdmin, ...storedPersonnel];
      setAvailableEmployees(allPersonnel);
    };
    
    fetchEmployees();
    window.addEventListener('storage', fetchEmployees);
    window.addEventListener('storage_update', fetchEmployees);
    return () => {
      window.removeEventListener('storage', fetchEmployees);
      window.removeEventListener('storage_update', fetchEmployees);
    };
  }, []);

  /**
   * GÜVENLİK: localStorage'dan okunan currentEmployee verisi doğrulanır.
   * Saldırgan localStorage'ı düzenlese bile, rol ve izinler her zaman
   * PERSONEL_DATA'daki gerçek verilerle örtüşür.
   * admin-super özel durumu: EmployeeContext tarafından inject edilir, bu yüzden
   * yalnızca AuthContext'ten gelen user.id 'admin-super' olduğunda güvenilir.
   */
  const validateEmployeeFromStorage = useCallback((stored: Employee | null, personnel: any[]): Employee | null => {
    if (!stored) return null;

    // admin-super için özel durum: inject edilen sabit objeyi döndür
    if (stored.id === 'admin-super') {
      return {
        id: 'admin-super',
        name: 'Sistem Yöneticisi (Admin)',
        role: 'Yönetici',
        department: 'Yönetim',
        permissions: ['dashboard', 'satis', 'stok', 'kasa', 'cari', 'raporlar', 'personel', 'ayarlar'],
      };
    }

    // Gerçek personel listesinde bu id var mı?
    const realData = personnel.find((p: any) => p.id === stored.id);
    if (!realData) return null; // Listede olmayan bir çalışan → güvenilmez

    // Rol ve izinleri her zaman PERSONEL_DATA'dan al (localStorage'dan değil)
    let parsedPermissions: string[] = [];
    try {
      if (typeof realData.permissions === 'string') parsedPermissions = JSON.parse(realData.permissions);
      else if (Array.isArray(realData.permissions)) parsedPermissions = realData.permissions;
    } catch {}

    return {
      ...stored,
      role: realData.role === 'Yönetici' ? 'Yönetici' : 'Personel',
      permissions: parsedPermissions,
    };
  }, []);

  // Initialize current employee from storage, validated against personnel list
  const [currentEmployee, setCurrentEmployeeState] = useState<Employee | null>(() => {
    return getFromStorage<Employee>(StorageKey.CURRENT_EMPLOYEE) || null;
  });

  // Storage'dan currentEmployee değişikliklerini dinle (login sonrası güncelleme için)
  useEffect(() => {
    const syncFromStorage = () => {
      const stored = getFromStorage<Employee>(StorageKey.CURRENT_EMPLOYEE);
      if (stored && stored.id !== currentEmployee?.id) {
        const storedPersonnel = getFromStorage<any[]>(StorageKey.PERSONEL_DATA) || [];
        const validated = validateEmployeeFromStorage(stored, storedPersonnel);
        setCurrentEmployeeState(validated);
      }
    };
    window.addEventListener('storage_update', syncFromStorage);
    window.addEventListener('storage', syncFromStorage);
    return () => {
      window.removeEventListener('storage_update', syncFromStorage);
      window.removeEventListener('storage', syncFromStorage);
    };
  }, [currentEmployee?.id, validateEmployeeFromStorage]);

  // availableEmployees yüklendiğinde currentEmployee'yi doğrula
  useEffect(() => {
    if (availableEmployees.length > 0) {
      const storedPersonnel = getFromStorage<any[]>(StorageKey.PERSONEL_DATA) || [];
      const validated = validateEmployeeFromStorage(currentEmployee, storedPersonnel);

      if (!validated) {
        // Geçersiz (listede olmayan veya silinmiş) çalışan → fallback
        const defaultEmp = availableEmployees.find(e => e.id === 'admin-super')
          || availableEmployees.find(e => e.role === 'Yönetici')
          || availableEmployees[0];
        setCurrentEmployeeState(defaultEmp ?? null);
        if (defaultEmp) {
          setInStorage(StorageKey.CURRENT_EMPLOYEE, defaultEmp);
          kvSet('current_employee', defaultEmp).catch(() => {});
        }
      } else if (
        validated.role !== currentEmployee?.role ||
        JSON.stringify(validated.permissions) !== JSON.stringify(currentEmployee?.permissions)
      ) {
        // Rol veya izinler localStorage'da değiştirilmiş → düzelt
        setCurrentEmployeeState(validated);
        setInStorage(StorageKey.CURRENT_EMPLOYEE, validated);
        kvSet('current_employee', validated).catch(() => {});
      }
    }
  }, [availableEmployees, currentEmployee, validateEmployeeFromStorage]);

  const handleSetCurrentEmployee = useCallback((employee: Employee | null) => {
    setCurrentEmployeeState(employee);
    if (employee) {
      setInStorage(StorageKey.CURRENT_EMPLOYEE, employee);
      kvSet('current_employee', employee).catch(() => {});
    }
  }, []);

  return (
    <EmployeeContext.Provider
      value={{
        currentEmployee,
        setCurrentEmployee: handleSetCurrentEmployee,
        availableEmployees,
      }}
    >
      {children}
    </EmployeeContext.Provider>
  );
}

export function useEmployee() {
  const context = useContext(EmployeeContext);
  if (context === undefined) {
    throw new Error('useEmployee must be used within an EmployeeProvider');
  }
  return context;
}