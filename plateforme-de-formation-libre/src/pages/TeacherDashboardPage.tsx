import React, { useCallback, useEffect, useState } from 'react';
import {
  Award,
  BookOpen,
  Check,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  FilePlus2,
  FolderPlus,
  Globe,
  Lock,
  MessageSquare,
  Plus,
  Search,
  Send,
  Shield,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { useApp } from '../context/AppContext';
import type {
  EducatorItem,
  SectionContentItem,
  SectionTestItem,
  TeacherSection,
} from '../types';
import { apiRequest, getAuthToken, resolveApiUrl } from '../utils/api';
import { tr } from '../utils/locale';

interface SectionMemberRow {
  id: number;
  user_id: number;
  name: string;
  email: string;
  phone?: string;
  level?: string;
  status: string;
  verified_account?: number;
  joined_at?: string;
}

interface SectionAssistantRow {
  id: number;
  user_id: number;
  name: string;
  email: string;
  permissions_json: string;
}

interface SectionEvaluationRow {
  id: number;
  student_user_id: number;
  student_name?: string;
  teacher_name?: string;
  score: number | null;
  max_score: number;
  note: string;
  created_at: string;
}

interface SectionMessageRow {
  id: number;
  sender_user_id: number;
  sender_name: string;
  sender_verified?: number;
  message: string;
  created_at: string;
}

interface SectionProgressStudent {
  user_id: number;
  name: string;
  email: string;
  level?: string;
  tests_completed: number;
  avg_test_score: number | null;
}

export const TeacherDashboardPage: React.FC = () => {
  const { lang, user, goToAuth, navigate } = useApp();
  const isAr = lang === 'ar';

  const [ownedSections, setOwnedSections] = useState<TeacherSection[]>([]);
  const [assistedSections, setAssistedSections] = useState<TeacherSection[]>([]);
  const [joinedSections, setJoinedSections] = useState<TeacherSection[]>([]);
  const [publicSections, setPublicSections] = useState<TeacherSection[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [bannerMsg, setBannerMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Create section form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [secName, setSecName] = useState('');
  const [secSubject, setSecSubject] = useState('');
  const [secSchool, setSecSchool] = useState('');
  const [secDesc, setSecDesc] = useState('');
  const [secVis, setSecVis] = useState<'public' | 'private'>('public');
  const [secAllowStudentInvites, setSecAllowStudentInvites] = useState(false);
  const [creating, setCreating] = useState(false);

  // Selected Section Workspace
  const [activeSectionId, setActiveSectionId] = useState<number | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<
    'content' | 'tests' | 'members' | 'evaluations' | 'chat' | 'settings'
  >('content');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSection, setDetailSection] = useState<TeacherSection | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [contentList, setContentList] = useState<SectionContentItem[]>([]);
  const [testsList, setTestsList] = useState<SectionTestItem[]>([]);
  const [membersList, setMembersList] = useState<SectionMemberRow[]>([]);
  const [assistantsList, setAssistantsList] = useState<SectionAssistantRow[]>([]);
  const [evaluationsList, setEvaluationsList] = useState<SectionEvaluationRow[]>([]);
  const [messagesList, setMessagesList] = useState<SectionMessageRow[]>([]);
  const [progressStudents, setProgressStudents] = useState<SectionProgressStudent[]>([]);

  // Share copy feedback
  const [copiedShareId, setCopiedShareId] = useState<number | null>(null);

  // Publish content form
  const [cType, setCType] = useState<'lesson' | 'explanation' | 'pdf' | 'image' | 'audio'>('lesson');
  const [cTitle, setCTitle] = useState('');
  const [cBody, setCBody] = useState('');
  const [cFileId, setCFileId] = useState<string | null>(null);
  const [cFileName, setCFileName] = useState<string>('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [publishingContent, setPublishingContent] = useState(false);

  // Create test form
  const [tTitle, setTTitle] = useState('');
  const [tDesc, setTDesc] = useState('');
  const [tDuration, setTDuration] = useState(30);
  const [tMaxScore, setTMaxScore] = useState(20);
  const [tQuestions, setTQuestions] = useState<
    Array<{ stem: string; options: [string, string, string, string]; correct_index: number; points: number }>
  >([{ stem: '', options: ['', '', '', ''], correct_index: 0, points: 1 }]);
  const [creatingTest, setCreatingTest] = useState(false);

  // User search & invite
  const [userQuery, setUserQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<EducatorItem[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [manualInviteQuery, setManualInviteQuery] = useState('');
  const [assistantPerms, setAssistantPerms] = useState<string[]>([
    'manage_content',
    'manage_tests',
    'evaluate_students',
  ]);

  // Evaluation form
  const [evalStudentId, setEvalStudentId] = useState<number>(0);
  const [evalScore, setEvalScore] = useState<string>('');
  const [evalMax, setEvalMax] = useState<number>(20);
  const [evalNote, setEvalNote] = useState<string>('');
  const [savingEval, setSavingEval] = useState(false);

  // Chat input
  const [chatText, setChatText] = useState('');
  const [sendingChat, setSendingChat] = useState(false);

  // Section Settings Edit
  const [editVis, setEditVis] = useState<'public' | 'private'>('public');
  const [editAllowInvites, setEditAllowInvites] = useState(false);
  const [editDesc, setEditDesc] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const loadSections = useCallback(async () => {
    if (!user) {
      setLoadingList(false);
      return;
    }
    setLoadingList(true);
    try {
      const res = await apiRequest<{
        owned: TeacherSection[];
        assisted: TeacherSection[];
        joined: TeacherSection[];
        publicSections: TeacherSection[];
      }>('/api/teacher/sections');
      setOwnedSections(res.owned || []);
      setAssistedSections(res.assisted || []);
      setJoinedSections(res.joined || []);
      setPublicSections(res.publicSections || []);
    } catch {
      // ignore
    } finally {
      setLoadingList(false);
    }
  }, [user]);

  useEffect(() => {
    void loadSections();
  }, [loadSections]);

  const loadSectionDetail = useCallback(async (sectionId: number) => {
    setDetailLoading(true);
    try {
      const res = await apiRequest<{
        section: TeacherSection;
        isOwner: boolean;
        canManage: boolean;
        content: SectionContentItem[];
        tests: SectionTestItem[];
        members: SectionMemberRow[];
        assistants: SectionAssistantRow[];
        evaluations: SectionEvaluationRow[];
        messages: SectionMessageRow[];
      }>(`/api/sections/${sectionId}/detail`);
      setDetailSection(res.section);
      setIsOwner(Boolean(res.isOwner));
      setCanManage(Boolean(res.canManage));
      setContentList(res.content || []);
      setTestsList(res.tests || []);
      setMembersList(res.members || []);
      setAssistantsList(res.assistants || []);
      setEvaluationsList(res.evaluations || []);
      setMessagesList(res.messages || []);
      setEditVis(res.section.visibility);
      setEditAllowInvites(Boolean(res.section.allow_student_invites));
      setEditDesc(res.section.description || '');

      if (res.canManage) {
        const prog = await apiRequest<{ students: SectionProgressStudent[] }>(
          `/api/teacher/sections/${sectionId}/progress`
        ).catch(() => ({ students: [] }));
        setProgressStudents(prog.students || []);
      }
    } catch (err: any) {
      setBannerMsg({ text: err?.message || 'تعذر تحميل تفاصيل القسم.', ok: false });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeSectionId) {
      void loadSectionDetail(activeSectionId);
    }
  }, [activeSectionId, loadSectionDetail]);

  useEffect(() => {
    const q = userQuery.trim();
    if (q.length < 2) {
      setUserSearchResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setSearchingUsers(true);
      apiRequest<{ users: EducatorItem[] }>(`/api/teacher/users/search?q=${encodeURIComponent(q)}`)
        .then((r) => setUserSearchResults(r.users || []))
        .catch(() => setUserSearchResults([]))
        .finally(() => setSearchingUsers(false));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [userQuery]);

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="addressp-box-white text-center space-y-4">
          <Users className="w-10 h-10 text-[#384D55] mx-auto" />
          <h1 className="text-lg font-extrabold text-[#384D55]">
            {tr(lang, 'أقسام المعلمين والأساتذة', 'Sections Enseignants', 'Teacher Sections')}
          </h1>
          <p className="text-xs text-[#6b787e]">
            {tr(
              lang,
              'سجل الدخول لإنشاء أقسامك التعليمية أو إدارة طلابك ودروسك واختباراتك أو متابعة الأقسام المنضم إليها.',
              'Connectez-vous pour gérer vos sections, cours, tests et étudiants.',
              'Sign in to manage your sections, lessons, tests, and students.'
            )}
          </p>
          <div className="flex justify-center gap-3">
            <button type="button" onClick={() => goToAuth('login')} className="imgsend2 text-xs">
              {tr(lang, 'تسجيل الدخول', 'Connexion', 'Login')}
            </button>
            <button type="button" onClick={() => goToAuth('register')} className="imgsend2-secondary text-xs">
              {tr(lang, 'إنشاء حساب', 'Inscription', 'Register')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isEducator =
    user.level === 'teacher' ||
    user.level === 'professor' ||
    user.role === 'teacher' ||
    user.role === 'editor' ||
    user.isAdmin;

  const getShareUrl = (shareCode: string) => `https://tadribi.chtbqi.com/sections/${shareCode}`;

  const handleCopyShareLink = async (sec: TeacherSection) => {
    try {
      await navigator.clipboard.writeText(getShareUrl(sec.share_code));
      setCopiedShareId(sec.id);
      window.setTimeout(() => setCopiedShareId(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    setBannerMsg(null);
    if (secName.trim().length < 3) {
      setBannerMsg({ text: tr(lang, 'اسم القسم يجب أن يكون 3 أحرف على الأقل.', 'Nom trop court.', 'Name too short.'), ok: false });
      return;
    }
    setCreating(true);
    try {
      const res = await apiRequest<{ ok: boolean; section: TeacherSection }>('/api/teacher/sections', {
        method: 'POST',
        json: {
          name: secName.trim(),
          subject_name: secSubject.trim(),
          school_name: secSchool.trim(),
          description: secDesc.trim(),
          visibility: secVis,
          allow_student_invites: secAllowStudentInvites,
        },
      });
      setSecName('');
      setSecSubject('');
      setSecSchool('');
      setSecDesc('');
      setShowCreateForm(false);
      await loadSections();
      if (res.section?.id) setActiveSectionId(res.section.id);
      setBannerMsg({ text: tr(lang, 'تم إنشاء القسم وتوليد رابط المشاركة بنجاح.', 'Section créée.', 'Section created.'), ok: true });
    } catch (err: any) {
      setBannerMsg({ text: err?.message || 'تعذر إنشاء القسم.', ok: false });
    } finally {
      setCreating(false);
    }
  };

  const handleUploadSectionFile = async (file: File) => {
    if (!activeSectionId) return;
    setUploadingFile(true);
    setBannerMsg(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('File read error'));
        reader.readAsDataURL(file);
      });
      const res = await apiRequest<{ ok: boolean; file: { id: string; original_name: string } }>(
        '/api/files/upload',
        {
          method: 'POST',
          json: {
            dataUrl,
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            entityType: 'section_lesson',
            entityId: String(activeSectionId),
            visibility: 'section',
          },
        }
      );
      setCFileId(res.file.id);
      setCFileName(res.file.original_name || file.name);
      if (file.type.startsWith('image/')) setCType('image');
      else if (file.type === 'application/pdf') setCType('pdf');
      else if (file.type.startsWith('audio/')) setCType('audio');
    } catch (err: any) {
      setBannerMsg({ text: err?.message || 'فشل رفع الملف.', ok: false });
    } finally {
      setUploadingFile(false);
    }
  };

  const handlePublishContent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSectionId || !cTitle.trim()) return;
    setPublishingContent(true);
    setBannerMsg(null);
    try {
      await apiRequest(`/api/teacher/sections/${activeSectionId}/content`, {
        method: 'POST',
        json: {
          content_type: cType,
          title: cTitle.trim(),
          body: cBody.trim(),
          file_id: cFileId,
        },
      });
      setCTitle('');
      setCBody('');
      setCFileId(null);
      setCFileName('');
      await loadSectionDetail(activeSectionId);
      setBannerMsg({ text: tr(lang, 'تم نشر المحتوى داخل القسم بنجاح.', 'Contenu publié.', 'Content published.'), ok: true });
    } catch (err: any) {
      setBannerMsg({ text: err?.message || 'تعذر نشر المحتوى.', ok: false });
    } finally {
      setPublishingContent(false);
    }
  };

  const handleCreateTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSectionId || !tTitle.trim()) return;
    const validQs = tQuestions
      .map((q) => ({
        stem: q.stem.trim(),
        options: q.options.map((o) => o.trim()).filter(Boolean),
        correct_index: q.correct_index,
        points: q.points,
      }))
      .filter((q) => q.stem && q.options.length >= 2);
    if (validQs.length === 0) {
      setBannerMsg({ text: tr(lang, 'أضف سؤالاً واحداً مكتمل الخيارات على الأقل.', 'Ajoutez au moins une question.', 'Add at least one valid question.'), ok: false });
      return;
    }
    setCreatingTest(true);
    try {
      await apiRequest(`/api/teacher/sections/${activeSectionId}/tests`, {
        method: 'POST',
        json: {
          title: tTitle.trim(),
          description: tDesc.trim(),
          duration_minutes: tDuration,
          max_score: tMaxScore,
          questions: validQs,
        },
      });
      setTTitle('');
      setTDesc('');
      setTQuestions([{ stem: '', options: ['', '', '', ''], correct_index: 0, points: 1 }]);
      await loadSectionDetail(activeSectionId);
      setBannerMsg({ text: tr(lang, 'تم إنشاء الاختبار ونشره لطلاب القسم.', 'Test créé.', 'Test created.'), ok: true });
    } catch (err: any) {
      setBannerMsg({ text: err?.message || 'تعذر إنشاء الاختبار.', ok: false });
    } finally {
      setCreatingTest(false);
    }
  };

  const handleInviteUser = async (payload: { targetUserId?: number; query?: string }) => {
    if (!activeSectionId) return;
    setBannerMsg(null);
    try {
      const res = await apiRequest<{ ok: boolean; invitedUser: { name: string } }>(
        `/api/teacher/sections/${activeSectionId}/invite`,
        { method: 'POST', json: payload }
      );
      setManualInviteQuery('');
      setUserQuery('');
      setUserSearchResults([]);
      await loadSectionDetail(activeSectionId);
      setBannerMsg({
        text: isAr
          ? `تم إرسال دعوة انضمام إلى ${res.invitedUser.name} بنجاح.`
          : `Invitation envoyée à ${res.invitedUser.name}.`,
        ok: true,
      });
    } catch (err: any) {
      setBannerMsg({ text: err?.message || 'تعذر إرسال الدعوة.', ok: false });
    }
  };

  const handleAddAssistant = async (targetUserId: number) => {
    if (!activeSectionId) return;
    try {
      await apiRequest(`/api/teacher/sections/${activeSectionId}/assistants`, {
        method: 'POST',
        json: { userId: targetUserId, permissions: assistantPerms },
      });
      await loadSectionDetail(activeSectionId);
      setBannerMsg({ text: tr(lang, 'تم تعيين المساعد بنجاح.', 'Assistant ajouté.', 'Assistant added.'), ok: true });
    } catch (err: any) {
      setBannerMsg({ text: err?.message || 'تعذر تعيين المساعد.', ok: false });
    }
  };

  const handleRemoveAssistant = async (targetUserId: number) => {
    if (!activeSectionId) return;
    await apiRequest(`/api/teacher/sections/${activeSectionId}/assistants/${targetUserId}`, {
      method: 'DELETE',
    }).catch(() => {});
    await loadSectionDetail(activeSectionId);
  };

  const handleRemoveMember = async (targetUserId: number) => {
    if (!activeSectionId) return;
    await apiRequest(`/api/teacher/sections/${activeSectionId}/members/${targetUserId}`, {
      method: 'DELETE',
    }).catch(() => {});
    await loadSectionDetail(activeSectionId);
  };

  const handleSaveEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSectionId || !evalStudentId) return;
    setSavingEval(true);
    try {
      await apiRequest(`/api/teacher/sections/${activeSectionId}/evaluations`, {
        method: 'POST',
        json: {
          studentUserId: evalStudentId,
          score: evalScore !== '' ? Number(evalScore) : undefined,
          maxScore: evalMax,
          note: evalNote.trim(),
        },
      });
      setEvalScore('');
      setEvalNote('');
      await loadSectionDetail(activeSectionId);
      setBannerMsg({ text: tr(lang, 'تم حفظ تقييم الطالب بنجاح.', 'Évaluation enregistrée.', 'Evaluation saved.'), ok: true });
    } catch (err: any) {
      setBannerMsg({ text: err?.message || 'تعذر حفظ التقييم.', ok: false });
    } finally {
      setSavingEval(false);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSectionId || !chatText.trim()) return;
    setSendingChat(true);
    try {
      await apiRequest(`/api/sections/${activeSectionId}/messages`, {
        method: 'POST',
        json: { message: chatText.trim() },
      });
      setChatText('');
      await loadSectionDetail(activeSectionId);
    } finally {
      setSendingChat(false);
    }
  };

  const handleSaveSectionSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSectionId) return;
    setSavingSettings(true);
    try {
      await apiRequest(`/api/teacher/sections/${activeSectionId}`, {
        method: 'PATCH',
        json: {
          visibility: editVis,
          allow_student_invites: editAllowInvites,
          description: editDesc,
        },
      });
      await Promise.all([loadSectionDetail(activeSectionId), loadSections()]);
      setBannerMsg({ text: tr(lang, 'تم حفظ إعدادات القسم.', 'Paramètres enregistrés.', 'Settings saved.'), ok: true });
    } catch (err: any) {
      setBannerMsg({ text: err?.message || 'تعذر حفظ الإعدادات.', ok: false });
    } finally {
      setSavingSettings(false);
    }
  };

  const openProtectedFile = async (fileId: string) => {
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
      a.download = `tadribi-file-${fileId}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      setBannerMsg({ text: tr(lang, 'تعذر فتح الملف المرفق.', 'Impossible d’ouvrir le fichier.', 'Failed to open file.'), ok: false });
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="rotator-box !mb-0 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-[#384D55] flex items-center gap-2">
            <Users className="w-5 h-5 text-[#83a329]" />
            <span>{tr(lang, 'أقسام المعلمين والأساتذة', 'Sections Enseignants & Professeurs', 'Teacher Sections')}</span>
          </h1>
          <p className="text-xs text-[#6b787e] mt-0.5">
            {tr(
              lang,
              'أنشئ أقساماً خاصة أو عامة مستقلة، أضف مساعدين، وانشر دروساً وملفات واختبارات تفاعلية لطلابك.',
              'Créez des sections publiques ou privées, publiez vos leçons et gérez vos étudiants.',
              'Create public or private sections, assign assistants, and publish lessons and tests.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isEducator ? (
            <button
              type="button"
              onClick={() => setShowCreateForm((v) => !v)}
              className="imgsend2 text-xs"
            >
              <FolderPlus className="w-4 h-4" />
              <span>{tr(lang, 'إنشاء قسم جديد', 'Créer une section', 'Create Section')}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('profile')}
              className="imgsend2-secondary text-xs"
            >
              <span>{tr(lang, 'تحديث نوع الحساب إلى معلم/أستاذ', 'Passer en compte Enseignant', 'Switch Account to Teacher')}</span>
            </button>
          )}
        </div>
      </div>

      {bannerMsg && (
        <div
          className={`p-3 rounded-[4px] border text-xs font-bold ${
            bannerMsg.ok
              ? 'bg-[#e2efbf] border-[#A6CE39] text-[#384D55]'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {bannerMsg.text}
        </div>
      )}

      {showCreateForm && isEducator && (
        <form onSubmit={handleCreateSection} className="addressp-box-white space-y-4">
          <h2 className="text-sm font-extrabold text-[#384D55]">
            {tr(lang, 'بيانات القسم التعليمي الجديد', 'Nouvelle section pédagogique', 'New Teacher Section')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-bold mb-1">{tr(lang, 'اسم القسم', 'Nom de la section')} *</label>
              <input
                type="text"
                required
                className="template-input"
                placeholder={isAr ? 'مثال: قسم الرياضيات — السنة السادسة' : 'Ex : Mathématiques 6e'}
                value={secName}
                onChange={(e) => setSecName(e.target.value)}
              />
            </div>
            <div>
              <label className="block font-bold mb-1">{tr(lang, 'المادة / التخصص', 'Matière')}</label>
              <input
                type="text"
                className="template-input"
                placeholder={isAr ? 'مثال: الرياضيات / التربية' : 'Ex : Mathématiques'}
                value={secSubject}
                onChange={(e) => setSecSubject(e.target.value)}
              />
            </div>
            <div>
              <label className="block font-bold mb-1">{tr(lang, 'اسم المؤسسة (اختياري)', 'Établissement (optionnel)')}</label>
              <input
                type="text"
                className="template-input"
                value={secSchool}
                onChange={(e) => setSecSchool(e.target.value)}
              />
            </div>
            <div>
              <label className="block font-bold mb-1">{tr(lang, 'الخصوصية', 'Visibilité')}</label>
              <select
                className="template-input"
                value={secVis}
                onChange={(e) => setSecVis(e.target.value as 'public' | 'private')}
              >
                <option value="public">{tr(lang, 'عام — متاح عبر الرابط المباشر', 'Public — via lien direct')}</option>
                <option value="private">{tr(lang, 'خاص — بالدعوة أو موافقة المعلم فقط', 'Privé — sur invitation uniquement')}</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block font-bold mb-1">{tr(lang, 'وصف القسم', 'Description')}</label>
              <textarea
                rows={2}
                className="template-input"
                value={secDesc}
                onChange={(e) => setSecDesc(e.target.value)}
              />
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-bold text-[#384D55] cursor-pointer">
            <input
              type="checkbox"
              checked={secAllowStudentInvites}
              onChange={(e) => setSecAllowStudentInvites(e.target.checked)}
              className="accent-[#83a329]"
            />
            <span>{tr(lang, 'السماح للطلاب المسجلين بدعوة زملائهم', 'Autoriser les étudiants à inviter leurs pairs')}</span>
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={creating} className="imgsend2 text-xs">
              {creating ? '...' : tr(lang, 'حفظ وإنشاء القسم', 'Créer la section')}
            </button>
            <button type="button" onClick={() => setShowCreateForm(false)} className="imgsend2-secondary text-xs">
              {tr(lang, 'إلغاء', 'Annuler')}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Sections List Sidebar */}
        <div className="lg:col-span-4 space-y-4">
          <div className="addressp-box-white space-y-3">
            <h2 className="text-sm font-extrabold text-[#384D55]">
              {tr(lang, 'أقسامي (إدارة)', 'Mes sections (Gestion)', 'My Managed Sections')} ({ownedSections.length + assistedSections.length})
            </h2>
            {loadingList ? (
              <p className="text-xs text-[#6b787e]">{tr(lang, 'جارٍ التحميل...', 'Chargement...')}</p>
            ) : ownedSections.length === 0 && assistedSections.length === 0 ? (
              <p className="text-xs text-[#6b787e]">
                {tr(lang, 'لا توجد أقسام منشأة بعد.', 'Aucune section créée.')}
              </p>
            ) : (
              <div className="space-y-2">
                {[...ownedSections, ...assistedSections].map((sec) => (
                  <div
                    key={`m-${sec.id}`}
                    className={`p-3 rounded-[4px] border text-xs transition-colors ${
                      activeSectionId === sec.id
                        ? 'bg-[#e2efbf]/50 border-[#83a329]'
                        : 'bg-[#f7f9fa] border-[#d8dfe2]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveSectionId(sec.id)}
                        className="text-start font-extrabold text-[#384D55] hover:underline cursor-pointer"
                      >
                        {sec.name}
                      </button>
                      <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-[#d8dfe2] text-[10px] font-bold">
                        {sec.visibility === 'public' ? <Globe className="w-3 h-3 text-[#557a16]" /> : <Lock className="w-3 h-3 text-amber-700" />}
                        {sec.visibility === 'public' ? (isAr ? 'عام' : 'Public') : (isAr ? 'خاص' : 'Privé')}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#6b787e] mt-1 flex flex-wrap items-center gap-2">
                      {sec.subject_name && <span>{sec.subject_name}</span>}
                      <span>· {sec.members_count ?? 0} {isAr ? 'عضو' : 'membres'}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => void handleCopyShareLink(sec)}
                        className="px-2 py-1 rounded bg-white border border-[#d8dfe2] text-[10px] font-bold text-[#384D55] inline-flex items-center gap-1 cursor-pointer"
                      >
                        {copiedShareId === sec.id ? <Check className="w-3 h-3 text-[#557a16]" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedShareId === sec.id ? (isAr ? 'تم النسخ' : 'Copié') : sec.share_code}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate('section-view', { shareCode: sec.share_code })}
                        className="px-2 py-1 rounded bg-white border border-[#d8dfe2] text-[10px] font-bold text-[#384D55] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>{isAr ? 'رابط القسم' : 'Voir'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {joinedSections.length > 0 && (
            <div className="addressp-box-white space-y-2">
              <h3 className="text-xs font-extrabold text-[#384D55]">
                {tr(lang, 'الأقسام المنضم إليها', 'Sections rejointes')} ({joinedSections.length})
              </h3>
              {joinedSections.map((sec) => (
                <button
                  key={`j-${sec.id}`}
                  type="button"
                  onClick={() => setActiveSectionId(sec.id)}
                  className="w-full text-start p-2.5 rounded-[4px] border border-[#d8dfe2] bg-[#f7f9fa] text-xs hover:border-[#A6CE39] cursor-pointer"
                >
                  <div className="font-bold text-[#384D55] flex items-center gap-1">
                    <span>{sec.name}</span>
                    <VerifiedBadge verified={sec.teacher_verified} size="xs" />
                  </div>
                  <div className="text-[11px] text-[#6b787e]">{sec.teacher_name}</div>
                </button>
              ))}
            </div>
          )}

          <div className="addressp-box-white space-y-2">
            <h3 className="text-xs font-extrabold text-[#384D55]">
              {tr(lang, 'أقسام عامة متاحة', 'Sections publiques disponibles')}
            </h3>
            {publicSections.length === 0 ? (
              <p className="text-[11px] text-[#6b787e]">{tr(lang, 'لا توجد أقسام عامة منشورة حالياً.', 'Aucune section publique.')}</p>
            ) : (
              <div className="space-y-1.5">
                {publicSections.slice(0, 8).map((sec) => (
                  <button
                    key={`p-${sec.id}`}
                    type="button"
                    onClick={() => navigate('section-view', { shareCode: sec.share_code })}
                    className="w-full text-start p-2.5 rounded-[4px] border border-[#d8dfe2] bg-[#f7f9fa] text-xs hover:border-[#A6CE39] cursor-pointer"
                  >
                    <div className="font-bold text-[#384D55] flex items-center justify-between gap-1">
                      <span className="truncate">{sec.name}</span>
                      <span className="text-[10px] text-[#557a16] shrink-0">{sec.members_count ?? 0}</span>
                    </div>
                    <div className="text-[11px] text-[#6b787e] flex items-center gap-1">
                      <span>{sec.teacher_name}</span>
                      <VerifiedBadge verified={sec.teacher_verified} size="xs" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Active Section Workspace */}
        <div className="lg:col-span-8">
          {!activeSectionId || !detailSection ? (
            <div className="addressp-box-white text-center py-12 space-y-2">
              <BookOpen className="w-10 h-10 text-[#6b787e] mx-auto opacity-60" />
              <p className="text-sm font-bold text-[#384D55]">
                {tr(lang, 'اختر قسماً من القائمة لإدارته أو متابعة دروسه واختباراته.', 'Sélectionnez une section pour gérer son contenu.')}
              </p>
            </div>
          ) : detailLoading ? (
            <div className="addressp-box-white text-center py-12 text-xs text-[#6b787e]">
              {tr(lang, 'جارٍ تحميل مساحة عمل القسم...', 'Chargement...')}
            </div>
          ) : (
            <div className="addressp-box-white space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#d8dfe2]">
                <div>
                  <h2 className="text-base font-extrabold text-[#384D55]">{detailSection.name}</h2>
                  <p className="text-xs text-[#6b787e]" dir="ltr">
                    {getShareUrl(detailSection.share_code)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopyShareLink(detailSection)}
                    className="imgsend2-secondary !py-1.5 !px-3 text-xs"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{tr(lang, 'نسخ رابط القسم', 'Copier le lien')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('section-view', { shareCode: detailSection.share_code })}
                    className="imgsend2 !py-1.5 !px-3 text-xs"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{tr(lang, 'عرض صفحة الطالب', 'Vue étudiant')}</span>
                  </button>
                </div>
              </div>

              {/* Workspace Tabs */}
              <div className="flex flex-wrap gap-1.5 border-b border-[#d8dfe2] pb-2">
                {(
                  [
                    { id: 'content', ar: 'الدروس والملفات', fr: 'Contenu', icon: BookOpen },
                    { id: 'tests', ar: 'الاختبارات', fr: 'Tests', icon: ClipboardList },
                    ...(canManage
                      ? [
                          { id: 'members', ar: 'الأعضاء والمساعدون', fr: 'Membres', icon: Users },
                          { id: 'evaluations', ar: 'التقييم والنتائج', fr: 'Évaluations', icon: Award },
                        ]
                      : []),
                    { id: 'chat', ar: 'نقاش القسم', fr: 'Discussion', icon: MessageSquare },
                    ...(isOwner ? [{ id: 'settings', ar: 'الإعدادات', fr: 'Paramètres', icon: Shield }] : []),
                  ] as Array<{ id: typeof workspaceTab; ar: string; fr: string; icon: any }>
                ).map((tb) => {
                  const Icon = tb.icon;
                  return (
                    <button
                      key={tb.id}
                      type="button"
                      onClick={() => setWorkspaceTab(tb.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] text-xs font-bold cursor-pointer border ${
                        workspaceTab === tb.id
                          ? 'bg-[#384D55] text-[#A6CE39] border-[#384D55]'
                          : 'bg-[#f7f9fa] text-[#384D55] border-[#d8dfe2]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{isAr ? tb.ar : tb.fr}</span>
                    </button>
                  );
                })}
              </div>

              {/* Tab: Content */}
              {workspaceTab === 'content' && (
                <div className="space-y-4">
                  {canManage && (
                    <form onSubmit={handlePublishContent} className="p-3.5 rounded-[4px] border border-[#d8dfe2] bg-[#f7f9fa] space-y-3 text-xs">
                      <div className="font-extrabold text-[#384D55] flex items-center gap-1.5">
                        <FilePlus2 className="w-4 h-4 text-[#83a329]" />
                        <span>{tr(lang, 'نشر درس أو شرح أو مرفق', 'Publier une ressource')}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <select
                          className="template-input"
                          value={cType}
                          onChange={(e) => setCType(e.target.value as any)}
                        >
                          <option value="lesson">{isAr ? 'درس نصي' : 'Leçon'}</option>
                          <option value="explanation">{isAr ? 'شرح مفصل' : 'Explication'}</option>
                          <option value="pdf">{isAr ? 'ملف PDF' : 'Document PDF'}</option>
                          <option value="image">{isAr ? 'صورة توضيحية' : 'Image'}</option>
                          <option value="audio">{isAr ? 'تسجيل صوتي' : 'Audio'}</option>
                        </select>
                        <input
                          type="text"
                          required
                          className="template-input sm:col-span-2"
                          placeholder={isAr ? 'عنوان الدرس أو المرفق' : 'Titre de la ressource'}
                          value={cTitle}
                          onChange={(e) => setCTitle(e.target.value)}
                        />
                      </div>
                      <textarea
                        rows={3}
                        className="template-input"
                        placeholder={isAr ? 'نص الدرس أو الشرح أو الملاحظات...' : 'Contenu du cours...'}
                        value={cBody}
                        onChange={(e) => setCBody(e.target.value)}
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[4px] border border-[#d8dfe2] bg-white text-xs font-bold cursor-pointer">
                          <Upload className="w-3.5 h-3.5 text-[#83a329]" />
                          <span>
                            {uploadingFile
                              ? tr(lang, 'جارٍ الرفع...', 'Envoi...')
                              : cFileName || tr(lang, 'إرفاق ملف (PDF / صورة / صوت)', 'Joindre un fichier')}
                          </span>
                          <input
                            type="file"
                            className="hidden"
                            accept="application/pdf,image/*,audio/*"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void handleUploadSectionFile(f);
                            }}
                          />
                        </label>
                        <button type="submit" disabled={publishingContent || uploadingFile} className="imgsend2 text-xs">
                          <Plus className="w-3.5 h-3.5" />
                          <span>{publishingContent ? '...' : tr(lang, 'نشر الآن', 'Publier')}</span>
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="space-y-2.5">
                    {contentList.length === 0 ? (
                      <p className="text-xs text-[#6b787e]">{tr(lang, 'لم يتم نشر محتوى بعد.', 'Aucun contenu publié.')}</p>
                    ) : (
                      contentList.map((item) => (
                        <div key={item.id} className="p-3 rounded-[4px] border border-[#d8dfe2] bg-white space-y-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-extrabold text-[#384D55]">{item.title}</span>
                            <span className="px-2 py-0.5 rounded bg-[#e2efbf] text-[#2c4a12] text-[10px] font-bold">
                              {item.content_type}
                            </span>
                          </div>
                          {item.body && <p className="text-[#4a5c64] whitespace-pre-line leading-relaxed">{item.body}</p>}
                          <div className="flex items-center justify-between text-[11px] text-[#6b787e]">
                            <span>{item.author_name}</span>
                            {item.file_id && (
                              <button
                                type="button"
                                onClick={() => void openProtectedFile(item.file_id!)}
                                className="inline-flex items-center gap-1 text-[#557a16] font-bold hover:underline cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>{tr(lang, 'تنزيل المرفق', 'Télécharger le fichier')}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Tab: Tests */}
              {workspaceTab === 'tests' && (
                <div className="space-y-4">
                  {canManage && (
                    <form onSubmit={handleCreateTest} className="p-3.5 rounded-[4px] border border-[#d8dfe2] bg-[#f7f9fa] space-y-3 text-xs">
                      <div className="font-extrabold text-[#384D55]">
                        {tr(lang, 'إنشاء اختبار إلكتروني للقسم', 'Créer un test')}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <input
                          type="text"
                          required
                          className="template-input"
                          placeholder={isAr ? 'عنوان الاختبار' : 'Titre du test'}
                          value={tTitle}
                          onChange={(e) => setTTitle(e.target.value)}
                        />
                        <input
                          type="number"
                          min={5}
                          max={180}
                          className="template-input"
                          placeholder={isAr ? 'المدة (دقيقة)' : 'Durée (min)'}
                          value={tDuration}
                          onChange={(e) => setTDuration(Number(e.target.value))}
                        />
                        <input
                          type="number"
                          min={5}
                          max={100}
                          className="template-input"
                          placeholder={isAr ? 'العلامة القصوى' : 'Note max'}
                          value={tMaxScore}
                          onChange={(e) => setTMaxScore(Number(e.target.value))}
                        />
                      </div>
                      <input
                        type="text"
                        className="template-input"
                        placeholder={isAr ? 'وصف أو تعليمات (اختياري)' : 'Instructions (optionnel)'}
                        value={tDesc}
                        onChange={(e) => setTDesc(e.target.value)}
                      />

                      <div className="space-y-2.5">
                        {tQuestions.map((q, qIdx) => (
                          <div key={qIdx} className="p-2.5 rounded border border-[#d8dfe2] bg-white space-y-2">
                            <input
                              type="text"
                              className="template-input"
                              placeholder={`${isAr ? 'السؤال' : 'Question'} #${qIdx + 1}`}
                              value={q.stem}
                              onChange={(e) => {
                                const next = [...tQuestions];
                                next[qIdx].stem = e.target.value;
                                setTQuestions(next);
                              }}
                            />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {q.options.map((opt, oIdx) => (
                                <div key={oIdx} className="flex items-center gap-1.5">
                                  <input
                                    type="radio"
                                    name={`correct-${qIdx}`}
                                    checked={q.correct_index === oIdx}
                                    onChange={() => {
                                      const next = [...tQuestions];
                                      next[qIdx].correct_index = oIdx;
                                      setTQuestions(next);
                                    }}
                                  />
                                  <input
                                    type="text"
                                    className="template-input"
                                    placeholder={`${isAr ? 'خيار' : 'Option'} ${oIdx + 1}`}
                                    value={opt}
                                    onChange={(e) => {
                                      const next = [...tQuestions];
                                      next[qIdx].options[oIdx] = e.target.value;
                                      setTQuestions(next);
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() =>
                              setTQuestions((prev) => [
                                ...prev,
                                { stem: '', options: ['', '', '', ''], correct_index: 0, points: 1 },
                              ])
                            }
                            className="imgsend2-secondary !py-1 !px-3 text-xs"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{tr(lang, 'إضافة سؤال آخر', 'Ajouter une question')}</span>
                          </button>
                          <button type="submit" disabled={creatingTest} className="imgsend2 text-xs">
                            <span>{creatingTest ? '...' : tr(lang, 'نشر الاختبار', 'Publier le test')}</span>
                          </button>
                        </div>
                      </div>
                    </form>
                  )}

                  <div className="space-y-2">
                    {testsList.map((tst) => (
                      <div key={tst.id} className="p-3 rounded-[4px] border border-[#d8dfe2] bg-white flex items-center justify-between text-xs">
                        <div>
                          <div className="font-extrabold text-[#384D55]">{tst.title}</div>
                          <div className="text-[11px] text-[#6b787e]">
                            {tst.duration_minutes} {isAr ? 'دقيقة' : 'min'} · {tst.max_score} {isAr ? 'نقطة' : 'pts'}
                            {tst.questions ? ` · ${tst.questions.length} ${isAr ? 'سؤال' : 'questions'}` : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => navigate('section-view', { shareCode: detailSection.share_code })}
                          className="imgsend2-secondary !py-1 !px-2.5 text-[11px]"
                        >
                          {tr(lang, 'معاينة', 'Ouvrir')}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab: Members & Assistants */}
              {workspaceTab === 'members' && canManage && (
                <div className="space-y-4 text-xs">
                  <div className="p-3.5 rounded-[4px] border border-[#d8dfe2] bg-[#f7f9fa] space-y-3">
                    <div className="font-extrabold text-[#384D55] flex items-center gap-1.5">
                      <UserPlus className="w-4 h-4 text-[#83a329]" />
                      <span>{tr(lang, 'دعوة طالب أو تعيين مساعد عبر البحث', 'Inviter un membre ou assistant')}</span>
                    </div>
                    <div className="relative">
                      <Search className="w-4 h-4 text-[#6b787e] absolute top-2.5 start-2.5" />
                      <input
                        type="text"
                        className="template-input !ps-8"
                        placeholder={isAr ? 'ابحث بالاسم أو البريد أو الهاتف...' : 'Nom, e-mail ou téléphone...'}
                        value={userQuery}
                        onChange={(e) => setUserQuery(e.target.value)}
                      />
                    </div>
                    {searchingUsers && <div className="text-[11px] text-[#6b787e]">{tr(lang, 'جارٍ البحث...', 'Recherche...')}</div>}
                    {userSearchResults.length > 0 && (
                      <div className="space-y-1.5 max-h-52 overflow-y-auto">
                        {userSearchResults.map((u) => (
                          <div
                            key={u.id}
                            className="p-2 rounded bg-white border border-[#d8dfe2] flex flex-wrap items-center justify-between gap-2"
                          >
                            <div>
                              <div className="font-bold text-[#384D55] flex items-center gap-1">
                                <span>{u.name}</span>
                                <VerifiedBadge verified={u.verified_account} size="xs" />
                              </div>
                              <div className="text-[11px] text-[#6b787e]" dir="ltr">{u.email || u.level}</div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => void handleInviteUser({ targetUserId: u.id })}
                                className="imgsend2 !py-1 !px-2.5 text-[11px]"
                              >
                                {isAr ? 'دعوة كطالب' : 'Inviter'}
                              </button>
                              {isOwner && (
                                <button
                                  type="button"
                                  onClick={() => void handleAddAssistant(u.id)}
                                  className="imgsend2-secondary !py-1 !px-2.5 text-[11px]"
                                >
                                  {isAr ? 'تعيين كمساعد' : 'Assistant'}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        dir="ltr"
                        className="template-input"
                        placeholder={isAr ? 'أو أدخل البريد الإلكتروني / الهاتف مباشرة...' : 'Email ou téléphone...'}
                        value={manualInviteQuery}
                        onChange={(e) => setManualInviteQuery(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => manualInviteQuery.trim() && void handleInviteUser({ query: manualInviteQuery.trim() })}
                        className="imgsend2 shrink-0 text-xs"
                      >
                        {isAr ? 'إرسال دعوة' : 'Inviter'}
                      </button>
                    </div>

                    {isOwner && (
                      <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px]">
                        <span className="font-bold text-[#384D55]">{isAr ? 'صلاحيات المساعد عند التعيين:' : 'Droits assistant :'}</span>
                        {[
                          { id: 'manage_content', ar: 'إدارة الدروس', fr: 'Contenu' },
                          { id: 'manage_tests', ar: 'إدارة الاختبارات', fr: 'Tests' },
                          { id: 'evaluate_students', ar: 'تقييم الطلاب', fr: 'Évaluations' },
                          { id: 'invite_students', ar: 'دعوة الطلاب', fr: 'Invitations' },
                        ].map((perm) => (
                          <label key={perm.id} className="inline-flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={assistantPerms.includes(perm.id)}
                              onChange={(e) =>
                                setAssistantPerms((prev) =>
                                  e.target.checked ? [...prev, perm.id] : prev.filter((x) => x !== perm.id)
                                )
                              }
                            />
                            <span>{isAr ? perm.ar : perm.fr}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {assistantsList.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="font-extrabold text-[#384D55]">{tr(lang, 'المساعدون المعينون', 'Assistants')}</div>
                      {assistantsList.map((a) => (
                        <div key={a.id} className="p-2.5 rounded border border-[#d8dfe2] bg-[#f7f9fa] flex items-center justify-between">
                          <div>
                            <span className="font-bold text-[#384D55]">{a.name}</span>{' '}
                            <span className="text-[11px] text-[#6b787e]" dir="ltr">({a.email})</span>
                          </div>
                          {isOwner && (
                            <button
                              type="button"
                              onClick={() => void handleRemoveAssistant(a.user_id)}
                              className="text-red-600 hover:underline font-bold cursor-pointer inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>{isAr ? 'إزالة' : 'Retirer'}</span>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <div className="font-extrabold text-[#384D55]">
                      {tr(lang, 'الأعضاء والدعوات', 'Membres & Invitations')} ({membersList.length})
                    </div>
                    {membersList.map((m) => (
                      <div key={m.id} className="p-2.5 rounded border border-[#d8dfe2] bg-white flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-bold text-[#384D55]">{m.name}</span>{' '}
                          <span className="text-[11px] text-[#6b787e]" dir="ltr">({m.email})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              m.status === 'active' ? 'bg-[#e2efbf] text-[#2c4a12]' : 'bg-amber-50 text-amber-800'
                            }`}
                          >
                            {m.status}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleRemoveMember(m.user_id)}
                            className="text-red-600 hover:underline cursor-pointer text-[11px] font-bold"
                          >
                            {isAr ? 'إزالة' : 'Retirer'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab: Evaluations & Progress */}
              {workspaceTab === 'evaluations' && canManage && (
                <div className="space-y-4 text-xs">
                  <form onSubmit={handleSaveEvaluation} className="p-3.5 rounded-[4px] border border-[#d8dfe2] bg-[#f7f9fa] space-y-3">
                    <div className="font-extrabold text-[#384D55]">{tr(lang, 'تسجيل تقييم طالب', 'Évaluer un étudiant')}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <select
                        required
                        className="template-input"
                        value={evalStudentId}
                        onChange={(e) => setEvalStudentId(Number(e.target.value))}
                      >
                        <option value={0}>{tr(lang, 'اختر الطالب...', 'Choisir un étudiant...')}</option>
                        {membersList
                          .filter((m) => m.status === 'active')
                          .map((m) => (
                            <option key={m.user_id} value={m.user_id}>
                              {m.name}
                            </option>
                          ))}
                      </select>
                      <input
                        type="number"
                        step="0.5"
                        className="template-input"
                        placeholder={isAr ? 'الدرجة' : 'Note'}
                        value={evalScore}
                        onChange={(e) => setEvalScore(e.target.value)}
                      />
                      <input
                        type="number"
                        className="template-input"
                        placeholder={isAr ? 'العلامة القصوى' : 'Note max'}
                        value={evalMax}
                        onChange={(e) => setEvalMax(Number(e.target.value))}
                      />
                    </div>
                    <textarea
                      rows={2}
                      className="template-input"
                      placeholder={isAr ? 'ملاحظات التقييم التربوي...' : 'Observations...'}
                      value={evalNote}
                      onChange={(e) => setEvalNote(e.target.value)}
                    />
                    <button type="submit" disabled={savingEval || !evalStudentId} className="imgsend2 text-xs">
                      {savingEval ? '...' : tr(lang, 'حفظ التقييم', 'Enregistrer l’évaluation')}
                    </button>
                  </form>

                  {progressStudents.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="font-extrabold text-[#384D55]">{tr(lang, 'تقدم الطلاب في الاختبارات', 'Progression aux tests')}</div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-[#f4f6f7] border-b border-[#d8dfe2]">
                              <th className="p-2 text-start">{isAr ? 'الطالب' : 'Étudiant'}</th>
                              <th className="p-2 text-start">{isAr ? 'الاختبارات المنجزة' : 'Tests'}</th>
                              <th className="p-2 text-start">{isAr ? 'المعدل' : 'Moyenne'}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#efefef]">
                            {progressStudents.map((st) => (
                              <tr key={st.user_id}>
                                <td className="p-2 font-bold">{st.name}</td>
                                <td className="p-2 tabular-nums">{st.tests_completed}</td>
                                <td className="p-2 tabular-nums font-bold">
                                  {st.avg_test_score !== null ? Number(st.avg_test_score).toFixed(2) : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {evaluationsList.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="font-extrabold text-[#384D55]">{tr(lang, 'التقييمات المسجلة', 'Évaluations enregistrées')}</div>
                      {evaluationsList.map((ev) => (
                        <div key={ev.id} className="p-2.5 rounded border border-[#d8dfe2] bg-white">
                          <div className="flex justify-between font-bold text-[#384D55]">
                            <span>{ev.student_name || user.name}</span>
                            {ev.score !== null && (
                              <span className="text-[#557a16]" dir="ltr">
                                {ev.score} / {ev.max_score}
                              </span>
                            )}
                          </div>
                          {ev.note && <p className="text-[#6b787e] mt-1">{ev.note}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Chat */}
              {workspaceTab === 'chat' && (
                <div className="space-y-3 text-xs">
                  <div className="max-h-72 overflow-y-auto space-y-2 p-2.5 rounded border border-[#d8dfe2] bg-[#f7f9fa]">
                    {messagesList.length === 0 ? (
                      <p className="text-[#6b787e] text-center py-6">
                        {tr(lang, 'لا توجد رسائل بعد. ابدأ النقاش مع طلابك.', 'Aucun message.')}
                      </p>
                    ) : (
                      [...messagesList].reverse().map((m) => (
                        <div key={m.id} className="p-2.5 rounded bg-white border border-[#e3e7ea]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-[#384D55] inline-flex items-center gap-1">
                              {m.sender_name}
                              <VerifiedBadge verified={m.sender_verified} size="xs" />
                            </span>
                            <span className="text-[10px] text-[#6b787e]" dir="ltr">
                              {new Date(m.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-[#384D55] mt-1 whitespace-pre-line">{m.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <form onSubmit={handleSendChat} className="flex gap-2">
                    <input
                      type="text"
                      className="template-input"
                      placeholder={isAr ? 'اكتب رسالة أو توجيهاً للطلاب...' : 'Écrire un message...'}
                      value={chatText}
                      onChange={(e) => setChatText(e.target.value)}
                    />
                    <button type="submit" disabled={sendingChat || !chatText.trim()} className="imgsend2 shrink-0 text-xs">
                      <Send className="w-3.5 h-3.5" />
                      <span>{isAr ? 'إرسال' : 'Envoyer'}</span>
                    </button>
                  </form>
                </div>
              )}

              {/* Tab: Settings */}
              {workspaceTab === 'settings' && isOwner && (
                <form onSubmit={handleSaveSectionSettings} className="space-y-3 text-xs">
                  <div>
                    <label className="block font-bold mb-1">{tr(lang, 'خصوصية القسم', 'Visibilité')}</label>
                    <select
                      className="template-input"
                      value={editVis}
                      onChange={(e) => setEditVis(e.target.value as 'public' | 'private')}
                    >
                      <option value="public">{isAr ? 'عام — متاح بالرابط المباشر' : 'Public'}</option>
                      <option value="private">{isAr ? 'خاص — بالدعوة فقط' : 'Privé'}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold mb-1">{tr(lang, 'وصف القسم', 'Description')}</label>
                    <textarea
                      rows={3}
                      className="template-input"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                    />
                  </div>
                  <label className="inline-flex items-center gap-2 font-bold text-[#384D55] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editAllowInvites}
                      onChange={(e) => setEditAllowInvites(e.target.checked)}
                    />
                    <span>{tr(lang, 'السماح للطلاب بدعوة زملائهم', 'Autoriser les invitations par les étudiants')}</span>
                  </label>
                  <div>
                    <button type="submit" disabled={savingSettings} className="imgsend2 text-xs">
                      {savingSettings ? '...' : tr(lang, 'حفظ الإعدادات', 'Enregistrer')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
