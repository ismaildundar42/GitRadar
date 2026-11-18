import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120000, // Tarama süreleri için 2 dk zaman aşımı
});

// 1. Axios Request Interceptor: JWT Bearer Başlığını Otomatik Ekle
apiClient.interceptors.request.use(
  (config) => {
    try {
      const token = localStorage.getItem('gitradar_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // localStorage erişim hatası durumunda sessizce devam et
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 2. Axios Response Interceptor: 401 Unauthorized Yakalama & Oturum Temizleme
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRequest = error.config?.url?.includes('/auth/login') || error.config?.url?.includes('/auth/entra-login');
    if (error?.response?.status === 401 && !isLoginRequest) {
      // Yetkisiz veya süresi dolmuş token tespit edildi
      try {
        localStorage.removeItem('gitradar_token');
        localStorage.removeItem('gitradar_user');
      } catch {}

      // React uygulamasına oturumun düştüğünü bildir
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('gitradar-auth-logout'));
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Kurumsal kullanıcı girişi yapar ve JWT token alır.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<Object>} { token, email, role, fullName, expiration }
 */
export const loginApi = async (email, password) => {
  const response = await apiClient.post('/auth/login', {
    email: email.trim(),
    password: password.trim(),
  });
  return response.data;
};

/**
 * Microsoft Entra ID (Azure AD) istemci yapılandırmasını backend'den çeker (ClientSecret hariç).
 * @returns {Promise<{ instance: string, tenantId: string, clientId: string, callbackPath: string, isConfigured: boolean }>}
 */
export const getEntraConfig = async () => {
  const response = await apiClient.get('/auth/entra-config');
  return response.data;
};

/**
 * Microsoft Entra ID SSO doğrulaması yapar (Pre-Authorized Whitelist).
 * @param {{ code?: string, redirectUri?: string, idToken?: string }} payload
 * @returns {Promise<Object>} { token, email, role, fullName, expiration }
 */
export const entraLoginApi = async (payload) => {
  const response = await apiClient.post('/auth/entra-login', payload);
  return response.data;
};

/**
 * Anlık giriş yapmış kullanıcının profil detaylarını çeker.
 * @returns {Promise<Object>} CurrentUserDto
 */
export const getCurrentUserApi = async () => {
  const response = await apiClient.get('/auth/me');
  return response.data;
};

/**
 * Sistemde kayıtlı depoları ve son tarama özetlerini getirir.
 * @returns {Promise<Array>} RepositorySummaryDto dizisi
 */
export const getRepositories = async () => {
  const response = await apiClient.get('/repositories');
  return response.data;
};

/**
 * Belirtilen repo için yeni bir SCA taraması başlatır.
 * @param {Object} payload - { owner, repositoryName, branchOrCommit, triggeredBy }
 * @returns {Promise<Object>} RunRepositoryScanResult
 */
export const runScan = async (payload) => {
  const response = await apiClient.post('/scans/run', {
    owner: payload.owner,
    repositoryName: payload.repositoryName,
    branchOrCommit: payload.branchOrCommit,
    triggeredBy: payload.triggeredBy || 'WebDashboard',
    token: payload.token || undefined,
  });
  return response.data;
};

/**
 * Belirtilen tarama çalıştırmasının detaylarını (SBOM ve Zafiyetler) çeker.
 * 404 dönen veya silinmiş kayıtlar için UI çökmesini önler ve null döner.
 * @param {number|string} scanId - Tarama çalıştırması kimliği
 * @returns {Promise<Object|null>} ScanDetailDto veya null
 */
export const getScanDetails = async (scanId) => {
  if (!scanId || scanId <= 0) return null;
  try {
    const response = await apiClient.get(`/scans/executions/${scanId}`);
    return response.data;
  } catch (err) {
    if (err?.response?.status === 404) {
      return null;
    }
    return null;
  }
};

/**
 * Tarama oturumlarının (ScanSession) listesini çeker.
 * @returns {Promise<Array>}
 */
export const getScanSessions = async () => {
  const response = await apiClient.get('/scans');
  return response.data;
};

/**
 * Belirtilen tarama oturumunun (ScanSession) detaylarını ve bağlı çalıştırmalarını çeker.
 * @param {number|string} sessionId
 * @returns {Promise<Object|null>}
 */
export const getScanSessionById = async (sessionId) => {
  if (!sessionId) return null;
  const response = await apiClient.get(`/scans/${sessionId}`);
  return response.data;
};

/**
 * Belirtilen tarama oturumunun (ScanSession) detaylarını ve bağlı çalıştırmalarını çeker (Alias).
 * @param {number|string} sessionId
 * @returns {Promise<Object|null>}
 */
export const getScanSessionDetail = async (sessionId) => {
  return await getScanSessionById(sessionId);
};

/**
 * API bağlantı durumunu test eder (Public Health Endpoint).
 * @returns {Promise<boolean>}
 */
export const checkApiHealth = async () => {
  try {
    const res = await axios.get('http://localhost:5000/api/health', { timeout: 4000 });
    return res.status === 200;
  } catch {
    return false;
  }
};

/**
 * GitHub API üzerinden depoları otomatik keşfeder ve eşitler.
 * @param {string} [token] - İsteğe bağlı GitHub PAT
 * @param {string} [orgName] - İsteğe bağlı organizasyon adı
 * @returns {Promise<Object>} { addedCount, updatedCount, totalCount, message }
 */
export const syncGitHubRepositories = async (token = null, orgName = null) => {
  const payload = {};
  if (token) payload.token = token.trim();
  if (orgName) payload.orgName = orgName.trim();
  const response = await apiClient.post('/repositories/sync-github', payload);
  return response.data;
};

/**
 * Kayıtlı tüm depolar için toplu tarama başlatır (Batch Scan).
 * @param {string} [token] - İsteğe bağlı GitHub PAT
 * @returns {Promise<Object>} { enqueuedCount, message }
 */
export const triggerAllScans = async (token = null) => {
  const payload = token ? { token: token.trim() } : {};
  const response = await apiClient.post('/scans/trigger-all', payload);
  return response.data;
};

/**
 * CIS 16.6: Tüm aktif depolardan keşfedilen zafiyetleri getirir.
 * @returns {Promise<Array>}
 */
export const getVulnerabilities = async () => {
  const response = await apiClient.get('/vulnerabilities');
  return response.data;
};

/**
 * CIS 16.4: Tüm aktif depolardan keşfedilen SBOM kütüphanelerini getirir.
 * @param {number|string|null} repositoryId
 * @returns {Promise<Array>}
 */
export const getSbomPackages = async (repositoryId = null) => {
  const url = repositoryId ? `/sbom?repositoryId=${repositoryId}` : '/sbom';
  const response = await apiClient.get(url);
  return response.data;
};

/**
 * Dashboard genel durum ve sayaç metriklerini getirir.
 * @returns {Promise<Object>}
 */
export const getDashboardStats = async () => {
  const response = await apiClient.get('/dashboard/stats');
  return response.data;
};

/**
 * GitHub kimlik, token durumu ve hedef organizasyon ayarlarını getirir.
 * @returns {Promise<Object>}
 */
export const getGitHubSettings = async () => {
  const response = await apiClient.get('/settings/github');
  return response.data;
};

/**
 * GitHub PAT ve hedef organizasyonu günceller ve test eder.
 * @param {{ token?: string, targetOrganization?: string }} payload
 * @returns {Promise<Object>}
 */
export const updateGitHubSettings = async (payload) => {
  const response = await apiClient.post('/settings/github', payload);
  return response.data;
};

/**
 * GitHub PAT token'ını anında /user ile doğrulayıp profil bilgilerini döner.
 * @param {string} token
 * @returns {Promise<Object>}
 */
export const verifyGitHubToken = async (token) => {
  const response = await apiClient.post('/settings/verify-token', { token });
  return response.data;
};

/**
 * Kurumsal kullanıcı ve yönetici hareketlerini (Audit Trail) getirir.
 * @param {number} [take=100]
 * @returns {Promise<Array>}
 */
export const getUserActivities = async (take = 100) => {
  const response = await apiClient.get('/activities', { params: { take } });
  return response.data;
};

/**
 * Kurumsal kullanıcı ve personel listesini getirir.
 * @returns {Promise<Array>}
 */
export const getUsers = async () => {
  const response = await apiClient.get('/users');
  return response.data;
};

/**
 * Yeni kurumsal kullanıcı / personel kaydeder (Entra ID pre-provisioning).
 * @param {{ email: string, fullName: string, title?: string, role: string, isActive?: boolean }} payload
 * @returns {Promise<Object>}
 */
export const createUser = async (payload) => {
  const response = await apiClient.post('/users', payload);
  return response.data;
};

/**
 * Kurumsal kullanıcının ünvan, rol veya aktiflik durumunu günceller.
 * @param {number|string} id
 * @param {{ fullName?: string, title?: string, role?: string, isActive?: boolean }} payload
 * @returns {Promise<Object>}
 */
export const updateUser = async (id, payload) => {
  const response = await apiClient.put(`/users/${id}`, payload);
  return response.data;
};

/**
 * Kurumsal personeli sistemden kaldırır/siler.
 * @param {number|string} id
 * @returns {Promise<Object>}
 */
export const deleteUser = async (id) => {
  const response = await apiClient.delete(`/users/${id}`);
  return response.data;
};

export default apiClient;
