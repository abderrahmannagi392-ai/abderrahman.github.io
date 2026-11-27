import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  MessageCircle,
  Plus,
  Send,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { triggerHaptic } from '../../hooks/useMobilePlatform';
import {
  createSupportConversation,
  markConversationReadByRole,
  sendSupportChatMessage,
  subscribeConversationMessages,
  subscribeUserConversations,
} from '../../lib/firestoreService';
import type {
  ChatConversation,
  ChatMessage,
  EducatorCard,
  SectionContentItem,
  SectionTestItem,
  StudentInstitutionalSummary,
  TeacherSection,
} from '../../types';
import { apiRequest } from '../../utils/api';
import { tr } from '../../utils/locale';
import { MobileListRow, MobileSkeletonList } from './MobilePrimitives';

type ChatSubTab = 'sections' | 'support';

export const MobileChatsView: React.FC = () => {
  const { lang, user, firebaseUser } = useApp();
  const isAr = lang === 'ar';

  const [subTab, setSubTab] = useState<ChatSubTab>('sections');

  // Sections state
  const [summary, setSummary] = useState<StudentInstitutionalSummary | null>(null);
  const [educators, setEducators] = useState<EducatorCard[]>([]);
  const [loadingSections, setLoadingSections] = useState(true);
  const [followingIds, setFollowingIds] = useState<Set<number>>(new Set());
  const [joinCode, setJoinCode] = useState('');
  const [joinMsg, setJoinMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Active Section Detail
  const [activeSection, setActiveSection] = useState<TeacherSection | null>(null);
  const [secContent, setSecContent] = useState<SectionContentItem[]>([]);
  const [secTests, setSecTests] = useState<SectionTestItem[]>([]);
  const [secMessages, setSecMessages] = useState<
    Array<{ id: number; sender_name: string; message: string; created_at: string }>
  >([]);
  const [secChatInput, setSecChatInput] = useState('');
  const [activeTest, setActiveTest] = useState<SectionTestItem | null>(null);
  const [testAnswers, setTestAnswers] = useState<Record<string, number>>({});

  // Support Chat state
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [supportMessages, setSupportMessages] = useState<ChatMessage[]>([]);
  const [creatingConv, setCreatingConv] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [replyInput, setReplyInput] = useState('');

  const isVerified = Boolean(user && firebaseUser && (firebaseUser.emailVerified || user.email_verified));

  const loadInstitutional = useCallback(async () => {
    setLoadingSections(true);
    try {
      const [instRes, eduRes, folRes] = await Promise.all([
        apiRequest<StudentInstitutionalSummary>('/api/student/institutional-summary').catch(() => null),
        apiRequest<{ educators?: EducatorCard[] }>('/api/educators').catch(() => ({ educators: [] })),
        apiRequest<{ followedUsers?: Array<{ id: number }> }>('/api/follows/mine').catch(() => ({
          followedUsers: [],
        })),
      ]);
      if (instRes) setSummary(instRes);
      if (Array.isArray(eduRes?.educators)) setEducators(eduRes.educators);
      if (Array.isArray(folRes?.followedUsers)) {
        setFollowingIds(new Set(folRes.followedUsers.map((u) => Number(u.id))));
      }
    } finally {
      setLoadingSections(false);
    }
  }, []);

  useEffect(() => {
    void loadInstitutional();
  }, [loadInstitutional, user?.uid]);

  // Support conversations realtime listener
  useEffect(() => {
    if (!isVerified || !user) return;
    const unsub = subscribeUserConversations(user.uid, (list) => {
      setConversations(list);
      setSelectedConvId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return list[0]?.id || null;
      });
    });
    return () => unsub();
  }, [isVerified, user?.uid]);

  const activeConv = conversations.find((c) => c.id === selectedConvId) || null;

  useEffect(() => {
    if (!isVerified || !user || !activeConv) {
      setSupportMessages([]);
      return;
    }
    const unsub = subscribeConversationMessages(activeConv.id, user.uid, false, (msgs) => {
      setSupportMessages(msgs);
    });
    if (activeConv.unreadForUser > 0) {
      void markConversationReadByRole(activeConv.id, 'user');
    }
    return () => unsub();
  }, [isVerified, user?.uid, activeConv?.id, activeConv?.unreadForUser]);

  const openSectionDetail = async (sec: TeacherSection) => {
    setBusy(true);
    setActiveSection(sec);
    setActiveTest(null);
    try {
      const detail = await apiRequest<{
        content?: SectionContentItem[];
        tests?: SectionTestItem[];
        messages?: Array<{ id: number; sender_name: string; message: string; created_at: string }>;
      }>(`/api/sections/${sec.id}/detail`);
      setSecContent(detail.content || []);
      setSecTests(detail.tests || []);
      setSecMessages(detail.messages || []);
    } finally {
      setBusy(false);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim();
    if (!code) return;
    setBusy(true);
    setJoinMsg(null);
    try {
      const pub = await apiRequest<{ section: TeacherSection }>(
        `/api/sections/public/${encodeURIComponent(code)}`
      );
      await apiRequest(`/api/sections/${pub.section.id}/join`, {
        method: 'POST',
        json: { shareCode: code },
      });
      triggerHaptic(10);
      setJoinCode('');
      setJoinMsg(tr(lang, 'تم الانضمام إلى القسم بنجاح!', 'Vous avez rejoint la section !', 'Joined section!'));
      await loadInstitutional();
    } catch (err: any) {
      setJoinMsg(err?.message || tr(lang, 'تعذر العثور على القسم أو الانضمام إليه.', 'Section introuvable.', 'Failed to join.'));
    } finally {
      setBusy(false);
    }
  };

  const handleSendSectionMsg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSection || !secChatInput.trim()) return;
    triggerHaptic(8);
    const text = secChatInput.trim();
    setSecChatInput('');
    await apiRequest(`/api/sections/${activeSection.id}/messages`, {
      method: 'POST',
      json: { message: text },
    });
    await openSectionDetail(activeSection);
  };

  const handleSubmitSectionTest = async (testId: number) => {
    setBusy(true);
    try {
      await apiRequest(`/api/sections/tests/${testId}/submit`, {
        method: 'POST',
        json: { answers: testAnswers },
      });
      triggerHaptic(12);
      setActiveTest(null);
      if (activeSection) await openSectionDetail(activeSection);
    } finally {
      setBusy(false);
    }
  };

  // Active Section Detail View
  if (activeSection) {
    return (
      <div className="space-y-4">
        <div className="tdr-m-hero-card space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="tdr-m-brand-pill">{activeSection.teacher_name || 'أستاذ'}</span>
            <button
              type="button"
              onClick={() => setActiveSection(null)}
              className="min-h-[36px] px-3 rounded-xl text-xs font-extrabold cursor-pointer"
              style={{ background: '#ffffff', color: '#1c2a0e' }}
            >
              {tr(lang, 'كل الأقسام', 'Sections', 'All Sections')}
            </button>
          </div>
          <h2 className="text-lg font-extrabold tdr-m-kufi">{activeSection.title || activeSection.name}</h2>
          {activeSection.description && (
            <p className="text-xs opacity-90">{activeSection.description}</p>
          )}
        </div>

        {/* Active Test Runner inside Section */}
        {activeTest && (
          <div className="tdr-m-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold tdr-m-kufi">{activeTest.title}</h3>
              <button
                type="button"
                onClick={() => setActiveTest(null)}
                className="text-xs font-bold cursor-pointer"
                style={{ color: 'var(--m-muted)' }}
              >
                {tr(lang, 'إلغاء', 'Annuler', 'Cancel')}
              </button>
            </div>
            {activeTest.questions.map((q, qIdx) => (
              <div key={qIdx} className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--m-border)' }}>
                <div className="text-xs font-extrabold">
                  {qIdx + 1}. {q.stem}
                </div>
                <div className="space-y-1.5">
                  {q.options.map((opt, oIdx) => (
                    <button
                      key={oIdx}
                      type="button"
                      onClick={() => setTestAnswers((p) => ({ ...p, [String(qIdx)]: oIdx }))}
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl text-start text-xs font-bold border cursor-pointer"
                      style={
                        testAnswers[String(qIdx)] === oIdx
                          ? { background: 'var(--m-brand)', color: 'var(--m-btn-ink)', borderColor: 'var(--m-brand-d)' }
                          : { background: 'var(--m-surface-muted)', color: 'var(--m-ink)', borderColor: 'var(--m-border)' }
                      }
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSubmitSectionTest(activeTest.id)}
              className="tdr-m-btn-primary"
            >
              {tr(lang, 'تسليم الاختبار', 'Soumettre', 'Submit Test')}
            </button>
          </div>
        )}

        {/* Section Content */}
        {secContent.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-extrabold tdr-m-kufi px-1">
              {tr(lang, 'محتوى القسم', 'Contenu de la section', 'Section Content')}
            </h3>
            {secContent.map((item) => (
              <div key={item.id} className="tdr-m-card p-3.5 space-y-1 tdr-m-selectable">
                <div className="text-sm font-extrabold">{item.title}</div>
                {item.body && (
                  <p className="text-xs leading-relaxed whitespace-pre-line" style={{ color: 'var(--m-ink-sub)' }}>
                    {item.body}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Section Tests */}
        {secTests.length > 0 && !activeTest && (
          <div className="space-y-2">
            <h3 className="text-sm font-extrabold tdr-m-kufi px-1">
              {tr(lang, 'اختبارات القسم', 'Tests de la section', 'Section Tests')}
            </h3>
            {secTests.map((tItem) => (
              <MobileListRow
                key={tItem.id}
                dir={isAr ? 'rtl' : 'ltr'}
                icon={<ClipboardList className="w-5 h-5" />}
                title={tItem.title}
                subtitle={
                  tItem.mySubmission
                    ? tr(
                        lang,
                        `النتيجة: ${tItem.mySubmission.score} / ${tItem.mySubmission.max_score}`,
                        `Score : ${tItem.mySubmission.score} / ${tItem.mySubmission.max_score}`,
                        `Score: ${tItem.mySubmission.score}/${tItem.mySubmission.max_score}`
                      )
                    : `${tItem.questions.length} ${tr(lang, 'سؤال', 'questions', 'questions')}`
                }
                onClick={
                  tItem.mySubmission
                    ? undefined
                    : () => {
                        setTestAnswers({});
                        setActiveTest(tItem);
                      }
                }
              />
            ))}
          </div>
        )}

        {/* Section Messages / Discussion */}
        <div className="tdr-m-card p-4 space-y-3">
          <h3 className="text-sm font-extrabold tdr-m-kufi">
            {tr(lang, 'نقاش القسم', 'Discussion', 'Section Chat')}
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {secMessages.length === 0 ? (
              <p className="text-xs text-center py-3" style={{ color: 'var(--m-muted)' }}>
                {tr(lang, 'لا توجد رسائل بعد. ابدأ النقاش!', 'Aucun message.', 'No messages yet.')}
              </p>
            ) : (
              secMessages.map((m) => (
                <div
                  key={m.id}
                  className="p-2.5 rounded-xl text-xs"
                  style={{ background: 'var(--m-surface-muted)' }}
                >
                  <div className="font-extrabold" style={{ color: 'var(--m-brand-deep)' }}>
                    {m.sender_name}
                  </div>
                  <div className="mt-0.5 leading-relaxed">{m.message}</div>
                </div>
              ))
            )}
          </div>
          <form onSubmit={handleSendSectionMsg} className="flex items-center gap-2">
            <input
              type="text"
              value={secChatInput}
              onChange={(e) => setSecChatInput(e.target.value)}
              placeholder={tr(lang, 'اكتب رسالة للقسم...', 'Écrire un message...', 'Write a message...')}
              className="tdr-m-input flex-1"
            />
            <button
              type="submit"
              aria-label="Send"
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 cursor-pointer"
              style={{ background: 'var(--m-brand)', color: 'var(--m-btn-ink)', border: '1px solid var(--m-brand-d)' }}
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="tdr-m-card p-1.5 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => {
            triggerHaptic(6);
            setSubTab('sections');
          }}
          className="min-h-[44px] rounded-xl text-xs font-extrabold cursor-pointer"
          style={
            subTab === 'sections'
              ? { background: 'var(--m-brand)', color: 'var(--m-btn-ink)' }
              : { background: 'transparent', color: 'var(--m-ink-sub)' }
          }
        >
          {tr(lang, 'الأقسام والأساتذة', 'Sections & Profs', 'Sections')}
        </button>
        <button
          type="button"
          onClick={() => {
            triggerHaptic(6);
            setSubTab('support');
          }}
          className="min-h-[44px] rounded-xl text-xs font-extrabold cursor-pointer"
          style={
            subTab === 'support'
              ? { background: 'var(--m-brand)', color: 'var(--m-btn-ink)' }
              : { background: 'transparent', color: 'var(--m-ink-sub)' }
          }
        >
          {tr(lang, 'الدعم المباشر', 'Support en direct', 'Live Support')}
        </button>
      </div>

      {/* SECTIONS & EDUCATORS */}
      {subTab === 'sections' && (
        <div className="space-y-4">
          {/* Join by Share Code */}
          <form onSubmit={handleJoinByCode} className="tdr-m-card p-4 space-y-2.5">
            <label className="block text-xs font-extrabold">
              {tr(lang, 'الانضمام لقسم برمز الدعوة', 'Rejoindre une section par code', 'Join Section by Code')}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                dir="ltr"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="SEC-XXXXXX"
                className="tdr-m-input flex-1"
              />
              <button
                type="submit"
                disabled={busy}
                className="min-h-[46px] px-4 rounded-2xl text-xs font-extrabold shrink-0 cursor-pointer"
                style={{ background: 'var(--m-brand)', color: 'var(--m-btn-ink)', border: '1px solid var(--m-brand-d)' }}
              >
                {tr(lang, 'انضمام', 'Rejoindre', 'Join')}
              </button>
            </div>
            {joinMsg && (
              <div className="text-xs font-bold" style={{ color: 'var(--m-brand-deep)' }}>
                {joinMsg}
              </div>
            )}
          </form>

          {/* Pending Invitations */}
          {summary && summary.pendingInvitations.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold tdr-m-kufi px-1">
                {tr(lang, 'دعوات بانتظارك', 'Invitations en attente', 'Pending Invitations')}
              </h3>
              {summary.pendingInvitations.map((inv) => (
                <div key={inv.member_id} className="tdr-m-card p-4 space-y-2.5">
                  <div className="text-sm font-extrabold">{inv.title}</div>
                  <div className="text-xs" style={{ color: 'var(--m-muted)' }}>
                    {inv.teacher_name}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest(`/api/student/invitations/${inv.member_id}/respond`, {
                          method: 'POST',
                          json: { action: 'accept' },
                        });
                        await loadInstitutional();
                      }}
                      className="tdr-m-btn-primary"
                    >
                      {tr(lang, 'قبول', 'Accepter', 'Accept')}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest(`/api/student/invitations/${inv.member_id}/respond`, {
                          method: 'POST',
                          json: { action: 'decline' },
                        });
                        await loadInstitutional();
                      }}
                      className="tdr-m-btn-secondary"
                    >
                      {tr(lang, 'رفض', 'Refuser', 'Decline')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Joined Sections */}
          <div className="space-y-2">
            <h3 className="text-sm font-extrabold tdr-m-kufi px-1">
              {tr(lang, 'أقسامي النشطة', 'Mes sections', 'My Sections')}
            </h3>
            {loadingSections && !summary ? (
              <MobileSkeletonList count={2} />
            ) : !summary || summary.joinedSections.length === 0 ? (
              <div className="tdr-m-card p-5 text-center text-xs font-bold" style={{ color: 'var(--m-muted)' }}>
                {tr(
                  lang,
                  'لست منضماً لأي قسم تعليمي بعد.',
                  'Vous n’avez rejoint aucune section.',
                  'You have not joined any section yet.'
                )}
              </div>
            ) : (
              summary.joinedSections.map((sec) => (
                <MobileListRow
                  key={sec.id}
                  dir={isAr ? 'rtl' : 'ltr'}
                  icon={<Users className="w-5 h-5" />}
                  title={sec.title || sec.name || ''}
                  subtitle={`${sec.teacher_name || ''} • ${sec.subject_name || ''}`}
                  onClick={() => void openSectionDetail(sec)}
                />
              ))
            )}
          </div>

          {/* Educators */}
          {educators.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold tdr-m-kufi px-1">
                {tr(lang, 'الأساتذة والمعلمون', 'Enseignants', 'Educators')}
              </h3>
              {educators.slice(0, 6).map((edu) => {
                const isFol = followingIds.has(edu.id);
                return (
                  <MobileListRow
                    key={edu.id}
                    dir={isAr ? 'rtl' : 'ltr'}
                    icon={isFol ? <UserCheck className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                    title={edu.name}
                    subtitle={edu.professor_specialty || edu.teacher_category || edu.role}
                    trailing={
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await apiRequest<{ following: boolean }>('/api/follows/toggle', {
                            method: 'POST',
                            json: { targetType: 'user', targetId: edu.id },
                          }).catch(() => null);
                          if (res) {
                            triggerHaptic(8);
                            setFollowingIds((prev) => {
                              const next = new Set(prev);
                              if (res.following) next.add(edu.id);
                              else next.delete(edu.id);
                              return next;
                            });
                          }
                        }}
                        className="min-h-[36px] px-3 rounded-xl text-xs font-extrabold cursor-pointer"
                        style={
                          isFol
                            ? { background: 'var(--m-brand-soft)', color: 'var(--m-brand-deep)' }
                            : { background: 'var(--m-brand)', color: 'var(--m-btn-ink)' }
                        }
                      >
                        {isFol ? tr(lang, 'متابَع', 'Suivi', 'Following') : tr(lang, 'متابعة', 'Suivre', 'Follow')}
                      </button>
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* LIVE SUPPORT CHAT */}
      {subTab === 'support' && (
        <div className="space-y-4">
          {!isVerified ? (
            <div className="tdr-m-card p-6 text-center space-y-2">
              <MessageCircle className="w-8 h-8 mx-auto" style={{ color: 'var(--m-brand-d)' }} />
              <div className="text-sm font-extrabold tdr-m-kufi">
                {tr(lang, 'يرجى تأكيد بريدك الإلكتروني', 'Vérifiez votre e-mail', 'Verify Email First')}
              </div>
              <p className="text-xs" style={{ color: 'var(--m-muted)' }}>
                {tr(
                  lang,
                  'المحادثة المباشرة مع فريق الدعم متاحة بعد تفعيل البريد الإلكتروني.',
                  'Le support en direct est disponible après confirmation de l’e-mail.',
                  'Live support chat unlocks once your email is verified.'
                )}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-extrabold tdr-m-kufi">
                  {tr(lang, 'محادثات الدعم', 'Conversations support', 'Support Chats')}
                </h3>
                <button
                  type="button"
                  onClick={() => setCreatingConv((p) => !p)}
                  className="min-h-[38px] px-3 rounded-xl text-xs font-extrabold inline-flex items-center gap-1 cursor-pointer"
                  style={{ background: 'var(--m-brand)', color: 'var(--m-btn-ink)', border: '1px solid var(--m-brand-d)' }}
                >
                  <Plus className="w-4 h-4" />
                  <span>{tr(lang, 'محادثة جديدة', 'Nouveau', 'New')}</span>
                </button>
              </div>

              {creatingConv && user && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newMessage.trim()) return;
                    setBusy(true);
                    try {
                      const cid = await createSupportConversation({
                        uid: user.uid,
                        userName: user.name,
                        userEmail: user.email,
                        subject: newSubject.trim() || tr(lang, 'استفسار دعم', 'Support', 'Support'),
                        initialMessage: newMessage.trim(),
                      });
                      setNewSubject('');
                      setNewMessage('');
                      setCreatingConv(false);
                      setSelectedConvId(cid);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="tdr-m-card p-4 space-y-2.5"
                >
                  <input
                    type="text"
                    placeholder={tr(lang, 'عنوان الاستفسار', 'Sujet', 'Subject')}
                    className="tdr-m-input"
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                  />
                  <textarea
                    placeholder={tr(lang, 'اكتب رسالتك لفريق الدعم...', 'Votre message...', 'Your message...')}
                    className="tdr-m-textarea"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                  />
                  <button type="submit" disabled={busy} className="tdr-m-btn-primary">
                    {tr(lang, 'إرسال وفتح المحادثة', 'Envoyer', 'Send Message')}
                  </button>
                </form>
              )}

              {conversations.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto tdr-m-no-scrollbar">
                  {conversations.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedConvId(c.id)}
                      className="min-h-[38px] px-3.5 rounded-xl text-xs font-extrabold shrink-0 border cursor-pointer"
                      style={
                        c.id === activeConv?.id
                          ? { background: 'var(--m-brand)', color: 'var(--m-btn-ink)', borderColor: 'var(--m-brand-d)' }
                          : { background: 'var(--m-surface)', color: 'var(--m-ink)', borderColor: 'var(--m-border)' }
                      }
                    >
                      {c.subject}
                    </button>
                  ))}
                </div>
              )}

              {activeConv ? (
                <div className="tdr-m-card p-4 space-y-3">
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {supportMessages.map((m) => {
                      const mine = m.senderRole === 'user';
                      return (
                        <div
                          key={m.id}
                          className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className="max-w-[82%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed"
                            style={
                              mine
                                ? { background: 'var(--m-brand)', color: 'var(--m-btn-ink)' }
                                : { background: 'var(--m-surface-muted)', color: 'var(--m-ink)' }
                            }
                          >
                            <div className="font-bold opacity-80 text-[10px] mb-0.5">{m.senderName}</div>
                            <div>{m.text}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!replyInput.trim() || !user) return;
                      triggerHaptic(8);
                      const txt = replyInput.trim();
                      setReplyInput('');
                      await sendSupportChatMessage({
                        conversation: activeConv,
                        senderUid: user.uid,
                        senderName: user.name,
                        senderRole: 'user',
                        text: txt,
                      });
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={replyInput}
                      onChange={(e) => setReplyInput(e.target.value)}
                      placeholder={tr(lang, 'رد على المحادثة...', 'Répondre...', 'Reply...')}
                      className="tdr-m-input flex-1"
                    />
                    <button
                      type="submit"
                      aria-label="Send reply"
                      className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 cursor-pointer"
                      style={{ background: 'var(--m-brand)', color: 'var(--m-btn-ink)', border: '1px solid var(--m-brand-d)' }}
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              ) : (
                !creatingConv && (
                  <div className="tdr-m-card p-6 text-center space-y-2">
                    <CheckCircle2 className="w-8 h-8 mx-auto" style={{ color: 'var(--m-brand-d)' }} />
                    <p className="text-xs font-bold" style={{ color: 'var(--m-muted)' }}>
                      {tr(lang, 'اضغط «محادثة جديدة» للتواصل مع الدعم.', 'Cliquez sur Nouveau pour contacter le support.', 'Tap New to message support.')}
                    </p>
                  </div>
                )
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
