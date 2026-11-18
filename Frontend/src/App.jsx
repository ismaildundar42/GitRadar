import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import StatsOverview from './components/dashboard/StatsOverview';
import ScanTriggerModal from './components/dashboard/ScanTriggerModal';
import SbomTable from './components/inventory/SbomTable';
import VulnTriageTable from './components/vulnerabilities/VulnTriageTable';
import RepositoriesTable from './components/repositories/RepositoriesTable';
import ScanManagementView from './components/admin/ScanManagementView';
import UserActivityLogsView from './views/UserActivityLogsView';
import UserManagementView from './views/UserManagementView';
import Login from './components/auth/Login';
import { useAuth } from './context/AuthContext';
import { getRepositories, getScanDetails, getVulnerabilities, getSbomPackages, checkApiHealth } from './api/gitRadarApi';
import { RefreshCw, AlertCircle } from 'lucide-react';

export default function App() {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const [repositories, setRepositories] = useState([]);
  const [packages, setPackages] = useState([]);
  const [vulnerabilities, setVulnerabilities] = useState([]);
  const [currentScanInfo, setCurrentScanInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Veri yükleme
  const loadDashboardData = useCallback(async (latestCompletedId = null) => {
    setRefreshTrigger(prev => prev + 1);
    setIsLoading(true);
    setError(null);

    // 1. Sağlık Kontrolü
    const isOnline = await checkApiHealth();

    if (!isOnline) {
      setError('GitRadar Backend API (http://localhost:5000) erişilemez durumda. Lütfen backend servisini başlatın.');
      setIsLoading(false);
      return;
    }

    try {
      // 2. Depo Listesi Çekme
      const repos = await getRepositories();
      setRepositories(repos || []);

      // 3. Zafiyetleri ve SBOM Bileşenlerini Doğrudan DB'den Çek (CIS 16.6 ve CIS 16.4)
      const [vulnRes, sbomRes] = await Promise.allSettled([
        getVulnerabilities(),
        getSbomPackages(),
      ]);

      let loadedVulns = [];
      let loadedPackages = [];

      if (vulnRes.status === 'fulfilled' && Array.isArray(vulnRes.value) && vulnRes.value.length > 0) {
        loadedVulns = vulnRes.value;
      }
      if (sbomRes.status === 'fulfilled' && Array.isArray(sbomRes.value) && sbomRes.value.length > 0) {
        loadedPackages = sbomRes.value;
      }

      // Eğer doğrudan endpoint'ler henüz boşsa veya fallback gerekirse scan detail üzerinden doldur
      if (loadedVulns.length === 0 && loadedPackages.length === 0 && repos && repos.length > 0) {
        try {
          const repoMap = new Map();
          repos.forEach((r) => {
            repoMap.set(r.id, r.name || r.fullName);
          });

          const repoLatestScanMap = {
            1: 1, 2: 3, 3: 6, 5: 7, 6: 9,
          };
          if (latestCompletedId) {
            repoLatestScanMap['latest'] = latestCompletedId;
          }

          const targetScanIds = Object.values(repoLatestScanMap);
          const scanResults = await Promise.all(
            targetScanIds.map((id) => getScanDetails(id))
          );
          const validScans = scanResults.filter(Boolean);

          if (validScans.length > 0) {
            validScans.forEach((scanDetail) => {
              const repoName = repoMap.get(scanDetail.repositoryId) || `Depo #${scanDetail.repositoryId}`;
              (scanDetail.packages || []).forEach((pkg) => {
                loadedPackages.push({
                  ...pkg,
                  repositoryId: scanDetail.repositoryId,
                  repositoryName: repoName,
                });
              });
              (scanDetail.vulnerabilityAlerts || []).forEach((vuln) => {
                loadedVulns.push({
                  ...vuln,
                  repositoryId: scanDetail.repositoryId,
                  repositoryName: repoName,
                });
              });
            });
          }
        } catch {
          // sessizce geç
        }
      }

      setPackages(loadedPackages);
      setVulnerabilities(loadedVulns);

      if (latestCompletedId) {
        setCurrentScanInfo({
          scanExecutionId: latestCompletedId,
          status: 'Completed',
        });
      }
    } catch (err) {
      setError('Veriler yüklenirken bir sorun oluştu: ' + (err.message || 'Bilinmeyen hata'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Varsayılan İzleyici Modu: Tüm kullanıcılar için verileri başlangıçta yükle
  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Periyodik API Sağlık Kontrolü
  useEffect(() => {
    const checkHealth = async () => {
      const isOnline = await checkApiHealth();
      if (!isOnline) {
        setError('GitRadar Backend API (http://localhost:5000) erişilemez durumda.');
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  // Yeni tarama tamamlandığında
  const handleScanCompleted = async (scanResult) => {
    await loadDashboardData(scanResult?.scanExecutionId);
  };

  // İstatistik hesaplamaları
  const criticalCount = vulnerabilities.filter(
    (v) => v.severity?.toUpperCase() === 'CRITICAL'
  ).length;

  const highCount = vulnerabilities.filter(
    (v) => v.severity?.toUpperCase() === 'HIGH'
  ).length;

  const stats = {
    repositoriesCount: repositories.length,
    packagesCount: packages.length,
    vulnerabilitiesCount: vulnerabilities.length,
    criticalCount,
    highCount,
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[#0B1320] text-slate-900 dark:text-slate-100 overflow-hidden font-sans transition-colors">
      {/* Sol Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        stats={stats}
      />

      {/* Ana İçerik Alanı */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Üst Bar (Header) */}
        <Header
          onOpenScanModal={() => isAdmin && setIsModalOpen(true)}
          onNavigateAdminHub={() => isAdmin && setActiveTab('admin-scanner')}
          onOpenLoginModal={() => setIsLoginModalOpen(true)}
        />

        {/* Gövde / Sayfa İçeriği */}
        <main className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Hata Uyarısı (Varsa) */}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between shadow-xs">
              <div className="flex items-center space-x-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                onClick={loadDashboardData}
                className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-medium transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Yeniden Dene</span>
              </button>
            </div>
          )}

          {/* Sayfa Başlığı ve Yenileme Butonu */}
          <div className="flex items-center justify-between pb-1">
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                {activeTab === 'dashboard' && 'Kurumsal Güvenlik Özeti ve SCA Durumu'}
                {activeTab === 'inventory' && 'CIS Controls 16.4: Üçüncü Parti Kütüphane Envanteri (SBOM)'}
                {activeTab === 'vulnerabilities' && 'CIS Controls 16.6: Zafiyet Önceliklendirme ve Triyaj'}
                {activeTab === 'repositories' && 'İzlenen Kaynak Kod Depoları'}
                {activeTab === 'admin-scanner' && 'Sistem Yönetimi: Tarama & GitHub Yönetim Merkezi'}
                {activeTab === 'users' && 'Sistem Yönetimi: Yönetici (Admin) Yetkilendirme Listesi'}
                {activeTab === 'activities' && 'Sistem Yönetimi: Kurumsal Kullanıcı Hareketleri (Audit Trail)'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Enterprise Security Platform & Enterprise Security kurumsal siber güvenlik denetim paneli.
              </p>
            </div>

            <button
              onClick={() => loadDashboardData()}
              disabled={isLoading}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-600 dark:text-blue-400' : ''}`} />
              <span>Yenile</span>
            </button>
          </div>

          {/* İstatistik Özet Kartları (Denetim Sekmelerinde) */}
          {activeTab !== 'admin-scanner' && activeTab !== 'activities' && activeTab !== 'users' && (
            <StatsOverview
              stats={stats}
              onSelectFilter={(filter) => {
                if (filter === 'repositories') setActiveTab('repositories');
                else if (filter === 'inventory') setActiveTab('inventory');
                else if (filter === 'critical' || filter === 'high') setActiveTab('vulnerabilities');
              }}
            />
          )}

          {/* Sekme İçerikleri */}
          {activeTab === 'dashboard' && (
            <div className="space-y-5">
              {/* Zafiyet Triyaj Özeti */}
              <VulnTriageTable
                vulnerabilities={vulnerabilities}
                packages={packages}
              />

              {/* SBOM Envanter Özeti */}
              <SbomTable
                packages={packages}
                scanInfo={currentScanInfo}
                repositories={repositories}
              />
            </div>
          )}

          {activeTab === 'inventory' && (
            <SbomTable
              packages={packages}
              scanInfo={currentScanInfo}
              repositories={repositories}
            />
          )}

          {activeTab === 'vulnerabilities' && (
            <VulnTriageTable
              vulnerabilities={vulnerabilities}
              packages={packages}
            />
          )}

          {activeTab === 'repositories' && (
            <RepositoriesTable
              repositories={repositories}
              onRefresh={loadDashboardData}
            />
          )}

          {activeTab === 'admin-scanner' && (
            <ScanManagementView
              repositories={repositories}
              onRefresh={loadDashboardData}
              onNavigateDashboard={() => setActiveTab('dashboard')}
            />
          )}

          {activeTab === 'users' && (
            <UserManagementView
              key={refreshTrigger}
              onNavigateTab={setActiveTab}
            />
          )}

          {activeTab === 'activities' && (
            <UserActivityLogsView
              key={refreshTrigger}
              onNavigateTab={setActiveTab}
            />
          )}
        </main>
      </div>

      {/* Tarama Başlatma Modalı (Yalnızca Admin) */}
      <ScanTriggerModal
        isOpen={isModalOpen && isAdmin}
        onClose={() => setIsModalOpen(false)}
        onScanCompleted={handleScanCompleted}
      />

      {/* Kurumsal Yönetici Girişi Modalı */}
      <Login
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onNavigateAdmin={() => setActiveTab('users')}
        isModal={true}
      />
    </div>
  );
}
