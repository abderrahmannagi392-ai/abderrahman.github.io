import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Download,
  Heart,
  Lock,
  LogIn,
  MessageSquare,
  Send,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { useApp } from '../context/AppContext';
import type { SectionContentItem, SectionTestItem, TeacherSection } from '../types';
import { apiRequest, getAuthToken, resolveApiUrl } from '../utils/api';
import { tr } from '../utils/locale';

export const PublicSectionPage: React.FC = () => {
  const { lang, user, viewParams, goToAuth, navigate } = useApp();
  const isAr = lang === 'ar';
  const shareCode = (viewParams.shareCode || '').trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<(TeacherSection & { locked?: boolean }) | null>(null);
  const [myMembership, setMyMembership] = useState<{ id: number; status: string } | null>(null);
  const [content, setContent] = useState<SectionContentItem[]>([]);
  const [tests, setTests] = useState<SectionTestItem[]>([]);
  const [fullTests, setFullTests] = useState<SectionTestItem[]>([]);
  const [messages, setMessages] = useState<Array<{ id: number; sender_name: string; sender_verified?: number; message: string; created_at: string }>>([]);

  // Test interactive state
  const [activeTestId, setActiveTestId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [testResult, setTestResult] = useState<{ score: number; maxScore: number } | null>(null);
  const [submittingTest, setSubmittingTest] = useState(false);

  // Follow & Join & Invite
  const [busyAction, setBusyAction] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [isFollowingTeacher, setIsFollowingTeacher] = useState(false);
  const [inviteQuery, setInviteQuery] = useState('');
  const [chatText, setChatText] = useState('');

  const loadPublic = useCallback(async () => {
    if (!shareCode) {
      setError(tr(lang, 'رابط القسم غير مكتمل.', 'Lien de section incomplet.', 'Incomplete section link.'));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{
        section: TeacherSection & { locked?: boolean };
        myMembership: { id: number; status: string } | null;
        content?: SectionContentItem[];
        tests?: SectionTestItem[];
      }>(`/api/sections/public/${encodeURIComponent(shareCode)}`);
      setSection(res.section);
      setMyMembership(res.myMembership || null);
      setContent(res.content || []);
      setTests(res.tests || []);

      if (user && res.section?.id && (!res.section.locked || res.myMembership?.status === 'active')) {
        const detail = await apiRequest<{
          tests: SectionTestItem[];
          messages: Array<{ id: number; sender_name: string; sender_verified?: number; message: string; created_at: string }>;
        }>(`/api/sections/${res.section.id}/detail`).catch(() => null);
        if (detail) {
          setFullTests(detail.tests || []);
          setMessages(detail.messages || []);
        }
        const follows = await apiRequest<{ users: Array<{ id: number }> }>('/api/follows/mine').catch(() => ({ users: [] }));
        setIsFollowingTeacher(follows.users.some((u) => u.id === res.section.teacher_user_id));
      }
    } catch (err: any) {
      setError(err?.message || tr(lang, 'تعذر العثور على هذا القسم.', 'Section introuvable.', 'Section not found.'));
    } finally {
      setLoading(false);
    }
  }, [shareCode, user, lang]);

  useEffect(() => {
    void loadPublic();
  }, [loadPublic]);

  const handleJoin = async () => {
    if (!user) {
      goToAuth('login');
      return;
    }
    if (!section) return;
    setBusyAction(true);
    setActionMsg(null);
    try {
      await apiRequest(`/api/sections/${section.id}/join`, {
        method: 'POST',
        json: { shareCode },
      });
      await loadPublic();
      setActionMsg(tr(lang, 'تم انضمامك إلى القسم بنجاح!', 'Vous avez rejoint la section !', 'Joined section successfully!'));
    } catch (err: any) {
      setActionMsg(err?.message || 'تعذر الانضمام.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleLeave = async () => {
    if (!section) return;
    setBusyAction(true);
    try {
      await apiRequest(`/api/sections/${section.id}/leave`, { method: 'POST' });
      await loadPublic();
    } finally {
      setBusyAction(false);
    }
  };

  const handleToggleFollow = async () => {
    if (!user) {
      goToAuth('login');
      return;
    }
    if (!section?.teacher_user_id) return;
    const res = await apiRequest<{ ok: boolean; following: boolean }>('/api/follows/toggle', {
      method: 'POST',
      json: { targetType: 'user', targetId: section.teacher_user_id },
    }).catch(() => null);
    if (res) setIsFollowingTeacher(res.following);
  };

  const handleSubmitTest = async (testId: number) => {
    if (!user) {
      goToAuth('login');
      return;
    }
    setSubmittingTest(true);
    try {
      const res = await apiRequest<{ ok: boolean; score: number; maxScore: number }>(
        `/api/sections/tests/${testId}/submit`,
        {
          method: 'POST',
          json: { answers },
        }
      );
      setTestResult({ score: res.score, maxScore: res.maxScore });
      await loadPublic();
    } catch (err: any) {
      setActionMsg(err?.message || 'تعذر تسليم الاختبار.');
    } finally {
      setSubmittingTest(false);
    }
  };

  const handleInvitePeer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!section || !inviteQuery.trim()) return;
    try {
      await apiRequest(`/api/teacher/sections/${section.id}/invite`, {
        method: 'POST',
        json: { query: inviteQuery.trim() },
      });
      setInviteQuery('');
      setActionMsg(tr(lang, 'تم إرسال دعوة الزميل بنجاح.', 'Invitation envoyée.', 'Peer invited.'));
    } catch (err: any) {
      setActionMsg(err?.message || 'تعذر إرسال الدعوة.');
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!section || !chatText.trim()) return;
    await apiRequest(`/api/sections/${section.id}/messages`, {
      method: 'POST',
      json: { message: chatText.trim() },
    });
    setChatText('');
    await loadPublic();
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
      setActionMsg(tr(lang, 'يرجى تسجيل الدخول والانضمام للقسم لتنزيل الملفات المحمية.', 'Connexion requise pour télécharger.', 'Sign in to download section files.'));
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-sm text-[#6b787e]">
        {tr(lang, 'جارٍ تحميل القسم...', 'Chargement de la section...', 'Loading section...')}
      </div>
    );
  }

  if (error || !section) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="addressp-box-white text-center space-y-3">
          <p className="text-sm font-bold text-red-700">{error}</p>
          <button type="button" onClick={() => navigate('home')} className="imgsend2 text-xs">
            {tr(lang, 'العودة للرئيسية', 'Accueil', 'Home')}
          </button>
        </div>
      </div>
    );
  }

  const testsToRender = fullTests.length > 0 ? fullTests : tests;
  const activeTest = testsToRender.find((t) => t.id === activeTestId);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="addressp-box-white space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-extrabold text-[#384D55]">{section.name}</h1>
              <span className="px-2 py-0.5 rounded bg-[#e2efbf] text-[#2c4a12] text-[11px] font-bold">
                {section.share_code}
              </span>
            </div>
            <div className="text-xs text-[#6b787e] mt-1 flex flex-wrap items-center gap-2">
              <span className="font-bold text-[#384D55] inline-flex items-center gap-1">
                {section.teacher_name}
                <VerifiedBadge verified={section.teacher_verified} size="xs" />
              </span>
              {section.subject_name && <span>· {section.subject_name}</span>}
              {section.school_name && <span>· {section.school_name}</span>}
              <span className="inline-flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {section.members_count ?? 0}
              </span>
            </div>
            {section.description && <p className="text-xs text-[#4a5c64] mt-2">{section.description}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {section.teacher_user_id !== user?.id && (
              <button type="button" onClick={() => void handleToggleFollow()} className="imgsend2-secondary text-xs">
                <Heart className={`w-3.5 h-3.5 ${isFollowingTeacher ? 'fill-red-500 text-red-500' : ''}`} />
                <span>{isFollowingTeacher ? (isAr ? 'متابع للمعلم' : 'Suivi') : isAr ? 'متابعة المعلم' : 'Suivre'}</span>
              </button>
            )}

            {!user ? (
              <button type="button" onClick={() => goToAuth('login')} className="imgsend2 text-xs">
                <LogIn className="w-3.5 h-3.5" />
                <span>{tr(lang, 'سجل الدخول للانضمام', 'Se connecter pour rejoindre')}</span>
              </button>
            ) : myMembership?.status === 'active' ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-[#e2efbf] text-[#2c4a12] text-xs font-bold">
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>{tr(lang, 'عضو في القسم', 'Membre actif')}</span>
                </span>
                {section.teacher_user_id !== user.id && (
                  <button type="button" disabled={busyAction} onClick={() => void handleLeave()} className="imgsend2-secondary text-xs">
                    {tr(lang, 'مغادرة', 'Quitter')}
                  </button>
                )}
              </div>
            ) : (
              <button type="button" disabled={busyAction} onClick={() => void handleJoin()} className="imgsend2 text-xs">
                <UserPlus className="w-3.5 h-3.5" />
                <span>{tr(lang, 'انضم إلى القسم', 'Rejoindre la section')}</span>
              </button>
            )}
          </div>
        </div>

        {actionMsg && (
          <div className="p-2.5 rounded bg-[#f4faea] border border-[#A6CE39] text-xs font-bold text-[#384D55]">
            {actionMsg}
          </div>
        )}
      </div>

      {section.locked ? (
        <div className="addressp-box-white text-center py-10 space-y-3">
          <Lock className="w-10 h-10 text-amber-600 mx-auto" />
          <h2 className="text-base font-extrabold text-[#384D55]">
            {tr(lang, 'هذا القسم خاص بأعضاء المعلم فقط', 'Section privée')}
          </h2>
          <p className="text-xs text-[#6b787e]">
            {tr(
              lang,
              'سجل الدخول أو افتح القسم عبر دعوة المعلم المباشرة للوصول إلى الدروس والاختبارات.',
              'Connectez-vous ou utilisez le lien d’invitation de l’enseignant.'
            )}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          {/* Lessons & Files */}
          <div className="lg:col-span-2 space-y-4">
            <div className="addressp-box-white space-y-3">
              <h2 className="text-sm font-extrabold text-[#384D55] flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-[#83a329]" />
                <span>{tr(lang, 'الدروس والشروحات والمرفقات', 'Cours et ressources')} ({content.length})</span>
              </h2>
              {content.length === 0 ? (
                <p className="text-xs text-[#6b787e]">{tr(lang, 'لا يوجد محتوى منشور بعد.', 'Aucun contenu.')}</p>
              ) : (
                <div className="space-y-2.5">
                  {content.map((item) => (
                    <div key={item.id} className="p-3 rounded-[4px] border border-[#d8dfe2] bg-[#f7f9fa] space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold text-[#384D55]">{item.title}</span>
                        <span className="px-2 py-0.5 rounded bg-white border border-[#d8dfe2] text-[10px] font-bold">
                          {item.content_type}
                        </span>
                      </div>
                      {item.body && <p className="text-[#4a5c64] whitespace-pre-line leading-relaxed">{item.body}</p>}
                      {item.file_id && (
                        <button
                          type="button"
                          onClick={() => void openProtectedFile(item.file_id!)}
                          className="inline-flex items-center gap-1 text-[#557a16] font-bold hover:underline cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>{tr(lang, 'تنزيل المرفق', 'Télécharger')}</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Interactive Section Tests */}
            <div className="addressp-box-white space-y-3">
              <h2 className="text-sm font-extrabold text-[#384D55] flex items-center gap-1.5">
                <ClipboardList className="w-4 h-4 text-[#83a329]" />
                <span>{tr(lang, 'اختبارات القسم التفاعلية', 'Tests de la section')} ({testsToRender.length})</span>
              </h2>

              {activeTest && activeTest.questions ? (
                <div className="space-y-3 border border-[#A6CE39] rounded-[4px] p-3.5 bg-[#f9fcf2] text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-[#384D55]">{activeTest.title}</span>
                    <button type="button" onClick={() => setActiveTestId(null)} className="underline text-[#6b787e] cursor-pointer">
                      {tr(lang, 'إغلاق', 'Fermer')}
                    </button>
                  </div>
                  {testResult && (
                    <div className="p-2.5 rounded bg-[#e2efbf] text-[#2c4a12] font-extrabold">
                      {tr(lang, `نتيجتك: ${testResult.score} / ${testResult.maxScore}`, `Score : ${testResult.score} / ${testResult.maxScore}`)}
                    </div>
                  )}
                  {activeTest.questions.map((q, idx) => (
                    <div key={q.id} className="p-2.5 rounded bg-white border border-[#d8dfe2] space-y-2">
                      <div className="font-bold text-[#384D55]">
                        {idx + 1}. {q.stem}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {q.options.map((opt, oIdx) => (
                          <label
                            key={oIdx}
                            className={`flex items-center gap-2 p-2 rounded border cursor-pointer ${
                              answers[String(q.id)] === oIdx
                                ? 'bg-[#e2efbf] border-[#83a329] font-bold'
                                : 'bg-[#f7f9fa] border-[#d8dfe2]'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`tq-${q.id}`}
                              checked={answers[String(q.id)] === oIdx}
                              onChange={() => setAnswers((prev) => ({ ...prev, [String(q.id)]: oIdx }))}
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={submittingTest}
                    onClick={() => void handleSubmitTest(activeTest.id)}
                    className="imgsend2 text-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{submittingTest ? '...' : tr(lang, 'تسليم وحساب الدرجة', 'Soumettre le test')}</span>
                  </button>
                </div>
              ) : testsToRender.length === 0 ? (
                <p className="text-xs text-[#6b787e]">{tr(lang, 'لا توجد اختبارات منشورة حالياً.', 'Aucun test publié.')}</p>
              ) : (
                <div className="space-y-2">
                  {testsToRender.map((tst) => (
                    <div key={tst.id} className="p-3 rounded-[4px] border border-[#d8dfe2] bg-[#f7f9fa] flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div>
                        <div className="font-bold text-[#384D55]">{tst.title}</div>
                        <div className="text-[11px] text-[#6b787e]">
                          {tst.duration_minutes} {isAr ? 'د' : 'min'} · {tst.max_score} {isAr ? 'نقطة' : 'pts'}
                          {tst.mySubmission && (
                            <span className="text-[#557a16] font-bold ms-2">
                              ({isAr ? 'النتيجة:' : 'Note :'} {tst.mySubmission.score}/{tst.mySubmission.max_score})
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!user) {
                            goToAuth('login');
                            return;
                          }
                          setTestResult(null);
                          setAnswers({});
                          setActiveTestId(tst.id);
                        }}
                        className="imgsend2 !py-1 !px-3 text-xs"
                      >
                        {tr(lang, 'بدء الاختبار', 'Passer le test')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Chat + Peer Invite */}
          <div className="space-y-4">
            {Boolean(section.allow_student_invites) && myMembership?.status === 'active' && (
              <form onSubmit={handleInvitePeer} className="addressp-box-white space-y-2.5 text-xs">
                <div className="font-extrabold text-[#384D55]">{tr(lang, 'دعوة زميل للقسم', 'Inviter un pair')}</div>
                <input
                  type="text"
                  dir="ltr"
                  className="template-input"
                  placeholder={isAr ? 'البريد الإلكتروني أو الهاتف' : 'Email ou téléphone'}
                  value={inviteQuery}
                  onChange={(e) => setInviteQuery(e.target.value)}
                />
                <button type="submit" className="imgsend2 w-full text-xs">
                  {tr(lang, 'إرسال دعوة', 'Inviter')}
                </button>
              </form>
            )}

            <div className="addressp-box-white space-y-3 text-xs">
              <div className="font-extrabold text-[#384D55] flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-[#83a329]" />
                <span>{tr(lang, 'تواصل القسم', 'Discussion')}</span>
              </div>
              {!user || myMembership?.status !== 'active' ? (
                <p className="text-[#6b787e]">
                  {tr(lang, 'انضم إلى القسم للمشاركة في النقاش مع المعلم والطلاب.', 'Rejoignez la section pour discuter.')}
                </p>
              ) : (
                <>
                  <div className="max-h-60 overflow-y-auto space-y-1.5">
                    {[...messages].reverse().map((m) => (
                      <div key={m.id} className="p-2 rounded bg-[#f7f9fa] border border-[#d8dfe2]">
                        <div className="font-bold text-[#384D55] flex items-center gap-1">
                          <span>{m.sender_name}</span>
                          <VerifiedBadge verified={m.sender_verified} size="xs" />
                        </div>
                        <p className="text-[#4a5c64] mt-0.5">{m.message}</p>
                      </div>
                    ))}
                  </div>
                  <form onSubmit={handleSendChat} className="flex gap-1.5">
                    <input
                      type="text"
                      className="template-input"
                      placeholder={isAr ? 'رسالتك...' : 'Message...'}
                      value={chatText}
                      onChange={(e) => setChatText(e.target.value)}
                    />
                    <button type="submit" className="imgsend2 shrink-0 !px-3">
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
