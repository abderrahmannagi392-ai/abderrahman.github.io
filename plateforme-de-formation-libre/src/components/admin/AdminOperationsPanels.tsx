import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  CreditCard,
  Download,
  FileText,
  GraduationCap,
  Plus,
  RefreshCw,
  Server,
  Trash2,
} from 'lucide-react';
import type { Language, PaymentOrderItem, StoredFileItem } from '../../types';
import { apiRequest, getAuthToken, resolveApiUrl } from '../../utils/api';
import { tr } from '../../utils/locale';

export const AdminNardoPayOrdersTab: React.FC<{
  lang: Language;
  onFlash: (text: string, ok?: boolean) => void;
}> = ({ lang, onFlash }) => {
  const isAr = lang === 'ar';
  const [orders, setOrders] = useState<PaymentOrderItem[]>([]);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{
        orders: PaymentOrderItem[];
        webhooks: any[];
        transactions: any[];
      }>(`/api/admin/nardopay-orders?status=${encodeURIComponent(statusFilter)}`);
      setOrders(res.orders || []);
      setWebhooks(res.webhooks || []);
      setTransactions(res.transactions || []);
    } catch (err: any) {
      onFlash(err?.message || 'تعذر تحميل طلبات NardoPay.', false);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, onFlash]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5 text-xs">
      <div className="addressp-box !mb-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="ltitle !mb-0 flex items-center gap-1.5">
            <CreditCard className="w-4 h-4 text-[#557a16]" />
            <span>{tr(lang, `طلبات الدفع الإلكتروني NardoPay (${orders.length})`, `Commandes NardoPay (${orders.length})`)}</span>
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'pending', 'completed', 'failed', 'cancelled'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-[3px] border font-bold cursor-pointer ${
                  statusFilter === st
                    ? 'bg-[#384D55] text-[#A6CE39] border-[#384D55]'
                    : 'bg-[#f7f9fa] text-[#384D55] border-[#d8dfe2]'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-[#6b787e]">{tr(lang, 'جارٍ التحميل...', 'Chargement...')}</p>
        ) : orders.length === 0 ? (
          <p className="text-[#6b787e]">{tr(lang, 'لا توجد طلبات دفع إلكتروني بعد.', 'Aucune commande.')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start">
              <thead>
                <tr className="bg-[#f4f6f7] border-b border-[#d8dfe2]">
                  <th className="p-2 text-start">Order ID</th>
                  <th className="p-2 text-start">{isAr ? 'المستخدم' : 'Utilisateur'}</th>
                  <th className="p-2 text-start">{isAr ? 'الباقة والمبلغ' : 'Offre & Montant'}</th>
                  <th className="p-2 text-start">{isAr ? 'الحالة' : 'Statut'}</th>
                  <th className="p-2 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#efefef]">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="p-2 font-mono font-bold text-[#384D55]" dir="ltr">{o.order_id}</td>
                    <td className="p-2">
                      <div className="font-bold">{o.user_name}</div>
                      <div className="text-[10.5px] text-[#6b787e]" dir="ltr">{o.user_email}</div>
                    </td>
                    <td className="p-2">
                      <div className="font-bold">{o.plan_name_ar || `#${o.plan_id}`}</div>
                      <div className="font-extrabold text-[#557a16] tabular-nums">{o.amount} {o.currency}</div>
                    </td>
                    <td className="p-2">
                      <span
                        className={`px-2 py-0.5 rounded font-bold ${
                          o.status === 'completed'
                            ? 'bg-[#e2efbf] text-[#2c4a12]'
                            : o.status === 'pending'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {o.status}
                      </span>
                      {o.failure_reason && <div className="text-[10px] text-red-700 mt-0.5">{o.failure_reason}</div>}
                    </td>
                    <td className="p-2 text-[11px] text-[#6b787e]" dir="ltr">
                      {new Date(o.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="addressp-box !mb-0 space-y-2">
          <h3 className="ltitle2">{tr(lang, `سجل Webhooks (${webhooks.length})`, `Webhooks (${webhooks.length})`)}</h3>
          {webhooks.length === 0 ? (
            <p className="text-[#6b787e]">{tr(lang, 'لا توجد أحداث Webhook مسجلة.', 'Aucun webhook.')}</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {webhooks.map((w) => (
                <div key={w.id} className="p-2 rounded border border-[#d8dfe2] bg-[#f7f9fa] flex items-center justify-between gap-2">
                  <div>
                    <div className="font-mono font-bold text-[#384D55]" dir="ltr">{w.event_type} · {w.order_id || w.event_id}</div>
                    <div className="text-[10px] text-[#6b787e]" dir="ltr">{w.created_at}</div>
                  </div>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${w.signature_valid ? 'bg-[#e2efbf] text-[#2c4a12]' : 'bg-red-100 text-red-700'}`}>
                    {w.signature_valid ? 'HMAC OK' : 'INVALID SIG'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="addressp-box !mb-0 space-y-2">
          <h3 className="ltitle2">{tr(lang, `المعاملات المكتملة (${transactions.length})`, `Transactions (${transactions.length})`)}</h3>
          {transactions.length === 0 ? (
            <p className="text-[#6b787e]">{tr(lang, 'لا توجد معاملات مكتملة.', 'Aucune transaction.')}</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {transactions.map((tx) => (
                <div key={tx.id} className="p-2 rounded border border-[#d8dfe2] bg-[#f7f9fa] flex items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-[#384D55]">{tx.user_name} — {tx.plan_name_ar}</div>
                    <div className="text-[10.5px] font-mono text-[#6b787e]" dir="ltr">
                      {tx.provider} · {tx.provider_tx_id}
                    </div>
                  </div>
                  <span className="font-extrabold text-[#557a16] tabular-nums">{tx.amount_mru} MRU</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const AdminFilesTab: React.FC<{
  lang: Language;
  onFlash: (text: string, ok?: boolean) => void;
}> = ({ lang, onFlash }) => {
  const isAr = lang === 'ar';
  const [files, setFiles] = useState<StoredFileItem[]>([]);
  const [storageInfo, setStorageInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ files: StoredFileItem[]; storage: any }>('/api/admin/files');
      setFiles(res.files || []);
      setStorageInfo(res.storage || null);
    } catch (err: any) {
      onFlash(err?.message || 'تعذر تحميل الملفات.', false);
    } finally {
      setLoading(false);
    }
  }, [onFlash]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDownload = async (file: StoredFileItem) => {
    try {
      const headers: Record<string, string> = {};
      const tok = await getAuthToken();
      if (tok) headers.Authorization = `Bearer ${tok}`;
      const resp = await fetch(resolveApiUrl(`/api/files/${encodeURIComponent(file.id)}`), {
        headers,
        credentials: 'include',
      });
      if (!resp.ok) throw new Error('Download failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.original_name || file.id;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      onFlash(tr(lang, 'تعذر تنزيل الملف.', 'Téléchargement impossible.'), false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiRequest(`/api/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
      onFlash(tr(lang, 'تم حذف الملف بنجاح.', 'Fichier supprimé.'));
      await load();
    } catch (err: any) {
      onFlash(err?.message || 'تعذر حذف الملف.', false);
    }
  };

  return (
    <div className="addressp-box !mb-0 space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="ltitle !mb-0 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-[#557a16]" />
            <span>{tr(lang, `إدارة الملفات المرفوعة (${files.length})`, `Fichiers stockés (${files.length})`)}</span>
          </h2>
          {storageInfo && (
            <div className="text-[11px] text-[#6b787e]" dir="ltr">
              Provider: {storageInfo.provider} · {storageInfo.s3Configured ? 'S3 Configured' : 'Local Safe Storage'}
            </div>
          )}
        </div>
        <button type="button" onClick={() => void load()} className="imgsend2-secondary !py-1.5 !px-3">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading ? (
        <p className="text-[#6b787e]">{tr(lang, 'جارٍ التحميل...', 'Chargement...')}</p>
      ) : files.length === 0 ? (
        <p className="text-[#6b787e]">{tr(lang, 'لا توجد ملفات مرفوعة بعد.', 'Aucun fichier.')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-start">
            <thead>
              <tr className="bg-[#f4f6f7] border-b border-[#d8dfe2]">
                <th className="p-2 text-start">{isAr ? 'الملف' : 'Fichier'}</th>
                <th className="p-2 text-start">{isAr ? 'المالك' : 'Propriétaire'}</th>
                <th className="p-2 text-start">{isAr ? 'النوع والخصوصية' : 'Type'}</th>
                <th className="p-2 text-start">{isAr ? 'الحجم' : 'Taille'}</th>
                <th className="p-2 text-start">{isAr ? 'إجراء' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#efefef]">
              {files.map((f) => (
                <tr key={f.id}>
                  <td className="p-2">
                    <div className="font-bold text-[#384D55]" dir="ltr">{f.original_name}</div>
                    <div className="text-[10px] font-mono text-[#6b787e]" dir="ltr">{f.mime_type}</div>
                  </td>
                  <td className="p-2">
                    <div className="font-bold">{f.owner_name || `#${f.owner_user_id}`}</div>
                    <div className="text-[10.5px] text-[#6b787e]" dir="ltr">{f.owner_email}</div>
                  </td>
                  <td className="p-2">
                    <span className="px-1.5 py-0.5 rounded bg-[#f7f9fa] border border-[#d8dfe2] text-[10px] font-bold">
                      {f.entity_type} · {f.visibility}
                    </span>
                  </td>
                  <td className="p-2 tabular-nums font-mono" dir="ltr">
                    {(f.size_bytes / 1024).toFixed(1)} KB
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => void handleDownload(f)} className="imgsend2-secondary !py-1 !px-2 text-[11px]">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => void handleDelete(f.id)} className="p-1.5 rounded bg-red-50 text-red-700 border border-red-200 cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export const AdminExamsTab: React.FC<{
  lang: Language;
  attempts: any[];
  onRefresh: () => Promise<void>;
  onFlash: (text: string, ok?: boolean) => void;
}> = ({ lang, attempts, onRefresh, onFlash }) => {
  const isAr = lang === 'ar';
  const [titleAr, setTitleAr] = useState('');
  const [titleFr, setTitleFr] = useState('');
  const [mode, setMode] = useState<'mock' | 'official_sim' | 'placement'>('mock');
  const [qCount, setQCount] = useState(20);
  const [durMin, setDurMin] = useState(30);
  const [saving, setSaving] = useState(false);

  const handleCreateExamConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleAr.trim()) return;
    setSaving(true);
    try {
      await apiRequest('/api/admin/exam-configs', {
        method: 'POST',
        json: {
          title_ar: titleAr.trim(),
          title_fr: titleFr.trim() || titleAr.trim(),
          mode,
          question_count: qCount,
          duration_minutes: durMin,
        },
      });
      setTitleAr('');
      setTitleFr('');
      onFlash(tr(lang, 'تم إنشاء نموذج الامتحان بنجاح.', 'Modèle d’examen créé.'));
      await onRefresh();
    } catch (err: any) {
      onFlash(err?.message || 'تعذر إنشاء نموذج الامتحان.', false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 text-xs">
      <form onSubmit={handleCreateExamConfig} className="addressp-box !mb-0 space-y-3">
        <h2 className="ltitle !mb-0 flex items-center gap-1.5">
          <GraduationCap className="w-4 h-4 text-[#557a16]" />
          <span>{tr(lang, 'إضافة نموذج امتحان جديد', 'Nouveau modèle d’examen')}</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <input
            type="text"
            required
            className="template-input"
            placeholder={isAr ? 'العنوان بالعربية' : 'Titre (AR)'}
            value={titleAr}
            onChange={(e) => setTitleAr(e.target.value)}
          />
          <input
            type="text"
            className="template-input"
            placeholder={isAr ? 'العنوان بالفرنسية' : 'Titre (FR)'}
            value={titleFr}
            onChange={(e) => setTitleFr(e.target.value)}
          />
          <select className="template-input" value={mode} onChange={(e) => setMode(e.target.value as any)}>
            <option value="mock">{isAr ? 'امتحان تجريبي' : 'Examen blanc'}</option>
            <option value="official_sim">{isAr ? 'محاكاة رسمية' : 'Simulation officielle'}</option>
            <option value="placement">{isAr ? 'تحديد مستوى' : 'Test de niveau'}</option>
          </select>
          <input
            type="number"
            min={5}
            max={120}
            className="template-input"
            value={qCount}
            onChange={(e) => setQCount(Number(e.target.value))}
            title={isAr ? 'عدد الأسئلة' : 'Questions'}
          />
          <input
            type="number"
            min={5}
            max={240}
            className="template-input"
            value={durMin}
            onChange={(e) => setDurMin(Number(e.target.value))}
            title={isAr ? 'المدة بالدقائق' : 'Durée (min)'}
          />
        </div>
        <button type="submit" disabled={saving} className="imgsend2 !py-1.5 !px-4">
          <Plus className="w-3.5 h-3.5" />
          <span>{isAr ? 'إنشاء الامتحان' : 'Créer'}</span>
        </button>
      </form>

      <div className="addressp-box !mb-0 space-y-3">
        <h3 className="ltitle2">{tr(lang, `سجل محاولات الامتحانات (${attempts.length})`, `Historique des examens (${attempts.length})`)}</h3>
        {attempts.length === 0 ? (
          <p className="text-[#6b787e]">{tr(lang, 'لا توجد محاولات مسجلة بعد.', 'Aucune tentative.')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start">
              <thead>
                <tr className="bg-[#f4f6f7] border-b border-[#d8dfe2]">
                  <th className="p-2 text-start">#</th>
                  <th className="p-2 text-start">{isAr ? 'الطالب' : 'Candidat'}</th>
                  <th className="p-2 text-start">{isAr ? 'النموذج' : 'Examen'}</th>
                  <th className="p-2 text-start">{isAr ? 'النتيجة / 20' : 'Note / 20'}</th>
                  <th className="p-2 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#efefef]">
                {attempts.slice(0, 60).map((a) => (
                  <tr key={a.id}>
                    <td className="p-2 font-mono">#{a.id}</td>
                    <td className="p-2">
                      <div className="font-bold text-[#384D55]">{a.user_name || `#${a.user_id}`}</div>
                      {a.user_email && <div className="text-[10.5px] text-[#6b787e]" dir="ltr">{a.user_email}</div>}
                    </td>
                    <td className="p-2">{a.title_ar || a.mode}</td>
                    <td className="p-2 font-extrabold text-[#557a16] tabular-nums">{a.score_20 ?? '—'}</td>
                    <td className="p-2 text-[11px] text-[#6b787e]" dir="ltr">{a.submitted_at || a.started_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export const AdminSystemHealthCard: React.FC<{ lang: Language }> = ({ lang }) => {
  const isAr = lang === 'ar';
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    apiRequest('/api/admin/system-health')
      .then((res) => setHealth(res))
      .catch(() => setHealth(null));
  }, []);

  if (!health) return null;

  return (
    <div className="addressp-box !mb-0 space-y-3 text-xs">
      <h3 className="ltitle2 !mb-0 flex items-center gap-1.5">
        <Server className="w-4 h-4 text-[#557a16]" />
        <span>{tr(lang, 'جاهزية البنية التحتية والأنظمة القابلة للتوسع', 'Santé système & Scalabilité')}</span>
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5" dir="ltr">
        <div className="p-2.5 rounded border border-[#d8dfe2] bg-[#f7f9fa]">
          <div className="text-[10px] text-[#6b787e]">SQLite Primary</div>
          <div className="font-extrabold text-[#557a16]">{health.sqlite?.status || 'connected'}</div>
        </div>
        <div className="p-2.5 rounded border border-[#d8dfe2] bg-[#f7f9fa]">
          <div className="text-[10px] text-[#6b787e]">PostgreSQL Adapter</div>
          <div className="font-extrabold text-[#384D55]">{health.postgres?.postgres || 'ready'}</div>
        </div>
        <div className="p-2.5 rounded border border-[#d8dfe2] bg-[#f7f9fa]">
          <div className="text-[10px] text-[#6b787e]">Storage Provider</div>
          <div className="font-extrabold text-[#384D55]">{health.storage?.provider || 'local'}</div>
        </div>
        <div className="p-2.5 rounded border border-[#d8dfe2] bg-[#f7f9fa]">
          <div className="text-[10px] text-[#6b787e]">Cache Entries</div>
          <div className="font-extrabold text-[#384D55]">{health.cache?.entries ?? 0}</div>
        </div>
        <div className="p-2.5 rounded border border-[#d8dfe2] bg-[#f7f9fa]">
          <div className="text-[10px] text-[#6b787e]">Job Queue Pending</div>
          <div className="font-extrabold text-[#384D55]">{health.queue?.pending ?? 0}</div>
        </div>
        <div className="p-2.5 rounded border border-[#d8dfe2] bg-[#f7f9fa]">
          <div className="text-[10px] text-[#6b787e]">SSE Live Streams</div>
          <div className="font-extrabold text-[#557a16] flex items-center gap-1">
            <Activity className="w-3 h-3" />
            <span>{health.realtime?.activeClients ?? 0}</span>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-[#6b787e]">
        {isAr
          ? 'جميع مكونات التوسع (التصفح التدريجي Pagination، فهارس قواعد البيانات، التخزين المجرد، الذاكرة المؤقتة TTL، طابور المهام، وبث الإشعارات SSE) فعّالة.'
          : 'Pagination, index SQL, stockage abstrait, cache TTL, file de tâches et flux SSE actifs.'}
      </p>
    </div>
  );
};
