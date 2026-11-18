import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  UserCheck,
  Shield,
  Search,
  UserPlus,
  Mail,
  Edit2,
  Trash2,
  CheckCircle,
  AlertTriangle,
  X,
  Lock,
  ArrowRight,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getUsers, createUser, updateUser, deleteUser } from '../api/gitRadarApi';

function getInitials(name) {
  if (!name) return 'A';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function UserManagementView({ onNavigateTab }) {
  const { user: currentSessionUser, isAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState(null);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // Form states
  const [formData, setFormData] = useState({
    fullName: '',
    title: '',
    email: '',
    isActive: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchUsersList = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getUsers();
      if (Array.isArray(data)) {
        setUsers(data);
      }
    } catch {
      setToast({
        type: 'error',
        message: 'Yönetici listesi sunucudan yüklenirken hata oluştu.',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsersList();
  }, [fetchUsersList]);

  // Filtrelenmiş Yöneticiler (Arama Çubuğu)
  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users;
    const term = searchTerm.toLowerCase();
    return users.filter(
      (u) =>
        (u.fullName && u.fullName.toLowerCase().includes(term)) ||
        (u.title && u.title.toLowerCase().includes(term)) ||
        (u.email && u.email.toLowerCase().includes(term))
    );
  }, [users, searchTerm]);

  // Metrik Hesaplamaları
  const totalCount = users.length;
  const activeCount = users.filter((u) => u.isActive).length;

  // Yeni Yönetici Ekleme
  const handleOpenCreate = () => {
    setFormData({
      fullName: '',
      title: '',
      email: '',
      isActive: true,
    });
    setIsCreateOpen(true);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!formData.fullName.trim() || !formData.email.trim()) {
      setToast({
        type: 'error',
        message: 'Lütfen Ad Soyad ve Kurumsal E-posta alanlarını eksiksiz doldurun.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createUser({
        fullName: formData.fullName.trim(),
        title: formData.title.trim() || 'Sistem & Güvenlik Yöneticisi',
        email: formData.email.trim(),
        role: 'Admin',
        isActive: formData.isActive,
      });

      setToast({
        type: 'success',
        message: `${created.fullName} (${created.title}) yöneticisi başarıyla yetkilendirildi.`,
      });
      setIsCreateOpen(false);
      fetchUsersList();
    } catch (err) {
      const msg = err.response?.data?.message || 'Yönetici kaydedilirken bir hata oluştu.';
      setToast({ type: 'error', message: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Yönetici Düzenleme
  const handleOpenEdit = (userItem) => {
    setSelectedUser(userItem);
    setFormData({
      fullName: userItem.fullName,
      title: userItem.title || '',
      email: userItem.email,
      isActive: userItem.isActive,
    });
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;

    setIsSubmitting(true);
    try {
      await updateUser(selectedUser.id, {
        fullName: formData.fullName.trim(),
        title: formData.title.trim(),
        role: 'Admin',
        isActive: formData.isActive,
      });

      setToast({
        type: 'success',
        message: `${formData.email} yöneticisinin bilgileri güncellendi.`,
      });
      setIsEditOpen(false);
      setSelectedUser(null);
      fetchUsersList();
    } catch (err) {
      const msg = err.response?.data?.message || 'Yönetici bilgileri güncellenirken hata oluştu.';
      setToast({ type: 'error', message: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Hızlı Durum Değiştirme (Aktif / Pasif Toggle)
  const handleToggleActive = async (userItem) => {
    try {
      const updated = await updateUser(userItem.id, {
        isActive: !userItem.isActive,
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === userItem.id ? { ...u, isActive: updated.isActive } : u))
      );
      setToast({
        type: 'success',
        message: `${userItem.email} yöneticisinin erişim durumu '${
          updated.isActive ? 'Aktif' : 'Pasif'
        }' yapıldı.`,
      });
    } catch (err) {
      const msg = err.response?.data?.message || 'Erişim durumu güncellenemedi.';
      setToast({ type: 'error', message: msg });
    }
  };

  // Yönetici Silme
  const handleOpenDelete = (userItem) => {
    setSelectedUser(userItem);
    setIsDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedUser) return;
    setIsSubmitting(true);
    try {
      await deleteUser(selectedUser.id);
      setToast({
        type: 'success',
        message: `${selectedUser.email} yöneticisi sistemden başarıyla kaldırıldı.`,
      });
      setIsDeleteOpen(false);
      setSelectedUser(null);
      fetchUsersList();
    } catch (err) {
      const msg = err.response?.data?.message || 'Yönetici silinirken bir hata oluştu.';
      setToast({ type: 'error', message: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Yetkisiz Erişim Koruması (Yalnızca Admin)
  if (!isAdmin && currentSessionUser?.role !== 'Admin') {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-white/10 rounded-2xl shadow-xs">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 flex items-center justify-center text-rose-600 dark:text-rose-400 mb-4">
          <Lock className="w-7 h-7" />
        </div>
        <div className="max-w-md space-y-2">
          <div>
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              HTTP 403 Forbidden
            </span>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
              Yetkisiz Erişim / İzin Verilmedi
            </h2>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Yönetici yetkilendirme ve Microsoft Entra ID admin whitelist paneli yalnızca{' '}
            <strong>Admin</strong> yetkisine sahip güvenlik yöneticilerine açıktır.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => onNavigateTab && onNavigateTab('dashboard')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <span>Genel Bakışa Dön</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Toast Bildirimi */}
      {toast && (
        <div
          className={`flex items-center justify-between p-3.5 rounded-xl border text-xs shadow-md transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/40 text-rose-800 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center space-x-2">
            {toast.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span className="font-medium">{toast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. Üst Metrik Kartları (3'lü Grid) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Kart 1: Toplam Yetkili Yönetici */}
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-white/10 rounded-xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">
              Toplam Yetkili Yönetici
            </span>
            <div className="flex items-baseline space-x-2 mt-1">
              <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                {totalCount}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Yönetici
              </span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block">
              Entra ID Admin Whitelist
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* Kart 2: Aktif Yönetici Erişimi */}
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-white/10 rounded-xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">
              Aktif Yönetici Erişimi
            </span>
            <div className="flex items-baseline space-x-2 mt-1">
              <span className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {activeCount}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                / {totalCount} Aktif
              </span>
            </div>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5 block">
              ● Tam Yönetim Erişimine Açık
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>

        {/* Kart 3: Erişim Seviyesi */}
        <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-white/10 rounded-xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">
              Erişim Seviyesi
            </span>
            <div className="mt-1">
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/40 font-mono">
                Tam Sistem & Konfigürasyon Yetkisi
              </span>
            </div>
            <span className="text-[11px] text-purple-600 dark:text-purple-400 font-medium mt-1 block">
              Tüm Taramalar, Ayarlar ve Denetim
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/40 flex items-center justify-center text-purple-600 dark:text-purple-400">
            <Shield className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 2. Filtre & Araç Çubuğu (Geniş Arama Çubuğu + Sağda Ekle Butonu) */}
      <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-white/10 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Sol Taraf: Geniş Arama Kutusu */}
        <div className="relative flex-1 max-w-lg">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Yönetici adı, ünvan veya kurumsal e-posta ara..."
            className="w-full pl-10 pr-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
          />
        </div>

        {/* Sağ Taraf: Yeni Yönetici (Admin) Ekle Butonu */}
        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer active:scale-95 shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>+ Yeni Yönetici (Admin) Ekle</span>
        </button>
      </div>

      {/* 3. Kurumsal Yönetici Tablosu */}
      <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-white/10 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 font-semibold">
                <th className="py-3 px-4 w-16 font-mono"># ID</th>
                <th className="py-3 px-4 min-w-[240px]">Yönetici Personel & Ünvan</th>
                <th className="py-3 px-4 min-w-[240px]">Kurumsal E-posta (Entra ID)</th>
                <th className="py-3 px-4 w-32">Durum</th>
                <th className="py-3 px-4 w-36">Yetkilendirilme Tarihi</th>
                <th className="py-3 px-4 w-28 text-right">Aksiyonlar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                      <span>Yönetici listesi yükleniyor...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Users className="w-8 h-8 opacity-40" />
                      <span className="font-medium text-slate-600 dark:text-slate-300">
                        Yetkili yönetici bulunamadı.
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {searchTerm
                          ? 'Arama kriterlerinize uygun yönetici kaydı yok.'
                          : 'Yeni bir yönetici tanımlamak için "+ Yeni Yönetici (Admin) Ekle" butonunu kullanın.'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    {/* 1. # ID */}
                    <td className="py-3.5 px-4 font-mono text-slate-400 font-bold">
                      #{item.id}
                    </td>

                    {/* 2. Yönetici Personel & Ünvan */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 bg-[#C8102E] shadow-xs">
                          {getInitials(item.fullName)}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 dark:text-white leading-tight">
                            {item.fullName}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal mt-0.5">
                            {item.title || 'Sistem & Güvenlik Yöneticisi'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* 3. Kurumsal E-posta (Entra ID) */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{item.email}</span>
                      </div>
                    </td>

                    {/* 4. Durum */}
                    <td className="py-3.5 px-4">
                      {item.isActive ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40 font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>Aktif</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          <span>Pasif</span>
                        </span>
                      )}
                    </td>

                    {/* 5. Yetkilendirilme Tarihi */}
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {formatDate(item.createdAt)}
                    </td>

                    {/* 6. Aksiyonlar */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        {/* Hızlı Aktif/Pasif Toggle */}
                        <button
                          type="button"
                          onClick={() => handleToggleActive(item)}
                          title={item.isActive ? 'Yönetici Erişimini Pasif Yap' : 'Yönetici Erişimini Aktif Yap'}
                          className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
                            item.isActive
                              ? 'text-emerald-600 hover:bg-emerald-50 border-emerald-200 dark:border-emerald-800/40 dark:hover:bg-emerald-950/30'
                              : 'text-slate-400 hover:bg-slate-100 border-slate-200 dark:border-slate-700 dark:hover:bg-slate-800'
                          }`}
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                        </button>

                        {/* Düzenle */}
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(item)}
                          title="Yönetici Bilgilerini Düzenle"
                          className="p-1.5 rounded-md text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Sil */}
                        <button
                          type="button"
                          onClick={() => handleOpenDelete(item)}
                          title="Yönetici Yetkisini Kaldır"
                          className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Yeni Yönetici (Admin) Yetkilendir */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    🛡️ Yeni Yönetici (Admin) Yetkilendir
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Microsoft Entra ID ile tam yetkili (Admin) olarak eşleşecek kurumsal kullanıcıyı tanımlayın.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4">
              {/* 1. Ad Soyad */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  Ad Soyad *
                </label>
                <input
                  type="text"
                  required
                  placeholder="örn: Ahmet Yılmaz"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 2. Kurumsal Ünvan */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  Kurumsal Ünvan / Pozisyon
                </label>
                <input
                  type="text"
                  placeholder="örn: Kıdemli Siber Güvenlik Mühendisi"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 3. Kurumsal E-posta */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  Kurumsal E-posta (Entra ID Eşleşmesi) *
                </label>
                <input
                  type="email"
                  required
                  placeholder="örn: ahmet.yilmaz@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              {/* 4. Erişim Durumu Toggle */}
              <div className="p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                    Yönetici Erişim Durumu
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Pasif yapıldığında yöneticinin admin paneli erişim yetkisi askıya alınır.
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={formData.isActive}
                  onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    formData.isActive ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      formData.isActive ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Butonlar */}
              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                  <span>Yöneticiyi Yetkilendir</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Yönetici Bilgilerini Düzenle */}
      {isEditOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Yönetici Bilgilerini Düzenle
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {selectedUser.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-5 space-y-4">
              {/* Ad Soyad */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  Ad Soyad
                </label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Kurumsal Ünvan */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  Kurumsal Ünvan / Pozisyon
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Erişim Durumu Toggle */}
              <div className="p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                    Yönetici Erişim Durumu
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {formData.isActive ? 'Erişim Açık (Aktif Yönetici)' : 'Erişim Askıya Alındı (Pasif)'}
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={formData.isActive}
                  onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    formData.isActive ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      formData.isActive ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Butonlar */}
              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>Değişiklikleri Kaydet</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Silme Onayı */}
      {isDeleteOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Yönetici Yetkisini Kaldır
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Bu işlem geri alınamaz.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong>{selectedUser.fullName}</strong> ({selectedUser.email}) kullanıcısının yönetici (Admin) yetkileri sistemden kaldırılacaktır. Bu eylem denetim günlüğüne (Audit Trail) işlenecektir. Onaylıyor musunuz?
            </p>

            <div className="pt-2 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsDeleteOpen(false)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                İptal
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleDeleteConfirm}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Yöneticiyi Kaldır</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
