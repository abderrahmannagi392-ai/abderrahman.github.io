import React, { useCallback, useEffect, useState } from 'react';
import {
  BadgeCheck,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type { AdminPermission, Language, SchoolItem, VerificationRequestItem } from '../../types';
import { apiRequest, getAuthToken, resolveApiUrl } from '../../utils/api';
import { formatUserLevelDisplay } from '../../utils/levelLabels';
import { tr } from '../../utils/locale';
import { VerifiedBadge } from '../VerifiedBadge';

interface DirectoryUserRow {
  id: number;
  name: string;
  email: string;
  phone?: string;
  role: string;
  track: string;
  level: string;
  teacher_category?: string;
  professor_specialty?: string;
  email_verified?: number;
  verified_account?: number;
  verified_badge_label?: string;
  followers_count?: number;
  following_count?: number;
  last_login_at?: string | null;
  last_active_at?: string | null;
  created_at: string;
}

export const AdminDirectoryTab: React.FC<{
  lang: Language;
  category: 'students' | 'teachers' | 'professors';
  canVerify: boolean;
  onFlash: (text: string, ok?: boolean) => void;
}> = ({ lang, category, canVerify, onFlash }) => {
  const isAr = lang === 'ar';
  const [users, setUsers] = useState<DirectoryUserRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (targetPage = page, q = search) => {
      setLoading(true);
      try {
        const p = new URLSearchParams({
          category,
          page: String(targetPage),
          limit: '20',
        });
        if (q.trim()) p.set('search', q.trim());
        const res = await apiRequest<{
          users: DirectoryUserRow[];
          total: number;
          page: number;
          totalPages: number;
        }>(`/api/admin/users/directory?${p.toString()}`);
        setUsers(res.users || []);
        setTotal(res.total || 0);
        setTotalPages(Math.max(1, res.totalPages || 1));
      } catch (err: any) {
        onFlash(err?.message || 'تعذر تحميل الدليل.', false);
      } finally {
        setLoading(false);
      }
    },
    [category, page, search, onFlash]
  );

  useEffect(() => {
    setPage(1);
  }, [category]);

  useEffect(() => {
    void load(page, search);
  }, [category, page, search]);

  const toggleBadge = async (u: DirectoryUserRow) => {
    try {
      const nextVerified = !u.verified_account;
      await apiRequest('/api/admin/verification/grant', {
        method: 'POST',
        json: {
          targetType: 'user',
          targetId: u.id,
          verified: nextVerified,
          badgeLabel: u.level === 'professor' ? 'أستاذ موثق' : u.level === 'teacher' ? 'معلم موثق' : 'حساب موثق',
        },
      });
      onFlash(
        nextVerified
          ? tr(lang, 'تم منح شارة التوثيق بنجاح.', 'Badge accordé.', 'Badge granted.')
          : tr(lang, 'تم إلغاء شارة التوثيق.', 'Badge retiré.', 'Badge revoked.')
      );
      await load(page, search);
    } catch (err: any) {
      onFlash(err?.message || 'تعذر تحديث التوثيق.', false);
    }
  };

  const title =
    category === 'students'
      ? tr(lang, `إدارة الطلاب (${total})`, `Étudiants (${total})`, `Students (${total})`)
      : category === 'teachers'
        ? tr(lang, `إدارة المعلمين (${total})`, `Enseignants (${total})`, `Teachers (${total})`)
        : tr(lang, `إدارة الأساتذة (${total})`, `Professeurs (${total})`, `Professors (${total})`);

  return (
    <div className="addressp-box !mb-0 space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="ltitle !mb-0 flex items-center gap-1.5">
          <Users className="w-4 h-4 text-[#557a16]" />
          <span>{title}</span>
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#6b787e] absolute top-2.5 start-2.5" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={tr(lang, 'بحث بالاسم أو البريد أو الهاتف...', 'Rechercher...', 'Search...')}
              className="template-input !ps-8 !py-1.5 w-56"
            />
          </div>
          <button type="button" onClick={() => void load(page, search)} className="imgsend2-secondary !py-1.5 !px-3">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-[#6b787e]">{tr(lang, 'جارٍ التحميل...', 'Chargement...', 'Loading...')}</p>
      ) : users.length === 0 ? (
        <p className="text-[#6b787e]">{tr(lang, 'لا توجد نتائج مطابقة.', 'Aucun résultat.', 'No results.')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-start">
            <thead>
              <tr className="bg-[#f4f6f7] border-b border-[#d8dfe2]">
                <th className="p-2 text-start">#</th>
                <th className="p-2 text-start">{isAr ? 'الاسم والبريد' : 'Nom & E-mail'}</th>
                <th className="p-2 text-start">{isAr ? 'المستوى / التخصص' : 'Niveau / Spécialité'}</th>
                <th className="p-2 text-start">{isAr ? 'التوثيق والمتابعون' : 'Vérification'}</th>
                <th className="p-2 text-start">{isAr ? 'آخر دخول' : 'Dernière connexion'}</th>
                {canVerify && <th className="p-2 text-start">{isAr ? 'إجراء' : 'Action'}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#efefef]">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="p-2 font-mono font-bold text-[#384D55]">#{u.id}</td>
                  <td className="p-2">
                    <div className="font-bold text-[#384D55] flex items-center gap-1">
                      <span>{u.name}</span>
                      <VerifiedBadge verified={u.verified_account} label={u.verified_badge_label} size="xs" />
                    </div>
                    <div className="text-[11px] text-[#6b787e]" dir="ltr">
                      {u.email}
                    </div>
                    {u.phone && (
                      <div className="text-[10.5px] font-mono text-[#557a16]" dir="ltr">
                        {u.phone}
                      </div>
                    )}
                  </td>
                  <td className="p-2">
                    <div className="font-bold text-[#384D55]">
                      {formatUserLevelDisplay(
                        lang,
                        u.level as any,
                        u.teacher_category,
                        u.professor_specialty
                      )}
                    </div>
                    <div className="text-[10.5px] text-[#6b787e]">
                      {u.role} · {u.track}
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          u.email_verified ? 'bg-[#e2efbf] text-[#2c4a12]' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {u.email_verified ? (isAr ? 'بريد مؤكد' : 'Email OK') : (isAr ? 'بانتظار التفعيل' : 'En attente')}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-[#f7f9fa] border border-[#d8dfe2] text-[10px] font-bold">
                        {u.followers_count || 0} {isAr ? 'متابع' : 'abonnés'}
                      </span>
                    </div>
                  </td>
                  <td className="p-2 text-[11px] text-[#6b787e] tabular-nums" dir="ltr">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '—'}
                  </td>
                  {canVerify && (
                    <td className="p-2">
                      <button
                        type="button"
                        onClick={() => void toggleBadge(u)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[3px] font-bold border cursor-pointer ${
                          u.verified_account
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-[#e2efbf] text-[#1c2a0e] border-[#A6CE39]'
                        }`}
                      >
                        <BadgeCheck className="w-3.5 h-3.5" />
                        <span>
                          {u.verified_account
                            ? isAr
                              ? 'إلغاء التوثيق'
                              : 'Révoquer'
                            : isAr
                              ? 'توثيق الحساب'
                              : 'Certifier'}
                        </span>
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 border-t border-[#efefef]">
          <span className="text-[#6b787e]">
            {tr(lang, `صفحة ${page} من ${totalPages}`, `Page ${page}/${totalPages}`)}
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="imgsend2-secondary !py-1 !px-2.5 disabled:opacity-40"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="imgsend2-secondary !py-1 !px-2.5 disabled:opacity-40"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const AdminSchoolsTab: React.FC<{
  lang: Language;
  onFlash: (text: string, ok?: boolean) => void;
}> = ({ lang, onFlash }) => {
  const isAr = lang === 'ar';
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'rejected' | 'suspended'>('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ schools: SchoolItem[] }>('/api/admin/schools');
      setSchools(res.schools || []);
    } catch (err: any) {
      onFlash(err?.message || 'تعذر تحميل المدارس.', false);
    } finally {
      setLoading(false);
    }
  }, [onFlash]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateSchool = async (id: number, payload: { status?: string; verified_account?: boolean; rejection_reason?: string }) => {
    setBusyId(id);
    try {
      await apiRequest(`/api/admin/schools/${id}`, {
        method: 'PATCH',
        json: payload,
      });
      onFlash(tr(lang, 'تم تحديث حالة المدرسة بنجاح.', 'École mise à jour.', 'School updated.'));
      await load();
    } catch (err: any) {
      onFlash(err?.message || 'تعذر تحديث المدرسة.', false);
    } finally {
      setBusyId(null);
    }
  };

  const filtered = schools.filter((s) => filter === 'all' || s.status === filter);

  return (
    <div className="addressp-box !mb-0 space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="ltitle !mb-0 flex items-center gap-1.5">
          <Building2 className="w-4 h-4 text-[#557a16]" />
          <span>{tr(lang, `إدارة المدارس والشعب (${schools.length})`, `Écoles & Départements (${schools.length})`)}</span>
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'pending', 'active', 'rejected', 'suspended'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setFilter(st)}
              className={`px-2.5 py-1 rounded-[3px] border font-bold cursor-pointer ${
                filter === st
                  ? 'bg-[#384D55] text-[#A6CE39] border-[#384D55]'
                  : 'bg-[#f7f9fa] text-[#384D55] border-[#d8dfe2]'
              }`}
            >
              {st} ({st === 'all' ? schools.length : schools.filter((s) => s.status === st).length})
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-[#6b787e]">{tr(lang, 'جارٍ التحميل...', 'Chargement...')}</p>
      ) : filtered.length === 0 ? (
        <p className="text-[#6b787e]">{tr(lang, 'لا توجد مدارس مطابقة.', 'Aucune école.')}</p>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((s) => (
            <div key={s.id} className="p-3 rounded-[4px] border border-[#d8dfe2] bg-[#f7f9fa] flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="font-extrabold text-[#384D55] flex items-center gap-1.5">
                  <span>{s.name}</span>
                  <VerifiedBadge verified={s.verified_account} label={isAr ? 'مدرسة موثقة' : 'École vérifiée'} size="xs" />
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      s.status === 'active'
                        ? 'bg-[#e2efbf] text-[#2c4a12]'
                        : s.status === 'pending'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {s.status}
                  </span>
                </div>
                <div className="text-[11px] text-[#6b787e]">
                  {s.city} · {isAr ? 'المالك:' : 'Owner:'} {s.owner_name} ({s.owner_email})
                </div>
                <div className="text-[11px] text-[#4a5c64] flex flex-wrap gap-3">
                  <span>{s.departments_count ?? 0} {isAr ? 'شعبة' : 'dépts'}</span>
                  <span>{s.teachers_count ?? 0} {isAr ? 'معلم' : 'enseignants'}</span>
                  <span>{s.students_count ?? 0} {isAr ? 'طالب' : 'étudiants'}</span>
                  <span>{s.followers_count ?? 0} {isAr ? 'متابع' : 'abonnés'}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {s.status !== 'active' && (
                  <button
                    type="button"
                    disabled={busyId === s.id}
                    onClick={() => void updateSchool(s.id, { status: 'active' })}
                    className="imgsend2 !py-1 !px-2.5 text-[11px]"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{isAr ? 'موافقة وتفعيل' : 'Approuver'}</span>
                  </button>
                )}
                {s.status !== 'rejected' && s.status === 'pending' && (
                  <button
                    type="button"
                    disabled={busyId === s.id}
                    onClick={() => void updateSchool(s.id, { status: 'rejected' })}
                    className="px-2.5 py-1 rounded-[3px] bg-red-600 text-white font-bold cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5 inline me-1" />
                    <span>{isAr ? 'رفض' : 'Refuser'}</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyId === s.id}
                  onClick={() => void updateSchool(s.id, { verified_account: !s.verified_account })}
                  className="imgsend2-secondary !py-1 !px-2.5 text-[11px]"
                >
                  <BadgeCheck className="w-3.5 h-3.5 text-[#1877F2]" />
                  <span>{s.verified_account ? (isAr ? 'سحب الشارة' : 'Retirer badge') : (isAr ? 'منح الشارة' : 'Certifier')}</span>
                </button>
                {s.status === 'active' && (
                  <button
                    type="button"
                    disabled={busyId === s.id}
                    onClick={() => void updateSchool(s.id, { status: 'suspended' })}
                    className="px-2.5 py-1 rounded-[3px] bg-amber-600 text-white font-bold cursor-pointer"
                  >
                    {isAr ? 'تعليق' : 'Suspendre'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const AdminVerificationTab: React.FC<{
  lang: Language;
  onFlash: (text: string, ok?: boolean) => void;
}> = ({ lang, onFlash }) => {
  const isAr = lang === 'ar';
  const [requests, setRequests] = useState<Array<VerificationRequestItem & { target_type?: string; requested_label?: string; evidence_note?: string; document_file_id?: string; school_name?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [noteById, setNoteById] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ requests: any[] }>('/api/admin/verification-requests');
      setRequests(res.requests || []);
    } catch (err: any) {
      onFlash(err?.message || 'تعذر تحميل طلبات التوثيق.', false);
    } finally {
      setLoading(false);
    }
  }, [onFlash]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDecision = async (id: number, status: 'approved' | 'rejected' | 'revoked', defaultLabel?: string) => {
    setBusyId(id);
    try {
      await apiRequest(`/api/admin/verification-requests/${id}`, {
        method: 'PATCH',
        json: {
          status,
          badgeLabel: defaultLabel || 'حساب موثق',
          note: noteById[id] || '',
        },
      });
      onFlash(tr(lang, 'تم تحديث طلب شارة التوثيق.', 'Statut mis à jour.'));
      await load();
    } catch (err: any) {
      onFlash(err?.message || 'تعذر تنفيذ الإجراء.', false);
    } finally {
      setBusyId(null);
    }
  };

  const downloadProofFile = async (fileId: string) => {
    try {
      const headers: Record<string, string> = {};
      const tok = await getAuthToken();
      if (tok) headers.Authorization = `Bearer ${tok}`;
      const resp = await fetch(resolveApiUrl(`/api/files/${encodeURIComponent(fileId)}`), {
        headers,
        credentials: 'include',
      });
      if (!resp.ok) throw new Error('File unavailable');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `verification-${fileId}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      onFlash(tr(lang, 'تعذر فتح ملف الإثبات.', 'Impossible d’ouvrir le document.'), false);
    }
  };

  return (
    <div className="addressp-box !mb-0 space-y-4 text-xs">
      <div className="flex items-center justify-between">
        <h2 className="ltitle !mb-0 flex items-center gap-1.5">
          <BadgeCheck className="w-4 h-4 text-[#1877F2]" />
          <span>{tr(lang, `طلبات شارة التوثيق الزرقاء (${requests.length})`, `Demandes de vérification (${requests.length})`)}</span>
        </h2>
        <button type="button" onClick={() => void load()} className="imgsend2-secondary !py-1.5 !px-3">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading ? (
        <p className="text-[#6b787e]">{tr(lang, 'جارٍ التحميل...', 'Chargement...')}</p>
      ) : requests.length === 0 ? (
        <p className="text-[#6b787e]">{tr(lang, 'لا توجد طلبات توثيق حالياً.', 'Aucune demande.')}</p>
      ) : (
        <div className="space-y-3">
          {requests.map((vr) => (
            <div key={vr.id} className="p-3.5 rounded-[4px] border border-[#d8dfe2] bg-[#f7f9fa] space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-extrabold text-[#384D55] flex items-center gap-1.5">
                    <span>{vr.user_name}</span>
                    {vr.school_name && <span className="text-[#557a16]">— {vr.school_name}</span>}
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        vr.status === 'approved'
                          ? 'bg-[#e2efbf] text-[#2c4a12]'
                          : vr.status === 'pending'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {vr.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#6b787e]" dir="ltr">
                    {vr.user_email} · {vr.target_type || vr.account_type} · {vr.requested_label || 'حساب موثق'}
                  </div>
                </div>
                {vr.document_file_id && (
                  <button
                    type="button"
                    onClick={() => void downloadProofFile(vr.document_file_id!)}
                    className="imgsend2-secondary !py-1 !px-2.5 text-[11px]"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isAr ? 'مستند الإثبات' : 'Document'}</span>
                  </button>
                )}
              </div>

              {(vr.evidence_note || vr.notes) && (
                <p className="text-[11px] text-[#4a5c64] bg-white p-2 rounded border border-[#e3e7ea]">
                  {vr.evidence_note || vr.notes}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  type="text"
                  value={noteById[vr.id] || ''}
                  onChange={(e) => setNoteById((prev) => ({ ...prev, [vr.id]: e.target.value }))}
                  placeholder={isAr ? 'ملاحظة المراجعة (اختياري)...' : 'Note (optionnelle)...'}
                  className="template-input flex-1 min-w-[180px] !py-1"
                />
                {vr.status !== 'approved' && (
                  <button
                    type="button"
                    disabled={busyId === vr.id}
                    onClick={() => void handleDecision(vr.id, 'approved', vr.requested_label)}
                    className="imgsend2 !py-1 !px-3 text-[11px]"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{isAr ? 'اعتماد ومنح الشارة' : 'Approuver'}</span>
                  </button>
                )}
                {vr.status === 'pending' && (
                  <button
                    type="button"
                    disabled={busyId === vr.id}
                    onClick={() => void handleDecision(vr.id, 'rejected')}
                    className="px-3 py-1 rounded-[3px] bg-red-600 text-white font-bold cursor-pointer"
                  >
                    {isAr ? 'رفض' : 'Refuser'}
                  </button>
                )}
                {vr.status === 'approved' && (
                  <button
                    type="button"
                    disabled={busyId === vr.id}
                    onClick={() => void handleDecision(vr.id, 'revoked')}
                    className="px-3 py-1 rounded-[3px] bg-red-600 text-white font-bold cursor-pointer"
                  >
                    {isAr ? 'سحب الشارة' : 'Révoquer'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface AdminRecordRow {
  id: number;
  name: string;
  email: string;
  role: string;
  level: string;
  isSuperAdmin: boolean;
  permissions: AdminPermission[];
  last_login_at?: string | null;
}

const PERMISSION_LABELS: Record<AdminPermission, { ar: string; fr: string }> = {
  dashboard: { ar: 'نظرة عامة', fr: 'Vue générale' },
  users: { ar: 'المستخدمون', fr: 'Utilisateurs' },
  students: { ar: 'الطلاب', fr: 'Étudiants' },
  teachers: { ar: 'المعلمون', fr: 'Enseignants' },
  professors: { ar: 'الأساتذة', fr: 'Professeurs' },
  schools: { ar: 'المدارس', fr: 'Écoles' },
  departments: { ar: 'الشعب والأقسام', fr: 'Départements' },
  lessons: { ar: 'الدروس', fr: 'Leçons' },
  questions: { ar: 'بنك الأسئلة', fr: 'Questions' },
  exams: { ar: 'الامتحانات', fr: 'Examens' },
  baccalaureate: { ar: 'البكالوريا', fr: 'Baccalauréat' },
  subscriptions: { ar: 'الاشتراكات والباقات', fr: 'Abonnements' },
  payments: { ar: 'المدفوعات', fr: 'Paiements' },
  receipts: { ar: 'مراجعة الإيصالات', fr: 'Reçus' },
  transactions: { ar: 'المعاملات المالية', fr: 'Transactions' },
  notifications: { ar: 'الإشعارات', fr: 'Notifications' },
  verification: { ar: 'شارات التوثيق', fr: 'Vérification' },
  reports: { ar: 'البلاغات والرسائل', fr: 'Signalements' },
  content: { ar: 'المحتوى العام', fr: 'Contenu' },
  files: { ar: 'إدارة الملفات', fr: 'Fichiers' },
  administrators: { ar: 'المديرون والمساعدون', fr: 'Administrateurs' },
  permissions: { ar: 'توزيع الصلاحيات', fr: 'Permissions' },
  audit_logs: { ar: 'سجل التدقيق والأمان', fr: 'Audit & Sécurité' },
  settings: { ar: 'إعدادات الموقع والنظام', fr: 'Paramètres' },
};

export const AdminAdministratorsTab: React.FC<{
  lang: Language;
  onFlash: (text: string, ok?: boolean) => void;
}> = ({ lang, onFlash }) => {
  const isAr = lang === 'ar';
  const [allPerms, setAllPerms] = useState<AdminPermission[]>([]);
  const [admins, setAdmins] = useState<AdminRecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAdminId, setEditingAdminId] = useState<number | null>(null);
  const [draftPerms, setDraftPerms] = useState<AdminPermission[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newPerms, setNewPerms] = useState<AdminPermission[]>(['dashboard', 'lessons', 'questions']);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{
        allPermissions: AdminPermission[];
        administrators: AdminRecordRow[];
      }>('/api/admin/administrators');
      setAllPerms(res.allPermissions || []);
      setAdmins(res.administrators || []);
    } catch (err: any) {
      onFlash(err?.message || 'تعذر تحميل قائمة المشرفين.', false);
    } finally {
      setLoading(false);
    }
  }, [onFlash]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || newPerms.length === 0) return;
    setSaving(true);
    try {
      await apiRequest('/api/admin/administrators/assign', {
        method: 'POST',
        json: { email: newEmail.trim(), permissions: newPerms },
      });
      setNewEmail('');
      onFlash(tr(lang, 'تم تفويض المشرف ومنح الصلاحيات المحددة بنجاح.', 'Modérateur assigné.'));
      await load();
    } catch (err: any) {
      onFlash(err?.message || 'تعذر تفويض المشرف.', false);
    } finally {
      setSaving(false);
    }
  };

  const handleSavePermissions = async (userId: number) => {
    setSaving(true);
    try {
      await apiRequest(`/api/admin/administrators/${userId}/permissions`, {
        method: 'PUT',
        json: { permissions: draftPerms },
      });
      setEditingAdminId(null);
      onFlash(tr(lang, 'تم تحديث صلاحيات المشرف بنجاح.', 'Permissions mises à jour.'));
      await load();
    } catch (err: any) {
      onFlash(err?.message || 'تعذر حفظ الصلاحيات.', false);
    } finally {
      setSaving(false);
    }
  };

  const togglePermInList = (list: AdminPermission[], perm: AdminPermission) =>
    list.includes(perm) ? list.filter((p) => p !== perm) : [...list, perm];

  return (
    <div className="space-y-5 text-xs">
      <form onSubmit={handleAssign} className="addressp-box !mb-0 space-y-3">
        <h2 className="ltitle !mb-0 flex items-center gap-1.5">
          <UserCheck className="w-4 h-4 text-[#557a16]" />
          <span>{tr(lang, 'إضافة مشرف مساعد وتحديد أقسامه (RBAC 24 قسماً)', 'Assigner un modérateur (RBAC 24 sections)')}</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          <input
            type="email"
            required
            dir="ltr"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="assistant@example.com"
            className="template-input flex-1 min-w-[220px]"
          />
          <button type="submit" disabled={saving || newPerms.length === 0} className="imgsend2 !py-1.5 !px-4">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{isAr ? 'منح الصلاحيات' : 'Assigner'}</span>
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 pt-1">
          {allPerms.map((perm) => {
            const lbl = PERMISSION_LABELS[perm];
            return (
              <label key={perm} className="flex items-center gap-1.5 p-1.5 rounded border border-[#d8dfe2] bg-[#f7f9fa] cursor-pointer">
                <input
                  type="checkbox"
                  checked={newPerms.includes(perm)}
                  onChange={() => setNewPerms((prev) => togglePermInList(prev, perm))}
                  className="accent-[#384D55]"
                />
                <span className="font-bold text-[#384D55]">{lbl ? (isAr ? lbl.ar : lbl.fr) : perm}</span>
              </label>
            );
          })}
        </div>
      </form>

      <div className="addressp-box !mb-0 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="ltitle2 !mb-0">{tr(lang, `المديرون والمشرفون (${admins.length})`, `Administrateurs (${admins.length})`)}</h3>
          <button type="button" onClick={() => void load()} className="imgsend2-secondary !py-1 !px-2.5">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <p className="text-[#6b787e]">{tr(lang, 'جارٍ التحميل...', 'Chargement...')}</p>
        ) : (
          <div className="space-y-3">
            {admins.map((adm) => {
              const isEditing = editingAdminId === adm.id;
              return (
                <div key={adm.id} className="p-3 rounded-[4px] border border-[#d8dfe2] bg-[#f7f9fa] space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-extrabold text-[#384D55] flex items-center gap-2">
                        <span>{adm.name}</span>
                        {adm.isSuperAdmin && (
                          <span className="px-2 py-0.5 rounded bg-[#384D55] text-[#A6CE39] text-[10px]">
                            Super Admin
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#6b787e]" dir="ltr">
                        {adm.email} · {adm.permissions.length} {isAr ? 'صلاحية' : 'permissions'}
                      </div>
                    </div>
                    {!adm.isSuperAdmin && (
                      <div className="flex gap-1.5">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void handleSavePermissions(adm.id)}
                              className="imgsend2 !py-1 !px-3 text-[11px]"
                            >
                              {isAr ? 'حفظ' : 'Enregistrer'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingAdminId(null)}
                              className="imgsend2-secondary !py-1 !px-2.5 text-[11px]"
                            >
                              {isAr ? 'إلغاء' : 'Annuler'}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAdminId(adm.id);
                              setDraftPerms(adm.permissions || []);
                            }}
                            className="imgsend2-secondary !py-1 !px-3 text-[11px]"
                          >
                            {isAr ? 'تعديل الصلاحيات' : 'Modifier permissions'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 pt-2 border-t border-[#d8dfe2]">
                      {allPerms.map((perm) => {
                        const lbl = PERMISSION_LABELS[perm];
                        return (
                          <label key={perm} className="flex items-center gap-1.5 p-1.5 rounded border border-[#d8dfe2] bg-white cursor-pointer">
                            <input
                              type="checkbox"
                              checked={draftPerms.includes(perm)}
                              onChange={() => setDraftPerms((prev) => togglePermInList(prev, perm))}
                              className="accent-[#384D55]"
                            />
                            <span className="font-bold">{lbl ? (isAr ? lbl.ar : lbl.fr) : perm}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {(adm.permissions || []).map((perm) => {
                        const lbl = PERMISSION_LABELS[perm];
                        return (
                          <span key={perm} className="px-2 py-0.5 rounded bg-white border border-[#d8dfe2] text-[10px] font-bold text-[#384D55]">
                            {lbl ? (isAr ? lbl.ar : lbl.fr) : perm}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
