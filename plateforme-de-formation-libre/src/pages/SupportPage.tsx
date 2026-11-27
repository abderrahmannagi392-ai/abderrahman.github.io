import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  HelpCircle,
  Lock,
  MailWarning,
  MessageSquare,
  PlusCircle,
  Send,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getT } from '../i18n/translations';
import {
  createSupportConversation,
  markConversationReadByRole,
  sendSupportChatMessage,
  subscribeConversationMessages,
  subscribeUserConversations,
} from '../lib/firestoreService';
import type { ChatConversation, ChatMessage } from '../types';

export const SupportPage: React.FC<{ isAboutMode?: boolean }> = ({ isAboutMode = false }) => {
  const {
    lang,
    user,
    firebaseUser,
    catalog,
    goToAuth,
    reloadVerificationStatus,
  } = useApp();
  const t = getT(lang);

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newSubject, setNewSubject] = useState('');
  const [newInitialMessage, setNewInitialMessage] = useState('');
  const [replyInput, setReplyInput] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const isVerifiedUser = Boolean(user && firebaseUser && firebaseUser.emailVerified);

  // Real-time conversations listener for verified user
  useEffect(() => {
    if (!isVerifiedUser || !user) {
      setConversations([]);
      setSelectedConvId(null);
      return;
    }
    const unsub = subscribeUserConversations(user.uid, (list) => {
      setConversations(list);
      setSelectedConvId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return list[0]?.id || null;
      });
    });
    return () => unsub();
  }, [isVerifiedUser, user?.uid]);

  const activeConv = conversations.find((c) => c.id === selectedConvId) || null;

  // Real-time messages listener for selected conversation
  useEffect(() => {
    if (!isVerifiedUser || !user || !activeConv) {
      setMessages([]);
      return;
    }
    const unsub = subscribeConversationMessages(activeConv.id, user.uid, false, (msgs) => {
      setMessages(msgs);
    });
    if (activeConv.unreadForUser > 0) {
      void markConversationReadByRole(activeConv.id, 'user');
    }
    return () => unsub();
  }, [isVerifiedUser, user?.uid, activeConv?.id, activeConv?.unreadForUser]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleStartConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isVerifiedUser || !user) return;
    if (!newInitialMessage.trim()) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      const convId = await createSupportConversation({
        uid: user.uid,
        userName: user.name,
        userEmail: user.email,
        subject: newSubject.trim() || (lang === 'ar' ? 'استفسار دعم فني' : 'Demande de support'),
        initialMessage: newInitialMessage.trim(),
      });
      setNewSubject('');
      setNewInitialMessage('');
      setCreatingNew(false);
      setSelectedConvId(convId);
      setStatusMsg({
        text:
          lang === 'ar'
            ? 'تم فتح المحادثة المباشرة وإرسال رسالتك إلى الإدارة.'
            : 'Conversation ouverte et message transmis à l’administration.',
        ok: true,
      });
    } catch (err: any) {
      setStatusMsg({ text: err?.message || 'Error starting chat', ok: false });
    } finally {
      setBusy(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isVerifiedUser || !user || !activeConv || !replyInput.trim()) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      const textToSend = replyInput.trim();
      setReplyInput('');
      await sendSupportChatMessage({
        conversation: activeConv,
        senderUid: user.uid,
        senderName: user.name,
        senderRole: 'user',
        text: textToSend,
      });
    } catch (err: any) {
      setStatusMsg({ text: err?.message || 'Error sending message', ok: false });
    } finally {
      setBusy(false);
    }
  };

  const statusBadgeLabel = (st: ChatConversation['status']) => {
    if (st === 'open') return lang === 'ar' ? 'مفتوحة' : 'Ouverte';
    if (st === 'pending') return lang === 'ar' ? 'قيد المتابعة' : 'En attente';
    return lang === 'ar' ? 'مغلقة' : 'Fermée';
  };

  return (
    <div className="px-4 sm:px-6 py-6 space-y-5">
      <section className="addressp-box space-y-4">
        <span className="ltitle flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-[#557a16]" />
          <span>{isAboutMode ? t.navAbout : t.navSupport}</span>
        </span>
        <p className="text-xs sm:text-sm text-[#4a5c64] leading-relaxed">
          {lang === 'ar'
            ? 'منصة التدريب الحر – Plateforme de Formation Libre مؤسسة تعليمية رقمية متخصصة في إعداد المترشحين لمسابقات اكتتاب المعلمين في الجمهورية الإسلامية الموريتانية، عبر ثلاث شعب مستقلة (معلم عربي، معلم فرنسي، معلم مزدوج) تشمل 12 مادة رسمية مع دروس مكثفة، ملخصات صوتية، بنك أسئلة فريد بلا تكرار، ومحاكاة للامتحان الرسمي من 20 نقطة.'
            : 'Plateforme de Formation Libre est dédiée à la préparation officielle au concours de recrutement des instituteurs en Mauritanie, à travers trois filières (Arabe, Français, Bilingue), 12 matières officielles, lecture audio bilingue et simulation notée sur 20.'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {catalog.tracks.map((tr) => (
            <div key={tr.slug} className="bg-[#f4f6f7] border border-[#d8dfe2] rounded-[3px] p-3.5">
              <div className="font-extrabold text-[#384D55] mb-1">
                {lang === 'ar' ? tr.name_ar : tr.name_fr}
              </div>
              <p className="text-[#6b787e]">{lang === 'ar' ? tr.description_ar : tr.description_fr}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Real-time Support Chat + FAQ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <section className="lg:col-span-2 addressp-box space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="ltitle !mb-0 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#384D55]" />
              <span>
                {lang === 'ar' ? 'المحادثة المباشرة مع الإدارة' : 'Messagerie directe avec l’administration'}
              </span>
            </span>
            {isVerifiedUser && conversations.length > 0 && (
              <button
                type="button"
                onClick={() => setCreatingNew((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-[3px] bg-[#efefef] hover:bg-[#e2efbf] text-[#384D55] border border-[#cfd6da] cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>
                  {creatingNew
                    ? lang === 'ar'
                      ? 'العودة للمحادثة'
                      : 'Retour au chat'
                    : lang === 'ar'
                      ? 'محادثة جديدة'
                      : 'Nouvelle conversation'}
                </span>
              </button>
            )}
          </div>

          {statusMsg && (
            <div
              className={`p-3 rounded-[3px] border text-xs font-bold ${
                statusMsg.ok
                  ? 'bg-[#e2efbf] border-[#A6CE39] text-[#384D55]'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              {statusMsg.text}
            </div>
          )}

          {!user ? (
            <div className="bg-[#f4f6f7] border border-[#d8dfe2] rounded-[3px] p-6 text-center space-y-3 text-xs">
              <Lock className="w-8 h-8 text-[#384D55] mx-auto" />
              <p className="font-bold text-[#384D55]">
                {lang === 'ar'
                  ? 'الدعم المباشر مخصص للمشتركين المسجلين. سجّل الدخول لبدء محادثة فورية مع الإدارة.'
                  : 'La messagerie directe est réservée aux membres connectés.'}
              </p>
              <div className="flex justify-center gap-2">
                <button type="button" onClick={() => goToAuth('login')} className="imgsend2 text-xs">
                  {t.login}
                </button>
                <button type="button" onClick={() => goToAuth('register')} className="imgsend2-secondary text-xs">
                  {t.register}
                </button>
              </div>
            </div>
          ) : !isVerifiedUser ? (
            <div className="bg-[#fff8e6] border border-[#e8cf86] rounded-[3px] p-5 text-center space-y-3 text-xs text-[#544006]">
              <MailWarning className="w-8 h-8 text-[#9a7209] mx-auto" />
              <p className="font-bold">
                {lang === 'ar'
                  ? 'يرجى تأكيد بريدك الإلكتروني أولاً قبل إرسال الرسائل في الدعم المباشر.'
                  : 'Veuillez vérifier votre e-mail avant d’ouvrir une conversation de support.'}
              </p>
              <button
                type="button"
                onClick={() => void reloadVerificationStatus()}
                className="imgsend2 text-xs"
              >
                {lang === 'ar' ? 'تحقق الآن من التفعيل' : 'Vérifier maintenant'}
              </button>
            </div>
          ) : creatingNew || conversations.length === 0 ? (
            <form onSubmit={handleStartConversation} className="space-y-3 text-xs sm:text-sm">
              <input
                type="text"
                required
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder={lang === 'ar' ? 'موضوع المحادثة أو الاستفسار' : 'Sujet de votre demande'}
                className="template-input"
              />
              <textarea
                required
                rows={4}
                value={newInitialMessage}
                onChange={(e) => setNewInitialMessage(e.target.value)}
                placeholder={
                  lang === 'ar'
                    ? 'اكتب رسالتك هنا وسيتواصل معك المدير مباشرة في الوقت الفعلي...'
                    : 'Écrivez votre message ici...'
                }
                className="w-full border border-[#c9d0d3] bg-white rounded-[4px] p-2.5 text-xs sm:text-sm outline-none focus:border-[#A6CE39]"
              />
              <button type="submit" disabled={busy} className="imgsend2 text-xs">
                <Send className="w-3.5 h-3.5" />
                <span>{busy ? t.loading : lang === 'ar' ? 'بدء المحادثة الفورية' : 'Démarrer le chat'}</span>
              </button>
            </form>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Conversations List */}
              <div className="md:col-span-1 border border-[#d8dfe2] rounded-[3px] bg-[#f7f9fa] divide-y divide-[#e2e7ea] max-h-[380px] overflow-y-auto">
                {conversations.map((conv) => (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => setSelectedConvId(conv.id)}
                    className={`w-full text-start p-2.5 text-xs cursor-pointer transition-colors ${
                      conv.id === activeConv?.id ? 'bg-[#e2efbf]' : 'hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 font-bold text-[#384D55]">
                      <span className="truncate">{conv.subject}</span>
                      {conv.unreadForUser > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-[#384D55] text-[#A6CE39] text-[10px]">
                          {conv.unreadForUser}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#6b787e] truncate mt-0.5">
                      {conv.lastMessagePreview}
                    </div>
                    <div className="text-[10px] text-[#557a16] font-bold mt-1">
                      {statusBadgeLabel(conv.status)}
                    </div>
                  </button>
                ))}
              </div>

              {/* Active Conversation Thread */}
              <div className="md:col-span-2 border border-[#d8dfe2] rounded-[3px] bg-white flex flex-col h-[380px]">
                {activeConv ? (
                  <>
                    <div className="px-3 py-2 bg-[#f4f6f7] border-b border-[#d8dfe2] flex items-center justify-between text-xs">
                      <span className="font-extrabold text-[#384D55] truncate">{activeConv.subject}</span>
                      <span className="px-2 py-0.5 rounded-[3px] bg-white border border-[#cfd6da] text-[11px] font-bold text-[#384D55]">
                        {statusBadgeLabel(activeConv.status)}
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2.5 text-xs">
                      {messages.map((m) => {
                        const isMine = m.senderRole === 'user';
                        return (
                          <div
                            key={m.id}
                            className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                          >
                            <div
                              className={`max-w-[85%] px-3 py-2 rounded-[4px] border ${
                                isMine
                                  ? 'bg-[#e2efbf] border-[#A6CE39] text-[#384D55]'
                                  : 'bg-[#f4f6f7] border-[#d8dfe2] text-[#384D55]'
                              }`}
                            >
                              <div className="text-[10px] font-bold opacity-75 mb-0.5">
                                {isMine
                                  ? m.senderName
                                  : lang === 'ar'
                                    ? 'الإدارة'
                                    : 'Administration'}
                              </div>
                              <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={chatEndRef} />
                    </div>

                    {activeConv.status === 'closed' ? (
                      <div className="p-2.5 bg-[#f7f9fa] border-t border-[#d8dfe2] text-center text-xs text-[#6b787e]">
                        {lang === 'ar'
                          ? 'هذه المحادثة مغلقة حالياً. يمكنك فتح محادثة جديدة أو إرسال رد لإعادة فتحها.'
                          : 'Cette conversation est fermée.'}
                      </div>
                    ) : null}

                    <form
                      onSubmit={handleSendReply}
                      className="p-2 border-t border-[#d8dfe2] flex items-center gap-2 bg-[#f9fafb]"
                    >
                      <input
                        type="text"
                        value={replyInput}
                        onChange={(e) => setReplyInput(e.target.value)}
                        placeholder={
                          lang === 'ar' ? 'اكتب رسالتك هنا...' : 'Écrivez votre réponse...'
                        }
                        className="template-input flex-1"
                      />
                      <button type="submit" disabled={busy || !replyInput.trim()} className="imgsend2 !py-2 !px-3.5 text-xs">
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  </>
                ) : null}
              </div>
            </div>
          )}
        </section>

        {/* FAQ Sidebar */}
        <section className="addressp-box space-y-3">
          <span className="ltitle flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-[#384D55]" />
            <span>{lang === 'ar' ? 'الأسئلة الشائعة' : 'Questions fréquentes'}</span>
          </span>

          <div className="space-y-2.5 text-xs">
            <div className="bg-[#f4f6f7] p-3 border border-[#d8dfe2] rounded-[3px]">
              <div className="font-bold text-[#384D55]">
                {lang === 'ar' ? 'كيف تحسب العلامة النهائية؟' : 'Comment est calculée la note ?'}
              </div>
              <p className="text-[#6b787e] mt-1">
                {lang === 'ar'
                  ? 'تُحسب العلامة آلياً من 20 نقطة فور تسليم الامتحان مع تفصيل الدقة لكل محور.'
                  : 'La note est calculée automatiquement sur 20 dès la soumission avec détail par thème.'}
              </p>
            </div>
            <div className="bg-[#f4f6f7] p-3 border border-[#d8dfe2] rounded-[3px]">
              <div className="font-bold text-[#384D55]">
                {lang === 'ar' ? 'هل يوجد تكرار في بنك الأسئلة؟' : 'Y a-t-il des doublons dans la banque ?'}
              </div>
              <p className="text-[#6b787e] mt-1">
                {lang === 'ar'
                  ? 'لا؛ يمنع النظام إدراج أي سؤال مكرر أو معاد الصياغة عبر بصمة تحقق تلقائية.'
                  : "Non ; une empreinte d'unicité bloque toute question dupliquée lors de l'ajout ou l'import."}
              </p>
            </div>
            <div className="bg-[#f4f6f7] p-3 border border-[#d8dfe2] rounded-[3px]">
              <div className="font-bold text-[#384D55]">
                {lang === 'ar' ? 'ما وسائل الدفع المقبولة؟' : 'Moyens de paiement acceptés ?'}
              </div>
              <p className="text-[#6b787e] mt-1">
                {lang === 'ar'
                  ? 'تقبل المنصة بطاقات الدفع العالمية Visa وMastercard، بالإضافة إلى نظام التحويل المحلي الموريتاني المستقل عبر السداد ومصرفي وبنكيلي.'
                  : 'Cartes internationales Visa et Mastercard, ainsi que les paiements locaux mauritaniens via Sedad, Masrvi et Bankily.'}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
