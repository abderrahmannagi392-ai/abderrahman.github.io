import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Building2,
  CheckCircle2,
  Heart,
  Layers,
  MapPin,
  Megaphone,
  Plus,
  Send,
  UserPlus,
  Users,
} from 'lucide-react';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { useApp } from '../context/AppContext';
import type { SchoolItem } from '../types';
import { apiRequest } from '../utils/api';
import { tr } from '../utils/locale';

interface DepartmentRow {
  id: number;
  name: string;
  description: string;
}

interface SchoolMemberRow {
  id: number;
  user_id: number;
  name: string;
  email: string;
  department_name?: string;
  subject_name?: string;
  level?: string;
  verified_account?: number;
}

export const SchoolDashboardPage: React.FC = () => {
  const { lang, user, goToAuth } = useApp();
  const isAr = lang === 'ar';

  const [publicSchools, setPublicSchools] = useState<SchoolItem[]>([]);
  const [ownedSchools, setOwnedSchools] = useState<SchoolItem[]>([]);
  const [teachingSchools, setTeachingSchools] = useState<SchoolItem[]>([]);
  const [enrolledSchools, setEnrolledSchools] = useState<SchoolItem[]>([]);
  const [followedSchoolIds, setFollowedSchoolIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Request new school form
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [sName, setSName] = useState('');
  const [sCity, setSCity] = useState('');
  const [sWilaya, setSWilaya] = useState('');
  const [sDesc, setSDesc] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // Active school workspace
  const [activeSchoolId, setActiveSchoolId] = useState<number | null>(null);
  const [detailSchool, setDetailSchool] = useState<SchoolItem | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [teachers, setTeachers] = useState<SchoolMemberRow[]>([]);
  const [students, setStudents] = useState<SchoolMemberRow[]>([]);
  const [curriculum, setCurriculum] = useState<Array<{ id: number; subject_name: string; title: string; description: string; department_name?: string }>>([]);
  const [announcements, setAnnouncements] = useState<Array<{ id: number; title: string; body: string; author_name: string; created_at: string }>>([]);

  // Forms inside school workspace
  const [deptName, setDeptName] = useState('');
  const [teacherQuery, setTeacherQuery] = useState('');
  const [teacherSubject, setTeacherSubject] = useState('');
  const [teacherDeptId, setTeacherDeptId] = useState<string>('');
  const [studentQuery, setStudentQuery] = useState('');
  const [studentDeptId, setStudentDeptId] = useState<string>('');
  const [currTitle, setCurrTitle] = useState('');
  const [currSubject, setCurrSubject] = useState('');
  const [currDesc, setCurrDesc] = useState('');
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');

  const loadSchools = useCallback(async () => {
    setLoading(true);
    try {
      const pub = await apiRequest<{ schools: SchoolItem[] }>('/api/schools/public');
      setPublicSchools(pub.schools || []);
      if (user) {
        const [mine, follows] = await Promise.all([
          apiRequest<{ owned: SchoolItem[]; teaching: SchoolItem[]; enrolled: SchoolItem[] }>('/api/schools/mine').catch(() => ({
            owned: [],
            teaching: [],
            enrolled: [],
          })),
          apiRequest<{ schools: Array<{ id: number }> }>('/api/follows/mine').catch(() => ({ schools: [] })),
        ]);
        setOwnedSchools(mine.owned || []);
        setTeachingSchools(mine.teaching || []);
        setEnrolledSchools(mine.enrolled || []);
        setFollowedSchoolIds((follows.schools || []).map((s) => s.id));
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadSchools();
  }, [loadSchools]);

  const loadSchoolDetail = useCallback(async (schoolId: number) => {
    try {
      const res = await apiRequest<{
        school: SchoolItem;
        isOwner: boolean;
        isTeacher: boolean;
        departments: DepartmentRow[];
        teachers: SchoolMemberRow[];
        students: SchoolMemberRow[];
        curriculum: Array<{ id: number; subject_name: string; title: string; description: string; department_name?: string }>;
        announcements: Array<{ id: number; title: string; body: string; author_name: string; created_at: string }>;
      }>(`/api/schools/${schoolId}/detail`);
      setDetailSchool(res.school);
      setIsOwner(Boolean(res.isOwner));
      setIsTeacher(Boolean(res.isTeacher));
      setDepartments(res.departments || []);
      setTeachers(res.teachers || []);
      setStudents(res.students || []);
      setCurriculum(res.curriculum || []);
      setAnnouncements(res.announcements || []);
    } catch (err: any) {
      setMsg({ text: err?.message || 'تعذر فتح تفاصيل المدرسة.', ok: false });
    }
  }, []);

  useEffect(() => {
    if (activeSchoolId) {
      void loadSchoolDetail(activeSchoolId);
    }
  }, [activeSchoolId, loadSchoolDetail]);

  const handleRequestSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      goToAuth('login');
      return;
    }
    setSubmittingRequest(true);
    setMsg(null);
    try {
      await apiRequest('/api/schools/request', {
        method: 'POST',
        json: {
          name: sName.trim(),
          city: sCity.trim(),
          wilaya: sWilaya.trim(),
          description: sDesc.trim(),
        },
      });
      setSName('');
      setSCity('');
      setSWilaya('');
      setSDesc('');
      setShowRequestForm(false);
      await loadSchools();
      setMsg({
        text: tr(
          lang,
          'تم إرسال طلب إنشاء المدرسة إلى الإدارة بنجاح. سيتم تفعيلها فور المراجعة والموافقة.',
          'Demande de création envoyée pour approbation administrative.'
        ),
        ok: true,
      });
    } catch (err: any) {
      setMsg({ text: err?.message || 'تعذر إرسال الطلب.', ok: false });
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleToggleFollowSchool = async (schoolId: number) => {
    if (!user) {
      goToAuth('login');
      return;
    }
    const res = await apiRequest<{ ok: boolean; following: boolean }>('/api/follows/toggle', {
      method: 'POST',
      json: { targetType: 'school', targetId: schoolId },
    }).catch(() => null);
    if (res) {
      setFollowedSchoolIds((prev) =>
        res.following ? [...new Set([...prev, schoolId])] : prev.filter((x) => x !== schoolId)
      );
      await loadSchools();
    }
  };

  const handleAddDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSchoolId || !deptName.trim()) return;
    await apiRequest(`/api/schools/${activeSchoolId}/departments`, {
      method: 'POST',
      json: { name: deptName.trim() },
    });
    setDeptName('');
    await loadSchoolDetail(activeSchoolId);
  };

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSchoolId || !teacherQuery.trim()) return;
    setMsg(null);
    try {
      await apiRequest(`/api/schools/${activeSchoolId}/teachers`, {
        method: 'POST',
        json: {
          query: teacherQuery.trim(),
          subjectName: teacherSubject.trim(),
          departmentId: teacherDeptId ? Number(teacherDeptId) : undefined,
        },
      });
      setTeacherQuery('');
      setTeacherSubject('');
      await loadSchoolDetail(activeSchoolId);
      setMsg({ text: tr(lang, 'تمت إضافة المعلم للمدرسة.', 'Enseignant ajouté.'), ok: true });
    } catch (err: any) {
      setMsg({ text: err?.message || 'لم يتم العثور على المعلم.', ok: false });
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSchoolId || !studentQuery.trim()) return;
    setMsg(null);
    try {
      await apiRequest(`/api/schools/${activeSchoolId}/students`, {
        method: 'POST',
        json: {
          query: studentQuery.trim(),
          departmentId: studentDeptId ? Number(studentDeptId) : undefined,
        },
      });
      setStudentQuery('');
      await loadSchoolDetail(activeSchoolId);
      setMsg({ text: tr(lang, 'تم تسجيل الطالب في المدرسة.', 'Étudiant inscrit.'), ok: true });
    } catch (err: any) {
      setMsg({ text: err?.message || 'لم يتم العثور على الطالب.', ok: false });
    }
  };

  const handleAddCurriculum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSchoolId || !currTitle.trim() || !currSubject.trim()) return;
    await apiRequest(`/api/schools/${activeSchoolId}/curriculum`, {
      method: 'POST',
      json: {
        subjectName: currSubject.trim(),
        title: currTitle.trim(),
        description: currDesc.trim(),
      },
    });
    setCurrTitle('');
    setCurrSubject('');
    setCurrDesc('');
    await loadSchoolDetail(activeSchoolId);
  };

  const handleAddAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSchoolId || !annTitle.trim() || !annBody.trim()) return;
    await apiRequest(`/api/schools/${activeSchoolId}/announcements`, {
      method: 'POST',
      json: { title: annTitle.trim(), body: annBody.trim() },
    });
    setAnnTitle('');
    setAnnBody('');
    await loadSchoolDetail(activeSchoolId);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="rotator-box !mb-0 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-[#384D55] flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#83a329]" />
            <span>{tr(lang, 'نظام المدارس والمؤسسات التعليمية', 'Écoles & Établissements', 'Schools System')}</span>
          </h1>
          <p className="text-xs text-[#6b787e] mt-0.5">
            {tr(
              lang,
              'أنشئ مدرسة معتمدة (بموافقة الإدارة)، وأدر الشعب والمواد والمعلمين والطلاب والمقررات.',
              'Créez un établissement agréé, gérez départements, enseignants, étudiants et programmes.'
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!user) {
              goToAuth('login');
              return;
            }
            setShowRequestForm((v) => !v);
          }}
          className="imgsend2 text-xs"
        >
          <Plus className="w-4 h-4" />
          <span>{tr(lang, 'طلب إنشاء مدرسة', 'Demander une école', 'Request New School')}</span>
        </button>
      </div>

      {msg && (
        <div
          className={`p-3 rounded-[4px] border text-xs font-bold ${
            msg.ok ? 'bg-[#e2efbf] border-[#A6CE39] text-[#384D55]' : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {msg.text}
        </div>
      )}

      {showRequestForm && (
        <form onSubmit={handleRequestSchool} className="addressp-box-white space-y-3 text-xs">
          <h2 className="text-sm font-extrabold text-[#384D55]">
            {tr(lang, 'تقديم طلب إنشاء مدرسة للموافقة الإدارية', 'Demande de création d’école')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              className="template-input"
              placeholder={isAr ? 'اسم المدرسة الرسمي *' : 'Nom de l’école *'}
              value={sName}
              onChange={(e) => setSName(e.target.value)}
            />
            <input
              type="text"
              className="template-input"
              placeholder={isAr ? 'الولاية' : 'Wilaya'}
              value={sWilaya}
              onChange={(e) => setSWilaya(e.target.value)}
            />
            <input
              type="text"
              className="template-input"
              placeholder={isAr ? 'المدينة / المقاطعة' : 'Ville'}
              value={sCity}
              onChange={(e) => setSCity(e.target.value)}
            />
          </div>
          <textarea
            rows={2}
            className="template-input"
            placeholder={isAr ? 'نبذة عن المدرسة والأقسام والتخصصات...' : 'Description...'}
            value={sDesc}
            onChange={(e) => setSDesc(e.target.value)}
          />
          <div className="flex gap-2">
            <button type="submit" disabled={submittingRequest} className="imgsend2 text-xs">
              <Send className="w-3.5 h-3.5" />
              <span>{submittingRequest ? '...' : tr(lang, 'إرسال الطلب للإدارة', 'Soumettre la demande')}</span>
            </button>
            <button type="button" onClick={() => setShowRequestForm(false)} className="imgsend2-secondary text-xs">
              {tr(lang, 'إلغاء', 'Annuler')}
            </button>
          </div>
        </form>
      )}

      {/* My Schools Section */}
      {user && (ownedSchools.length > 0 || teachingSchools.length > 0 || enrolledSchools.length > 0) && (
        <div className="addressp-box-white space-y-3">
          <h2 className="text-sm font-extrabold text-[#384D55]">
            {tr(lang, 'مدارسي ومؤسساتي', 'Mes établissements')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {[...ownedSchools, ...teachingSchools, ...enrolledSchools].map((sc) => (
              <div key={`my-${sc.id}`} className="p-3 rounded-[4px] border border-[#d8dfe2] bg-[#f7f9fa] space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-extrabold text-[#384D55] flex items-center gap-1">
                    <span>{sc.name}</span>
                    <VerifiedBadge verified={sc.verified_account} size="xs" />
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      sc.status === 'active'
                        ? 'bg-[#e2efbf] text-[#2c4a12]'
                        : sc.status === 'pending'
                          ? 'bg-amber-50 text-amber-800'
                          : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {sc.status === 'active'
                      ? isAr
                        ? 'مفعلة'
                        : 'Active'
                      : sc.status === 'pending'
                        ? isAr
                          ? 'بانتظار الموافقة'
                          : 'En attente'
                        : sc.status}
                  </span>
                </div>
                {(sc.wilaya || sc.city) && (
                  <div className="text-[11px] text-[#6b787e] flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    <span>{[sc.wilaya, sc.city].filter(Boolean).join(' — ')}</span>
                  </div>
                )}
                {sc.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => setActiveSchoolId(sc.id)}
                    className="imgsend2 !py-1 !px-3 text-[11px] w-full"
                  >
                    {tr(lang, 'فتح لوحة المدرسة', 'Ouvrir l’école')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected School Workspace */}
      {detailSchool && (
        <div className="addressp-box-white space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#d8dfe2]">
            <div>
              <h2 className="text-base font-extrabold text-[#384D55] flex items-center gap-1.5">
                <span>{detailSchool.name}</span>
                <VerifiedBadge verified={detailSchool.verified_account} size="sm" />
              </h2>
              <p className="text-xs text-[#6b787e]">{detailSchool.description}</p>
            </div>
            <button type="button" onClick={() => setActiveSchoolId(null)} className="imgsend2-secondary text-xs">
              {tr(lang, 'إغلاق', 'Fermer')}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            {/* Departments */}
            <div className="p-3 rounded border border-[#d8dfe2] bg-[#f7f9fa] space-y-2.5">
              <div className="font-extrabold text-[#384D55] flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-[#83a329]" />
                <span>{tr(lang, 'الشعب والأقسام', 'Départements')} ({departments.length})</span>
              </div>
              {isOwner && (
                <form onSubmit={handleAddDepartment} className="flex gap-2">
                  <input
                    type="text"
                    className="template-input"
                    placeholder={isAr ? 'اسم الشعبة أو القسم...' : 'Nom du département...'}
                    value={deptName}
                    onChange={(e) => setDeptName(e.target.value)}
                  />
                  <button type="submit" className="imgsend2 shrink-0">
                    {isAr ? 'إضافة' : 'Ajouter'}
                  </button>
                </form>
              )}
              <div className="flex flex-wrap gap-1.5">
                {departments.map((d) => (
                  <span key={d.id} className="px-2.5 py-1 rounded bg-white border border-[#d8dfe2] font-bold text-[#384D55]">
                    {d.name}
                  </span>
                ))}
              </div>
            </div>

            {/* Teachers & Students */}
            <div className="p-3 rounded border border-[#d8dfe2] bg-[#f7f9fa] space-y-3">
              <div className="font-extrabold text-[#384D55] flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#83a329]" />
                <span>{tr(lang, 'الكادر التعليمي والطلاب', 'Enseignants & Étudiants')}</span>
              </div>
              {isOwner && (
                <form onSubmit={handleAddTeacher} className="space-y-1.5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                    <input
                      type="text"
                      dir="ltr"
                      className="template-input"
                      placeholder={isAr ? 'بريد/هاتف المعلم' : 'Email/tél prof'}
                      value={teacherQuery}
                      onChange={(e) => setTeacherQuery(e.target.value)}
                    />
                    <input
                      type="text"
                      className="template-input"
                      placeholder={isAr ? 'المادة' : 'Matière'}
                      value={teacherSubject}
                      onChange={(e) => setTeacherSubject(e.target.value)}
                    />
                    <select className="template-input" value={teacherDeptId} onChange={(e) => setTeacherDeptId(e.target.value)}>
                      <option value="">{isAr ? 'كل الشعب' : 'Tous dép.'}</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" className="imgsend2-secondary !py-1 !px-3 text-[11px]">
                    <UserPlus className="w-3 h-3" />
                    <span>{isAr ? 'تعيين معلم بالمدرسة' : 'Ajouter enseignant'}</span>
                  </button>
                </form>
              )}

              {isOwner && (
                <form onSubmit={handleAddStudent} className="space-y-1.5 pt-2 border-t border-[#d8dfe2]">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      dir="ltr"
                      className="template-input"
                      placeholder={isAr ? 'بريد/هاتف الطالب' : 'Email/tél étudiant'}
                      value={studentQuery}
                      onChange={(e) => setStudentQuery(e.target.value)}
                    />
                    <select className="template-input" value={studentDeptId} onChange={(e) => setStudentDeptId(e.target.value)}>
                      <option value="">{isAr ? 'الشعبة (اختياري)' : 'Département'}</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" className="imgsend2-secondary !py-1 !px-3 text-[11px]">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{isAr ? 'تسجيل طالب بالمدرسة' : 'Inscrire étudiant'}</span>
                  </button>
                </form>
              )}

              <div className="text-[11px] text-[#6b787e]">
                {isAr ? 'المعلمون:' : 'Enseignants:'} <strong>{teachers.length}</strong> ·{' '}
                {isAr ? 'الطلاب:' : 'Étudiants:'} <strong>{students.length}</strong>
              </div>
            </div>

            {/* Curriculum */}
            <div className="p-3 rounded border border-[#d8dfe2] bg-[#f7f9fa] space-y-2">
              <div className="font-extrabold text-[#384D55] flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-[#83a329]" />
                <span>{tr(lang, 'المقررات والمناهج', 'Programmes scolaires')} ({curriculum.length})</span>
              </div>
              {(isOwner || isTeacher) && (
                <form onSubmit={handleAddCurriculum} className="space-y-1.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      required
                      className="template-input"
                      placeholder={isAr ? 'المادة' : 'Matière'}
                      value={currSubject}
                      onChange={(e) => setCurrSubject(e.target.value)}
                    />
                    <input
                      type="text"
                      required
                      className="template-input"
                      placeholder={isAr ? 'عنوان المقرر' : 'Titre'}
                      value={currTitle}
                      onChange={(e) => setCurrTitle(e.target.value)}
                    />
                  </div>
                  <input
                    type="text"
                    className="template-input"
                    placeholder={isAr ? 'تفاصيل مختصرة...' : 'Détails...'}
                    value={currDesc}
                    onChange={(e) => setCurrDesc(e.target.value)}
                  />
                  <button type="submit" className="imgsend2 !py-1 !px-3 text-[11px]">
                    {isAr ? 'نشر مقرر' : 'Publier programme'}
                  </button>
                </form>
              )}
              {curriculum.map((c) => (
                <div key={c.id} className="p-2 rounded bg-white border border-[#d8dfe2]">
                  <div className="font-bold text-[#384D55]">{c.subject_name} — {c.title}</div>
                  {c.description && <p className="text-[#6b787e]">{c.description}</p>}
                </div>
              ))}
            </div>

            {/* Announcements */}
            <div className="p-3 rounded border border-[#d8dfe2] bg-[#f7f9fa] space-y-2">
              <div className="font-extrabold text-[#384D55] flex items-center gap-1.5">
                <Megaphone className="w-4 h-4 text-[#83a329]" />
                <span>{tr(lang, 'إعلانات المدرسة', 'Annonces')} ({announcements.length})</span>
              </div>
              {(isOwner || isTeacher) && (
                <form onSubmit={handleAddAnnouncement} className="space-y-1.5">
                  <input
                    type="text"
                    required
                    className="template-input"
                    placeholder={isAr ? 'عنوان الإعلان' : 'Titre'}
                    value={annTitle}
                    onChange={(e) => setAnnTitle(e.target.value)}
                  />
                  <textarea
                    rows={2}
                    required
                    className="template-input"
                    placeholder={isAr ? 'نص الإعلان...' : 'Message...'}
                    value={annBody}
                    onChange={(e) => setAnnBody(e.target.value)}
                  />
                  <button type="submit" className="imgsend2 !py-1 !px-3 text-[11px]">
                    {isAr ? 'نشر إعلان' : 'Publier annonce'}
                  </button>
                </form>
              )}
              {announcements.map((a) => (
                <div key={a.id} className="p-2 rounded bg-white border border-[#d8dfe2]">
                  <div className="font-bold text-[#384D55]">{a.title}</div>
                  <p className="text-[#4a5c64] mt-0.5">{a.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Approved Public Schools Directory */}
      <div className="addressp-box-white space-y-3">
        <h2 className="text-sm font-extrabold text-[#384D55]">
          {tr(lang, 'دليل المدارس المعتمدة', 'Annuaire des écoles agréées', 'Approved Schools Directory')} ({publicSchools.length})
        </h2>
        {loading ? (
          <p className="text-xs text-[#6b787e]">{tr(lang, 'جارٍ التحميل...', 'Chargement...')}</p>
        ) : publicSchools.length === 0 ? (
          <p className="text-xs text-[#6b787e]">
            {tr(lang, 'لا توجد مدارس معتمدة منشورة حتى الآن.', 'Aucune école agréée publiée.')}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {publicSchools.map((sc) => {
              const followed = followedSchoolIds.includes(sc.id);
              return (
                <div key={sc.id} className="p-3.5 rounded-[4px] border border-[#d8dfe2] bg-[#f7f9fa] space-y-2 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="font-extrabold text-[#384D55] flex items-center gap-1">
                      <span>{sc.name}</span>
                      <VerifiedBadge verified={sc.verified_account} size="xs" />
                    </div>
                    {(sc.wilaya || sc.city) && (
                      <div className="text-[11px] text-[#6b787e]">{[sc.wilaya, sc.city].filter(Boolean).join(' — ')}</div>
                    )}
                    {sc.description && <p className="text-[#4a5c64] line-clamp-2">{sc.description}</p>}
                  </div>
                  <div className="pt-2 border-t border-[#e3e7ea] flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-[#6b787e]">
                      {sc.teachers_count ?? 0} {isAr ? 'معلم' : 'profs'} · {sc.students_count ?? 0} {isAr ? 'طالب' : 'élèves'}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleToggleFollowSchool(sc.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white border border-[#d8dfe2] font-bold text-[#384D55] cursor-pointer"
                    >
                      <Heart className={`w-3 h-3 ${followed ? 'fill-red-500 text-red-500' : ''}`} />
                      <span>{followed ? (isAr ? 'متابع' : 'Suivi') : isAr ? 'متابعة' : 'Suivre'} ({sc.followers_count ?? 0})</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
