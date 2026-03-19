import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { StorageKey, getFromStorage, setInStorage } from '../utils/storage';

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

  // Initialize current employee from storage or fallback to the first available admin
  const [currentEmployee, setCurrentEmployeeState] = useState<Employee | null>(() => {
    return getFromStorage<Employee>(StorageKey.CURRENT_EMPLOYEE) || null;
  });

  // Storage'dan currentEmployee değişikliklerini dinle (login sonrası güncelleme için)
  useEffect(() => {
    const syncFromStorage = () => {
      const stored = getFromStorage<Employee>(StorageKey.CURRENT_EMPLOYEE);
      if (stored && stored.id !== currentEmployee?.id) {
        setCurrentEmployeeState(stored);
      }
    };
    window.addEventListener('storage_update', syncFromStorage);
    window.addEventListener('storage', syncFromStorage);
    return () => {
      window.removeEventListener('storage_update', syncFromStorage);
      window.removeEventListener('storage', syncFromStorage);
    };
  }, [currentEmployee?.id]);

  // Ensure current employee is set if none is selected and available employees load
  useEffect(() => {
    if (availableEmployees.length > 0) {
      const isCurrentValid = currentEmployee && availableEmployees.some(e => e.id === currentEmployee.id);
      
      if (!isCurrentValid) {
        // If current employee is invalid (e.g. deleted), fallback to super admin or a valid manager
        const defaultEmp = availableEmployees.find(e => e.id === 'admin-super') || availableEmployees.find(e => e.role === 'Yönetici') || availableEmployees[0];
        setCurrentEmployeeState(defaultEmp);
        setInStorage(StorageKey.CURRENT_EMPLOYEE, defaultEmp);
      }
    }
  }, [currentEmployee, availableEmployees]);

  const handleSetCurrentEmployee = useCallback((employee: Employee | null) => {
    setCurrentEmployeeState(employee);
    if (employee) {
      setInStorage(StorageKey.CURRENT_EMPLOYEE, employee);
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