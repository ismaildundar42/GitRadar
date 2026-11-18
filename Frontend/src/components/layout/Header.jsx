import React, { useState, useRef, useEffect } from 'react';
import { Play, Sun, Moon, LogOut, LogIn, Accessibility, RotateCcw } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useAccessibility } from '../../context/AccessibilityContext';

export default function Header({ onOpenScanModal, onNavigateAdminHub, onOpenLoginModal }) {
  const { isDark, toggleTheme } = useTheme();
  const { user, logout, isAdmin } = useAuth();
  const {
    fontSize,
    highContrast,
    highlightLinks,
    readableFont,
    reduceMotion,
    setFontSize,
    toggleHighContrast,
    toggleHighlightLinks,
    toggleReadableFont,
    toggleReduceMotion,
    resetA11y,
  } = useAccessibility();

  const [isA11yOpen, setIsA11yOpen] = useState(false);
  const a11yTriggerRef = useRef(null);
  const a11yPopoverRef = useRef(null);

  const isA11yActive =
    fontSize !== 'normal' || highContrast || highlightLinks || readableFont || reduceMotion;

  useEffect(() => {
    if (!isA11yOpen) return;

    const handleClickOutside = (e) => {
      if (
        a11yPopoverRef.current &&
        !a11yPopoverRef.current.contains(e.target) &&
        a11yTriggerRef.current &&
        !a11yTriggerRef.current.contains(e.target)
      ) {
        setIsA11yOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsA11yOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isA11yOpen]);

  const handleScanAction = () => {
    if (onNavigateAdminHub) {
      onNavigateAdminHub();
    } else if (onOpenScanModal) {
      onOpenScanModal();
    }
  };

  return (
    <header className="h-16 bg-white dark:bg-[#111C2E] border-b border-slate-200 dark:border-white/10 px-6 flex items-center justify-between sticky top-0 z-30 transition-colors">
      {/* Sol: GitRadar Logo & Başlık */}
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <span className="text-slate-900 dark:text-white font-bold text-lg tracking-tight select-none">
          GitRadar
        </span>
      </div>

      {/* Sağ: Tema Değiştirici, Erişilebilirlik Menüsü, Yeni Tarama (Admin) ve Giriş/Çıkış Aksiyonu */}
      <div className="flex items-center space-x-3">
        {/* Tema Değiştirici Butonu */}
        <button
          onClick={toggleTheme}
          aria-label={isDark ? 'Aydınlık moda geç' : 'Karanlık moda geç'}
          title={isDark ? 'Aydınlık moda geç' : 'Karanlık moda geç'}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/70 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
        >
          {isDark ? (
            <Sun className="w-4 h-4 text-amber-400 transition-transform duration-200 hover:rotate-45" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600 transition-transform duration-200 hover:-rotate-12" />
          )}
        </button>

        {/* Erişilebilirlik (A11y) Paneli Popover */}
        <div className="relative">
          <button
            ref={a11yTriggerRef}
            type="button"
            onClick={() => setIsA11yOpen((prev) => !prev)}
            aria-label="Erişilebilirlik Seçenekleri"
            title="Erişilebilirlik Seçenekleri"
            aria-expanded={isA11yOpen}
            className={`relative p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/70 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer ${
              isA11yActive
                ? 'ring-2 ring-blue-500/50 dark:ring-blue-400/50 text-blue-600 dark:text-blue-400 font-bold'
                : ''
            }`}
          >
            <Accessibility className="w-4 h-4" />
            {isA11yActive && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 ring-2 ring-white dark:ring-[#111C2E]" />
            )}
          </button>

          {isA11yOpen && (
            <div
              ref={a11yPopoverRef}
              className="absolute right-0 mt-2 w-72 bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl p-4 z-50 animate-fadeIn"
            >
              {/* Popover Üst Başlık & Sıfırla */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/10">
                <div className="flex items-center space-x-2">
                  <Accessibility className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    ♿ Erişilebilirlik Paneli
                  </span>
                </div>
                <button
                  type="button"
                  onClick={resetA11y}
                  title="Tüm erişilebilirlik ayarlarını sıfırla"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Sıfırla</span>
                </button>
              </div>

              {/* 1. Metin Boyutu (Text Size) */}
              <div className="py-3 border-b border-slate-100 dark:border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Metin Boyutu
                  </span>
                  <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">
                    {fontSize === 'normal'
                      ? 'Normal (%100)'
                      : fontSize === 'large'
                        ? 'Büyük (%110)'
                        : 'Çok Büyük (%120)'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setFontSize('normal')}
                    className={`py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                      fontSize === 'normal'
                        ? 'bg-white dark:bg-[#111C2E] text-slate-900 dark:text-white shadow-xs font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    A
                  </button>
                  <button
                    type="button"
                    onClick={() => setFontSize('large')}
                    className={`py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                      fontSize === 'large'
                        ? 'bg-white dark:bg-[#111C2E] text-slate-900 dark:text-white shadow-xs font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    A+
                  </button>
                  <button
                    type="button"
                    onClick={() => setFontSize('xlarge')}
                    className={`py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                      fontSize === 'xlarge'
                        ? 'bg-white dark:bg-[#111C2E] text-slate-900 dark:text-white shadow-xs font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    A++
                  </button>
                </div>
              </div>

              {/* 2. Yüksek Kontrast */}
              <div className="py-2.5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Yüksek Kontrast
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={highContrast}
                  onClick={toggleHighContrast}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    highContrast ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      highContrast ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* 3. Tıklanabilir Alanları Vurgula */}
              <div className="py-2.5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Tıklanabilir Alanları Vurgula
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={highlightLinks}
                  onClick={toggleHighlightLinks}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    highlightLinks ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      highlightLinks ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* 4. Net Okuma Fontu */}
              <div className="py-2.5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Net Okuma Fontu
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={readableFont}
                  onClick={toggleReadableFont}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    readableFont ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      readableFont ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* 5. Hareketleri Durdur */}
              <div className="pt-2.5 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Hareketleri Durdur
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={reduceMotion}
                  onClick={toggleReduceMotion}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    reduceMotion ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      reduceMotion ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Yetki Kapısı: "Yeni Tarama Başlat" Butonu YALNIZCA Admin ise görünür */}
        {isAdmin && (
          <button
            onClick={handleScanAction}
            className="inline-flex items-center space-x-1.5 bg-[#C8102E] hover:bg-[#A60D24] text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg shadow-xs transition-colors cursor-pointer active:scale-95 shrink-0"
            title="Tarama & GitHub Yönetim Merkezine Git"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Yeni Tarama Başlat</span>
          </button>
        )}

        {/* Kullanıcı Profili (Admin) VEYA Sade "Giriş Yap" Butonu */}
        {isAdmin ? (
          <div className="flex items-center space-x-2 pl-2 border-l border-slate-200 dark:border-white/10">
            <div className="flex items-center space-x-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs text-white shrink-0 bg-[#C8102E]"
                title={user?.name || 'Admin'}
              >
                A
              </div>
              <div className="hidden md:flex flex-col text-left">
                <span className="text-xs font-semibold text-slate-900 dark:text-white leading-tight">
                  {user?.name || 'Administrator'}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-none">
                  {user?.department || 'Enterprise Cyber Security'}
                </span>
              </div>
            </div>

            {/* Rol Rozeti */}
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-rose-50 text-[#C8102E] border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/40">
              Admin
            </span>

            {/* Çıkış Yap (Logout) Butonu */}
            <button
              onClick={logout}
              title="Güvenli Çıkış Yap"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer ml-1"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenLoginModal}
            title="Yönetici Girişi Yap"
            className="inline-flex items-center space-x-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-xs font-semibold px-3.5 py-1.5 rounded-lg shadow-xs transition-all duration-150 cursor-pointer active:scale-95 shrink-0"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Giriş Yap</span>
          </button>
        )}
      </div>
    </header>
  );
}
