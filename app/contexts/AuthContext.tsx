import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { StorageKey, getFromStorage, setInStorage, removeFromStorage } from '../utils/storage';
import { hashString } from '../utils/security';
import { registerSession, removeSession, generateCSRFToken, appendToLogChain, addSecurityThreat, isUnusualHour, recordDeviceLogin, checkPasswordBreach } from '../utils/security';
import { logActivity } from '../utils/activityLogger';
import { toast } from 'sonner';

interface User {
  id: string;
  name: string;
  username: string;
  role: 'Yönetici' | 'Personel';
  status: 'online' | 'offline';
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const userRef = React.useRef<User | null>(null);

  useEffect(() => {
    // LocalStorage'dan kullanıcı bilgisini yükle
    const savedUser = getFromStorage<User>(StorageKey.USER);
    if (savedUser) {
      setUser(savedUser);
      userRef.current = savedUser;
    }
    setIsLoading(false);
  }, []);

  // userRef'i her user değişiminde güncelle
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const doLogout = useCallback(() => {
    const currentUser = userRef.current;
    if (currentUser) {
      const allPersonnel = getFromStorage<any[]>(StorageKey.PERSONEL_DATA) || [];
      const updatedPersonnel = allPersonnel.map(p => 
        p.id === currentUser.id ? { ...p, status: 'offline' } : p
      );
      setInStorage(StorageKey.PERSONEL_DATA, updatedPersonnel);
      logActivity('logout', 'Kullanıcı sistemden çıkış yaptı', {
        employeeId: currentUser.id,
        employeeName: currentUser.name,
        page: 'logout'
      });
      // Oturum kaydini sil ve log zincirine ekle
      removeSession();
      appendToLogChain(`logout:${currentUser.id}:${currentUser.name}`);
    }
    setUser(null);
    userRef.current = null;
    removeFromStorage(StorageKey.USER);
  }, []);

  // ── 15 Dakika Hareketsizlik Kontrolü ──────────────────────────
  // NOT: Bu kontrol MainLayout.tsx'de dinamik güvenlik politikası ile 
  // merkezi olarak yönetilmektedir. Çift timer/event listener sorununu
  // önlemek için AuthContext'teki kontrol kaldırılmıştır.

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    const storedPersonnel = getFromStorage<any[]>(StorageKey.PERSONEL_DATA) || [];
    
    const trimmedUsername = (username || '').trim().slice(0, 128);  // max 128 karakter
    const trimmedPassword = (password || '').trim().slice(0, 256);  // max 256 karakter

    if (!trimmedUsername || !trimmedPassword) return false;

    // GÜVENLİK: Aşırı uzun girişleri erken reddet (DoS / timing attack önlemi)
    if (trimmedUsername.length > 128 || trimmedPassword.length > 256) return false;

    // ── Brute Force Koruması ───────────────────────────────────────
    const FAILED_ATTEMPTS_KEY = 'failed_login_attempts';
    const MAX_ATTEMPTS = 5;
    const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 dakika

    const attempts = getFromStorage<Record<string, { count: number, firstFailedAt: number }>>(FAILED_ATTEMPTS_KEY) || {};
    const userAttempts = attempts[trimmedUsername] || { count: 0, firstFailedAt: 0 };

    if (userAttempts.count >= MAX_ATTEMPTS) {
      const timePassed = Date.now() - userAttempts.firstFailedAt;
      if (timePassed < BLOCK_DURATION_MS) {
        toast.error('Çok fazla hatalı giriş denemesi. Lütfen 15 dakika sonra tekrar deneyin.');
        logActivity('security_alert', 'Brute Force Girişimi Engellendi', { 
          level: 'high', 
          description: `'${trimmedUsername}' hesabı için çok fazla hatalı giriş denemesi nedeniyle hesap 15 dakika kilitlendi.` 
        });
        const policy_lockout = BLOCK_DURATION_MS / 1000 / 60;
        addSecurityThreat({
          type: 'brute_force',
          severity: 'high',
          title: 'Brute Force Girisimi Engellendi',
          description: `'${trimmedUsername}' hesabi icin ${MAX_ATTEMPTS} hatali giris denemesi. Hesap ${policy_lockout} dakika kilitlendi.`,
          source: 'auth',
          metadata: { username: trimmedUsername, attempts: userAttempts.count },
        });
        return false;
      } else {
        // Blok süresi dolduysa sıfırla
        userAttempts.count = 0;
        attempts[trimmedUsername] = userAttempts;
        setInStorage(FAILED_ATTEMPTS_KEY, attempts);
      }
    }

    const recordFailedAttempt = () => {
      if (userAttempts.count === 0) {
        userAttempts.firstFailedAt = Date.now();
      }
      userAttempts.count += 1;
      attempts[trimmedUsername] = userAttempts;
      setInStorage(FAILED_ATTEMPTS_KEY, attempts);
    };

    const clearFailedAttempts = () => {
      if (attempts[trimmedUsername]) {
        delete attempts[trimmedUsername];
        setInStorage(FAILED_ATTEMPTS_KEY, attempts);
      }
    };

    // ── İlk kurulum: henüz personel yoksa varsayılan admin girişi ──
    // GÜVENLİK:
    //  • Bu kod yolu YALNIZCA personel listesi tamamen boşken (ilk kurulum) çalışır.
    //  • İlk başarılı girişten sonra derhal Personel Yönetimi'nden gerçek bir yönetici
    //    hesabı oluşturun ve bu varsayılan kimlik bilgilerini kullanmayı bırakın.
    //  • Üretim ortamında personel listesi hiçbir zaman boş olmamalıdır.
    const SETUP_USER = 'admin';
    const SETUP_PASS = 'Admin@2024!';
    if (
      storedPersonnel.length === 0 &&
      trimmedUsername === SETUP_USER &&
      trimmedPassword === SETUP_PASS
    ) {
      const defaultAdmin: User = { id: 'admin-1', name: 'Sistem Yöneticisi', username: 'admin', role: 'Yönetici', status: 'online' };
      setUser(defaultAdmin);
      setInStorage(StorageKey.USER, defaultAdmin);
      registerSession(defaultAdmin.id, defaultAdmin.name);
      generateCSRFToken();
      appendToLogChain(`login:${defaultAdmin.id}:${defaultAdmin.name}`);
      clearFailedAttempts();
      logActivity('login', 'İlk kurulum admin girisi yapti - sifre degistirmesi gerekiyor', { employeeId: defaultAdmin.id, employeeName: defaultAdmin.name, page: 'login' });
      recordDeviceLogin(defaultAdmin.id, defaultAdmin.name);
      addSecurityThreat({
        type: 'suspicious_activity',
        severity: 'high',
        title: 'Varsayılan Kurulum Şifresiyle Giriş',
        description: 'Sistem varsayılan admin şifresiyle giriş yapıldı. Hemen yeni bir yönetici hesabı oluşturun ve bu şifreyi kullanmayı bırakın.',
        source: 'auth',
        metadata: { username: 'admin' },
      });
      setTimeout(() => toast.warning('⚠️ İlk giriş! Güvenliğiniz için hemen yeni bir yönetici hesabı oluşturun ve bu varsayılan şifreyi kullanmayı bırakın.', { duration: 8000 }), 1000);
      return true;
    }

    // ── Personel eşleştirme ────────────────────────────────────────
    const lowerInput = trimmedUsername.toLowerCase();
    const foundUser = storedPersonnel.find((p: any) => {
      const pUsername = (p.username || '').trim().toLowerCase();
      const pPhone = (p.phone || '').trim();
      const pName = (p.name || '').trim().toLowerCase();
      
      // Öncelik sırası: username > phone > tam ad > isim parçası
      return (
        (pUsername && pUsername === lowerInput) ||
        (pPhone && pPhone === trimmedUsername) ||
        (pName && pName === lowerInput) ||
        (pName && pName.split(' ').some((part: string) => part === lowerInput))
      );
    });
    
    if (!foundUser) {
      recordFailedAttempt();
      logActivity('security_alert', 'Bilinmeyen kullanıcı girişi denemesi', {
        level: 'high',
        description: `'${trimmedUsername}' kullanıcı adıyla giriş yapılmaya çalışıldı.`
      });
      return false;
    }

    // ── Şifre doğrulama ────────────────────────────────────────────
    const userPassword = (foundUser.password || '').trim();
    const userPin = (foundUser.pinCode || foundUser.pin_code || '').trim();
    const hashedPassword = await hashString(trimmedPassword);

    const isPasswordValid =
      (userPassword && userPassword === hashedPassword) ||
      (userPin && userPin === hashedPassword);
    // GÜVENLİK: Düz metin şifre karşılaştırması ve varsayılan şifre fallback'i kaldırıldı.
    // Şifresi/PIN'i olmayan kullanıcılar sisteme giremez.
    
    if (!isPasswordValid) {
      recordFailedAttempt();
      logActivity('security_alert', 'Hatalı şifre girişi', {
        employeeName: foundUser.name,
        level: 'medium',
        description: `${trimmedUsername} kullanıcısı için hatalı şifre denemesi.`
      });
      return false;
    }

    // Eğer şifre düz metin olarak kayıtlıysa, bunu güvenli (hashed) versiyona geçir
    // Not: Her alan kendi trimmedPassword eşleşmesiyle ayrı ayrı kontrol edilir.
    // password ile giriş yapıldığında pin'in hash'lenmesi engellenir, tersi de geçerlidir.
    const isPasswordPlaintext = !!(userPassword && userPassword === trimmedPassword);
    const isPinPlaintext      = !!(userPin && userPin === trimmedPassword);
    const isPlaintextMatch    = isPasswordPlaintext || isPinPlaintext;

    const loggedInUser: User = { 
      id: foundUser.id, 
      name: foundUser.name, 
      username: foundUser.username || trimmedUsername, 
      role: foundUser.role === 'Yönetici' ? 'Yönetici' : 'Personel', 
      status: 'online' 
    };
    setUser(loggedInUser);
    setInStorage(StorageKey.USER, loggedInUser);

    logActivity('login', 'Kullanıcı sisteme giriş yaptı', {
      employeeId: foundUser.id,
      employeeName: foundUser.name,
      page: 'login'
    });

    clearFailedAttempts();

    // Oturum kaydi, CSRF token ve log zinciri
    registerSession(loggedInUser.id, loggedInUser.name);
    generateCSRFToken();
    appendToLogChain(`login:${loggedInUser.id}:${loggedInUser.name}`);

    // Personel durumunu güncelle
    const updatedPersonnel = storedPersonnel.map(p => {
      if (p.id === foundUser.id) {
        return { 
          ...p, 
          status: 'online', 
          lastLogin: new Date().toLocaleString('tr-TR'), 
          last_login: new Date().toLocaleString('tr-TR'),
          // Migration: her alan yalnızca kendi düz metin eşleşmesi varsa hash'lenir
          ...(isPasswordPlaintext && p.password ? { password: hashedPassword } : {}),
          ...(isPinPlaintext && p.pinCode  ? { pinCode:  hashedPassword } : {}),
          ...(isPinPlaintext && p.pin_code ? { pin_code: hashedPassword } : {}),
        };
      }
      return p;
    });
    setInStorage(StorageKey.PERSONEL_DATA, updatedPersonnel);

    // currentEmployee güncelle
    let parsedPermissions: string[] = [];
    try {
      if (typeof foundUser.permissions === 'string') parsedPermissions = JSON.parse(foundUser.permissions);
      else if (Array.isArray(foundUser.permissions)) parsedPermissions = foundUser.permissions;
    } catch {}

    // GÜVENLİK: CURRENT_EMPLOYEE objesine asla şifre veya PIN hash'i saklanmaz.
    // Kimlik doğrulaması zaten yapıldı; UI yalnızca rol/izin/meta veriye ihtiyaç duyar.
    setInStorage(StorageKey.CURRENT_EMPLOYEE, {
      id: foundUser.id,
      name: foundUser.name,
      username: foundUser.username || trimmedUsername,
      role: foundUser.role === 'Yönetici' ? 'Yönetici' : 'Personel',
      department: foundUser.department || foundUser.position || 'Genel',
      permissions: parsedPermissions,
    });

    // Cihaz izleme ve ihlal tespiti
    recordDeviceLogin(loggedInUser.id, loggedInUser.name);
    const breachResult = checkPasswordBreach(trimmedPassword);
    if (breachResult.breached) {
      setTimeout(() => toast.warning(`Guvenlik Uyarisi: ${breachResult.reason}. Sifrenizi degistirmeniz onerilir.`), 1500);
      logActivity('security_alert', 'Zayif sifre tespiti', {
        employeeName: loggedInUser.name,
        level: 'medium',
        description: `${loggedInUser.name} kullanicisinin sifresi bilinen ihlal listelerinde bulunuyor.`,
      });
    }

    return true;
  }, []);

  // logout public API'si doLogout'u çağırır
  const logout = doLogout;

  if (isLoading) {
    return (
      <AuthContext.Provider value={{ user: null, login, logout, isAuthenticated: false }}>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}