import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { getEntraConfig } from '../../api/gitRadarApi';
import {
  ShieldAlert,
  AlertCircle,
  Sun,
  Moon,
  ArrowRight,
  Loader2,
  X,
  Info,
} from 'lucide-react';

export default function Login({ isOpen = true, onClose, onNavigateAdmin, isModal = false }) {
  const { loginWithEntra } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const [error, setError] = useState(null);
  const [forbiddenError, setForbiddenError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [entraConfig, setEntraConfig] = useState(null);

  // Microsoft Entra ID Yapılandırmasını Yükle
  useEffect(() => {
    getEntraConfig()
      .then((cfg) => setEntraConfig(cfg))
      .catch(() => {});
  }, []);

  // Microsoft OAuth2 Callback Dinleyicisi (URL'de ?code=... varsa)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const authError = params.get('error_description') || params.get('error');

    if (authError) {
      setError(`Microsoft Entra ID Hatası: ${authError}`);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (code) {
      window.history.replaceState({}, document.title, window.location.pathname);
      setIsLoading(true);
      setError(null);
      setForbiddenError(null);
      const redirectUri = window.location.origin;

      loginWithEntra({ code, redirectUri })
        .then((res) => {
          setIsLoading(false);
          if (res?.success) {
            if (onNavigateAdmin) onNavigateAdmin();
            if (onClose) onClose();
          } else if (res?.isForbidden) {
            setForbiddenError(res.error);
          } else {
            setError(res?.error || 'Microsoft girişi başarısız oldu.');
          }
        })
        .catch((err) => {
          setIsLoading(false);
          setError(err?.message || 'Microsoft girişi başarısız oldu.');
        });
    }
  }, [loginWithEntra, onNavigateAdmin, onClose]);

  if (isModal && !isOpen) return null;

  // Gerçek Microsoft Entra ID SSO Yönlendirmesi
  const handleMicrosoftSso = () => {
    setError(null);
    setForbiddenError(null);

    if (!entraConfig?.isConfigured) {
      setError(
        'Microsoft Entra ID yapılandırması henüz tamamlanmadı. Lütfen Backend appsettings.json dosyasındaki AzureAd:TenantId ve AzureAd:ClientId alanlarını doldurun.'
      );
      return;
    }

    setIsLoading(true);
    const redirectUri = window.location.origin;
    const baseInstance = (entraConfig.instance || 'https://login.microsoftonline.com/').replace(/\/+$/, '');
    const authUrl = `${baseInstance}/${entraConfig.tenantId}/oauth2/v2.0/authorize?client_id=${entraConfig.clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=openid%20profile%20email&state=gitradar_entra_sso`;

    window.location.href = authUrl;
  };

  // Ortak Giriş Kartı Bileşeni
  const renderCard = () => (
    <div className="w-full max-w-md relative flex items-center justify-center">
      {/* Kontrollü Kart Arkası Ambient Glow */}
      <div className="absolute -z-10 w-full h-full max-w-lg rounded-3xl blur-3xl opacity-35 dark:opacity-20 bg-gradient-to-tr from-[#C8102E]/20 via-transparent to-indigo-600/20 pointer-events-none" />

      {/* =========================================================================
          ANA GİRİŞ KARTI (Premium Surface)
          ========================================================================= */}
      <div className="w-full max-w-md relative z-10 overflow-hidden before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[2px] before:bg-gradient-to-r before:from-[#C8102E] before:via-rose-500 before:to-indigo-600 bg-white dark:bg-[#0D1527] border border-slate-200/90 dark:border-white/10 rounded-2xl shadow-2xl shadow-slate-300/40 dark:shadow-2xl dark:shadow-black/75 p-6 sm:p-7 space-y-5 transition-all">
        {/* Modal Kapat Butonu */}
        {isModal && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-20 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            title="Pencereyi Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Kurumsal Marka Başlığı */}
        <div className="flex flex-col items-center text-center space-y-2.5">
          {/* Üstte Güvenlik Monikeri */}
          <span className="text-[9px] font-mono font-semibold tracking-[0.22em] uppercase text-slate-400 dark:text-slate-500">
            Enterprise Security Platform
          </span>

          {/* GitRadar Logo */}
          <div className="flex items-center justify-center space-x-2.5 py-1 select-none">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              GitRadar
            </span>
          </div>

          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              GitRadar Güvenlik Portalı
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Enterprise SCA & CIS Controls v8 Denetim Sistemi
            </p>
          </div>
        </div>

        {/* Genel Hata Bildirimi */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs flex items-start space-x-2.5 animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
            <span className="flex-1 leading-relaxed">{error}</span>
          </div>
        )}

        {/* Yetkisiz Kurumsal Hesap (Pre-Authorized Whitelist Reddi) Bildirimi */}
        {forbiddenError && (
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 text-amber-900 dark:text-amber-200 text-xs space-y-1.5 animate-fadeIn">
            <div className="flex items-center space-x-2 font-bold text-amber-800 dark:text-amber-300">
              <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>Yetkisiz Kurumsal Hesap (Erişim Engellendi)</span>
            </div>
            <p className="leading-relaxed text-[11px] text-amber-800 dark:text-amber-200/90 font-medium">
              {forbiddenError}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 pt-1 border-t border-amber-200 dark:border-amber-800/40">
              GitRadar kurumsal güvenlik politikası gereği, yalnızca sistemde önceden yetkilendirilmiş (Pre-Authorized) çalışanlar Microsoft SSO ile giriş yapabilir.
            </p>
          </div>
        )}

        {/* =========================================================================
            MICROSOFT ENTRA ID (AZURE AD) — KURUMSAL SSO GİRİŞ BUTONU
            ========================================================================= */}
        <div className="space-y-3 pt-1">
          <button
            type="button"
            onClick={handleMicrosoftSso}
            disabled={isLoading}
            className="w-full relative overflow-hidden bg-gradient-to-r from-[#0078D4] via-[#106EBE] to-[#005A9E] hover:from-[#106EBE] hover:to-[#004578] text-white p-3.5 rounded-xl shadow-md shadow-[#0078D4]/25 hover:shadow-lg transition-all duration-200 cursor-pointer flex items-center justify-between group active:scale-[0.99] border border-blue-400/30 disabled:opacity-50"
            title="Microsoft Entra ID (Azure AD) ile Kurumsal Giriş Yap"
          >
            <div className="flex items-center space-x-3 text-left min-w-0">
              {/* Microsoft 4-Color Grid Icon */}
              <div className="w-7 h-7 shrink-0 grid grid-cols-2 gap-0.5 p-1 bg-white rounded shadow-xs">
                <div className="bg-[#F25022] rounded-[1px]"></div>
                <div className="bg-[#7FBA00] rounded-[1px]"></div>
                <div className="bg-[#00A4EF] rounded-[1px]"></div>
                <div className="bg-[#FFB900] rounded-[1px]"></div>
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold flex items-center space-x-1.5 text-white">
                  <span>Microsoft ile Giriş Yap</span>
                  <span className="text-[9px] bg-sky-400/20 border border-sky-300/40 text-sky-100 px-1.5 py-0.2 rounded font-mono font-medium tracking-wide shrink-0">
                    Entra ID SSO
                  </span>
                </div>
                <p className="text-[11px] text-blue-100/90 truncate">
                  Kurumsal hesabınızla tek tıkla bağlanın
                </p>
              </div>
            </div>
            {isLoading ? (
              <Loader2 className="w-5 h-5 text-white animate-spin shrink-0 ml-2" />
            ) : (
              <ArrowRight className="w-5 h-5 text-white opacity-80 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-200 shrink-0 ml-2" />
            )}
          </button>

          {/* Kurumsal Erişim & Yetkilendirme Bilgilendirme Notu */}
          <div className="flex items-start space-x-2.5 p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 text-slate-600 dark:text-slate-400 text-xs">
            <Info className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              Yalnızca sistem yöneticisi tarafından yetkilendirilmiş <span className="font-semibold text-slate-800 dark:text-slate-200">@example.com</span> kurumsal hesapları giriş yapabilir.
            </p>
          </div>
        </div>

        {/* =========================================================================
            ALT BİLGİ & UYUMLULUK TELİF METNİ
            ========================================================================= */}
        <div className="pt-2 text-center border-t border-slate-100 dark:border-white/5">
          <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
            CIS Controls v8 (16.4 & 16.6) Denetim Uyum Sistemi
            <br />
            GitRadar Enterprise SCA © 2026
          </p>
        </div>
      </div>
    </div>
  );

  // Modal olarak çağrılmışsa:
  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-950/70 dark:bg-black/80 backdrop-blur-md animate-fadeIn select-none">
        {/* Dış Tıklama ile Kapatma */}
        <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
        <div className="relative z-10 w-full max-w-md my-auto">
          {renderCard()}
        </div>
      </div>
    );
  }

  // Standart Tam Sayfa Giriş Ekranı:
  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center py-6 px-4 bg-slate-50 dark:bg-[#050811] font-sans transition-colors select-none">
      {/* =========================================================================
          ATMOSFERİK ARKA PLAN KATMANI (Vignette, Radar Geometrisi & Siber Güvenlik Ağı)
          ========================================================================= */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
        {/* Çok Katmanlı Radyal Zemin Geçişi */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white via-slate-100/90 to-slate-200/80 dark:from-[#0C152B]/90 dark:via-[#070D1B] dark:to-[#03060C]" />

        {/* Atmosferik Işıklandırma */}
        <div className="absolute -top-32 -left-32 w-[650px] h-[650px] rounded-full bg-gradient-to-br from-blue-600/[0.07] dark:from-blue-600/[0.12] via-transparent to-transparent blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-[650px] h-[650px] rounded-full bg-gradient-to-tl from-indigo-600/[0.07] dark:from-indigo-600/[0.12] via-transparent to-transparent blur-3xl" />
        <div className="absolute top-1/4 right-10 w-[450px] h-[450px] rounded-full bg-gradient-to-bl from-sky-500/[0.04] dark:from-sky-500/[0.08] via-transparent to-transparent blur-3xl" />

        {/* Zarif Mikro Nokta Matrisi */}
        <div className="absolute inset-0 bg-[radial-gradient(#94a3b8_1.2px,transparent_1.2px)] dark:bg-[radial-gradient(#38bdf8_0.9px,transparent_0.9px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_75%_65%_at_50%_50%,#000_50%,transparent_100%)] opacity-35 dark:opacity-20" />

        {/* Büyük Ölçekli Vektörel Radar Geometrisi ve Siber Güvenlik Ağı */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 1920 1080"
          preserveAspectRatio="xMidYMid slice"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <radialGradient id="radarSweepGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#C8102E" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#C8102E" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* 1. Merkez Radar Geometrisi (960, 540) */}
          <circle cx="960" cy="540" r="340" fill="none" className="stroke-slate-300/70 dark:stroke-slate-700/60" strokeWidth="1" />
          <circle cx="960" cy="540" r="540" fill="none" className="stroke-slate-300/60 dark:stroke-slate-700/50" strokeWidth="1" />
          <circle cx="960" cy="540" r="760" fill="none" className="stroke-slate-300/50 dark:stroke-slate-700/40" strokeWidth="1" strokeDasharray="5 7" />
          <circle cx="960" cy="540" r="1020" fill="none" className="stroke-slate-300/40 dark:stroke-slate-800/60" strokeWidth="1" />
          <circle cx="960" cy="540" r="1320" fill="none" className="stroke-slate-200/60 dark:stroke-slate-800/40" strokeWidth="1" strokeDasharray="3 8" />

          {/* Merkez Radar Kılavuz Eksenleri */}
          <line x1="80" y1="540" x2="680" y2="540" className="stroke-slate-300/50 dark:stroke-slate-800/60" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="1240" y1="540" x2="1840" y2="540" className="stroke-slate-300/50 dark:stroke-slate-800/60" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="960" y1="60" x2="960" y2="240" className="stroke-slate-300/50 dark:stroke-slate-800/60" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="960" y1="840" x2="960" y2="1020" className="stroke-slate-300/50 dark:stroke-slate-800/60" strokeWidth="1" strokeDasharray="4 4" />

          {/* Eksen Üzeri Hassas Kılavuz Çentikleri */}
          {[200, 320, 440, 560, 1360, 1480, 1600, 1720].map((x) => (
            <line key={`tick-${x}`} x1={x} y1="536" x2={x} y2="544" className="stroke-slate-400/60 dark:stroke-slate-600/60" strokeWidth="1" />
          ))}

          {/* 2. Sol Bölge Siber Güvenlik Ağı & İkincil Radar Odağı */}
          <circle cx="280" cy="380" r="100" fill="none" className="stroke-slate-300/60 dark:stroke-slate-800/50" strokeWidth="1" />
          <circle cx="280" cy="380" r="220" fill="none" className="stroke-slate-300/40 dark:stroke-slate-800/40" strokeWidth="1" strokeDasharray="4 6" />
          <path
            d="M 140 260 L 280 380 L 420 300 L 480 480 L 320 580 L 180 500 Z"
            fill="none"
            className="stroke-slate-300/60 dark:stroke-slate-800/70"
            strokeWidth="1"
          />
          <line x1="280" y1="380" x2="480" y2="480" className="stroke-slate-300/40 dark:stroke-slate-800/50" strokeWidth="1" strokeDasharray="2 3" />
          <line x1="140" y1="260" x2="320" y2="580" className="stroke-slate-300/30 dark:stroke-slate-800/40" strokeWidth="1" strokeDasharray="2 4" />

          <circle cx="280" cy="380" r="8" className="fill-[#C8102E]/20" />
          <circle cx="280" cy="380" r="3.5" className="fill-[#C8102E]" />
          <circle cx="140" cy="260" r="3" className="fill-slate-400 dark:fill-slate-600" />
          <circle cx="420" cy="300" r="3" className="fill-slate-400 dark:fill-slate-600" />
          <circle cx="480" cy="480" r="4" className="fill-rose-500/80 dark:fill-rose-400/80" />
          <circle cx="320" cy="580" r="3" className="fill-slate-400 dark:fill-slate-600" />
          <circle cx="180" cy="500" r="3" className="fill-slate-400 dark:fill-slate-600" />

          <text x="295" y="384" className="text-[9px] font-mono font-medium fill-slate-400 dark:fill-slate-500 tracking-wider">
            SEC_NODE_01 // ACTIVE_SCAN
          </text>
          <text x="495" y="484" className="text-[8px] font-mono fill-slate-400/80 dark:fill-slate-600 tracking-wide">
            ZONE_VULN_TRIAGE
          </text>

          {/* 3. Sağ Bölge Siber Güvenlik Ağı & İkincil Radar Odağı */}
          <circle cx="1640" cy="660" r="110" fill="none" className="stroke-slate-300/60 dark:stroke-slate-800/50" strokeWidth="1" />
          <circle cx="1640" cy="660" r="240" fill="none" className="stroke-slate-300/40 dark:stroke-slate-800/40" strokeWidth="1" strokeDasharray="4 6" />
          <path
            d="M 1460 520 L 1640 420 L 1780 560 L 1740 780 L 1560 840 L 1480 700 Z"
            fill="none"
            className="stroke-slate-300/60 dark:stroke-slate-800/70"
            strokeWidth="1"
          />
          <line x1="1640" y1="420" x2="1640" y2="660" className="stroke-slate-300/40 dark:stroke-slate-800/50" strokeWidth="1" strokeDasharray="2 3" />
          <line x1="1460" y1="520" x2="1740" y2="780" className="stroke-slate-300/30 dark:stroke-slate-800/40" strokeWidth="1" strokeDasharray="2 4" />

          <circle cx="1640" cy="660" r="8" className="fill-indigo-600/20" />
          <circle cx="1640" cy="660" r="3.5" className="fill-indigo-600 dark:fill-indigo-400" />
          <circle cx="1460" cy="520" r="3" className="fill-slate-400 dark:fill-slate-600" />
          <circle cx="1640" cy="420" r="3" className="fill-slate-400 dark:fill-slate-600" />
          <circle cx="1780" cy="560" r="3" className="fill-slate-400 dark:fill-slate-600" />
          <circle cx="1740" cy="780" r="4" className="fill-indigo-500/80 dark:fill-indigo-400/80" />
          <circle cx="1560" cy="840" r="3" className="fill-slate-400 dark:fill-slate-600" />
          <circle cx="1480" cy="700" r="3" className="fill-slate-400 dark:fill-slate-600" />

          <text x="1655" y="664" className="text-[9px] font-mono font-medium fill-slate-400 dark:fill-slate-500 tracking-wider">
            CIS_NODE_04 // SBOM_MONITOR
          </text>
          <text x="1755" y="784" className="text-[8px] font-mono fill-slate-400/80 dark:fill-slate-600 tracking-wide">
            INVENTORY_COMPLIANCE
          </text>

          {/* 4. Köşe Teknik Çerçeveleri */}
          <path d="M 60 90 L 60 60 L 90 60" fill="none" className="stroke-slate-400/80 dark:stroke-slate-700" strokeWidth="1.5" />
          <text x="70" y="76" className="text-[9px] font-mono font-semibold fill-slate-400 dark:fill-slate-500 tracking-widest">
            DEX_RADAR // SYS.16.4
          </text>
          <path d="M 1860 90 L 1860 60 L 1830 60" fill="none" className="stroke-slate-400/80 dark:stroke-slate-700" strokeWidth="1.5" />
          <text x="1745" y="76" className="text-[9px] font-mono font-semibold fill-slate-400 dark:fill-slate-500 tracking-widest">
            PORT:5000 // READY
          </text>
          <path d="M 60 990 L 60 1020 L 90 1020" fill="none" className="stroke-slate-400/80 dark:stroke-slate-700" strokeWidth="1.5" />
          <text x="70" y="1012" className="text-[9px] font-mono font-semibold fill-slate-400 dark:fill-slate-500 tracking-widest">
            LATENCY &lt; 2ms // ENCRYPTED
          </text>
          <path d="M 1860 990 L 1860 1020 L 1830 1020" fill="none" className="stroke-slate-400/80 dark:stroke-slate-700" strokeWidth="1.5" />
          <text x="1745" y="1012" className="text-[9px] font-mono font-semibold fill-slate-400 dark:fill-slate-500 tracking-widest">
            CIS_V8 // CONTROLS_16.6
          </text>

          {[[280, 200], [560, 720], [1380, 320], [1680, 880]].map(([cx, cy], idx) => (
            <g key={`cross-${idx}`}>
              <line x1={cx - 5} y1={cy} x2={cx + 5} y2={cy} className="stroke-slate-400/70 dark:stroke-slate-600/70" strokeWidth="1" />
              <line x1={cx} y1={cy - 5} x2={cx} y2={cy + 5} className="stroke-slate-400/70 dark:stroke-slate-600/70" strokeWidth="1" />
            </g>
          ))}
        </svg>
      </div>

      {/* Sağ Üst Tema Değiştirici */}
      <div className="absolute top-4 right-4 sm:top-5 sm:right-5 z-20">
        <button
          onClick={toggleTheme}
          aria-label={isDark ? 'Aydınlık moda geç' : 'Karanlık moda geç'}
          title={isDark ? 'Aydınlık moda geç' : 'Karanlık moda geç'}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border border-slate-200/80 dark:border-white/10 shadow-xs hover:shadow-sm transition-all duration-200 cursor-pointer active:scale-95"
        >
          {isDark ? (
            <Sun className="w-4 h-4 text-amber-400 transition-transform duration-200 hover:rotate-45" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600 transition-transform duration-200 hover:-rotate-12" />
          )}
        </button>
      </div>

      {/* Ana Giriş Kartı */}
      {renderCard()}
    </div>
  );
}
