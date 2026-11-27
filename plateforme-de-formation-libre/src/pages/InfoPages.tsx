import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookCheck,
  CheckCircle2,
  ExternalLink,
  FileText,
  Globe,
  Lock,
  Mail,
  MessageSquare,
  Phone,
  Send,
  Shield,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../utils/api';

export const InfoPages: React.FC<{ mode: 'about' | 'privacy' | 'terms' | 'contact' }> = ({
  mode,
}) => {
  const { lang, navigate, user } = useApp();
  const isAr = lang === 'ar';

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [category, setCategory] = useState('general');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccessId, setSubmitSuccessId] = useState<number | null>(null);

  useEffect(() => {
    if (user) {
      setName((prev) => prev || user.name || '');
      setEmail((prev) => prev || user.email || '');
      setPhone((prev) => prev || user.phone || '');
    }
  }, [user]);

  const handleSubmitContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccessId(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();

    if (trimmedName.length < 2) {
      setSubmitError(
        isAr ? 'يرجى إدخال الاسم الكامل (حرفين على الأقل).' : 'Veuillez saisir votre nom complet.'
      );
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setSubmitError(
        isAr ? 'يرجى إدخال بريد إلكتروني صحيح.' : 'Veuillez saisir une adresse e-mail valide.'
      );
      return;
    }
    if (trimmedSubject.length < 3) {
      setSubmitError(
        isAr ? 'يرجى كتابة موضوع الرسالة.' : 'Veuillez saisir l’objet de votre message.'
      );
      return;
    }
    if (trimmedMessage.length < 10) {
      setSubmitError(
        isAr
          ? 'يرجى كتابة تفاصيل الرسالة (10 أحرف على الأقل).'
          : 'Veuillez détailler votre message (10 caractères minimum).'
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{ ok: boolean; id: number }>('/api/contact', {
        method: 'POST',
        json: {
          name: trimmedName,
          email: trimmedEmail,
          phone: phone.trim(),
          category,
          subject: trimmedSubject,
          message: trimmedMessage,
        },
      });
      setSubmitSuccessId(res.id);
      setSubject('');
      setMessage('');
    } catch (err: any) {
      setSubmitError(
        err?.message ||
          (isAr
            ? 'تعذر إرسال الرسالة حالياً. يرجى المحاولة لاحقاً.'
            : 'Impossible d’envoyer le message pour le moment.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (mode === 'privacy') {
    const sections = isAr
      ? [
          {
            id: 'priv-scope',
            title: '1. نطاق سياسة الخصوصية والهوية القانونية للمنصة',
            body: 'تنطبق سياسة الخصوصية هذه على جميع الخدمات الرقمية والمحتوى التعليمي وبوابات الدفع والاستبيانات المتاحة عبر النطاق الرسمي لمنصة التدريب الحر — تدريبي (https://tadribi.chtbqi.com/). نحن نلتزم بمبادئ تقليل البيانات إلى الحد الضروري لتقديم الخدمة التربوية ومطابقة الاشتراكات وحماية حسابات الطلاب والمعلمين في موريتانيا ومنطقة غرب أفريقيا والعالم العربي. لا يتم بيع أي بيانات تعريفية أو أكاديمية أو مالية لأي طرف إعلاني أو وسيط تجاري تحت أي ظرف.',
          },
          {
            id: 'priv-collected',
            title: '2. فئات البيانات التي نجمعها وسبب كل فئة',
            body: 'أ) بيانات التعريف والحساب: الاسم الكامل، البريد الإلكتروني، رقم الهاتف الاختياري أو المرتبط بإكمال الملف الشخصي، الولاية أو المدينة، المسار التربوي المختار (عربي، فرنسي، مزدوج) أو شعبة الباكالوريا (SN، M، LM، LO)، والمستوى التدريبي.\nب) بيانات التقدم الأكاديمي: الدروس المقروءة، المفضلة، أهداف الدراسة اليومية، وإجابات الامتحانات المحاكية والتجريبية وبنك الأسئلة لغرض احتساب النتائج من 20 وتوليد تقارير التقدم التراكمية.\nج) بيانات الاشتراكات والتحقق من الدفع: في بوابة الدفع العالمية (Visa / MasterCard) يُحفظ مرجع المعاملة، نوع البطاقة، وآخر 4 أرقام فقط دون تخزين رقم البطاقة الكامل أو رمز الأمان CVV مطلقاً. وفي الدفع المحلي (السداد، مصرفي، بنكيلي) يتم حفظ اسم المرسل، رقم الهاتف المرسل، صورة الإيصال، المبلغ، ومعرف التحويل لغرض الفحص الآلي والمراجعة الإدارية ومنع تكرار الإيصالات.',
          },
          {
            id: 'priv-sessions',
            title: '3. أمن الحسابات، الجلسات النشطة، والروابط المؤقتة (5 دقائق)',
            body: 'يحتفظ النظام بسجل الجلسات النشطة (نوع الجهاز، المتصفح، نظام التشغيل، الموقع الجغرافي التقريبي، وتاريخ آخر نشاط) لتمكين كل مستخدم من اكتشاف أي دخول غير معتاد وإنهاء الجلسات البعيدة بضغطة زر. عند تغيير كلمة المرور أو طلب استعادتها عبر البريد الإلكتروني، يتم إصدار رمز أمان مؤقت صالح لمدة 5 دقائق فقط ويُستخدم لمرة واحدة ويُبطَل تلقائياً فور استخدامه أو انتهاء المهلة أو إصدار رمز أحدث.',
          },
          {
            id: 'priv-permissions',
            title: '4. أذونات المتصفح الاختيارية (الموقع الجغرافي والإشعارات)',
            body: 'لا تطلب منصة تدريبي الوصول إلى الموقع الجغرافي أو إشعارات الدفع في المتصفح بصورة خفية؛ بل يتم ذلك حصرياً عبر أزرار واضحة داخل صفحة الملف الشخصي بعد موافقتك الصريحة عبر نافذة المتصفح الرسمية. يمكنك رفض أي إذن دون تأثر قدرتك على تصفح الدروس أو أداء الامتحانات، كما يمكنك تحديث حالتك أو سحب الإذن في أي وقت من إعدادات متصفحك.',
          },
          {
            id: 'priv-retention',
            title: '5. الاحتفاظ بالبيانات، النسخ الاحتياطي، وحقوق المستخدم',
            body: 'تُحفظ سجلات الدفع والفواتير الرسمية (المزودة برمز QR موقّع رقمياً) لأغراض التوثيق والمراجعة المالية ودعم المشتركين، بينما يمكنك في أي وقت تحديث بياناتك الشخصية، تعديل مسارك، طلب مراجعة سجل البلاغات، أو التواصل مع الإدارة الرسمية لممارسة حق الوصول أو التصحيح أو الحذف وفق الأنظمة المعمول بها.',
          },
          {
            id: 'priv-processors',
            title: '6. مزودو البنية التحتية والروابط المرجعية المعتمدة',
            body: 'تعتمد المنصة على خدمات مصادقة وتخزين سحابية مشفرة مثل Google Firebase وخدمات الشبكة الآمنة لتسريع التصفح وحماية الجلسات، مع الفصل التام بين نظام البطاقات المصرفية العالمية ونظام التحويلات المحلية الموريتانية.',
          },
        ]
      : [
          {
            id: 'priv-scope',
            title: '1. Portée et identité légale de la plateforme',
            body: 'La présente politique s’applique à l’ensemble des services pédagogiques, examens blancs et passerelles de paiement accessibles via le domaine officiel de Tadribi (https://tadribi.chtbqi.com/). Nous appliquons le principe de minimisation des données : seules les informations strictement nécessaires au suivi scolaire, à la validation des abonnements et à la sécurité des comptes sont traitées. Aucune donnée personnelle n’est vendue ni cédée à des régies publicitaires.',
          },
          {
            id: 'priv-collected',
            title: '2. Catégories de données collectées et finalités',
            body: 'a) Profil académique : nom complet, adresse e-mail, téléphone, wilaya/ville, filière (Arabe, Français, Bilingue ou séries Bac SN, M, LM, LO) et niveau.\nb) Progression pédagogique : leçons consultées, favoris, objectifs d’étude et tentatives d’examens notées sur 20.\nc) Paiements et facturation : pour Visa/MasterCard, seuls la marque, les 4 derniers chiffres et la référence de transaction sont conservés (aucun CVV ni numéro complet n’est stocké). Pour les paiements locaux (Sedad, Masrvi, Bankily), la capture du reçu, l’identifiant TX, le montant et le téléphone émetteur sont vérifiés automatiquement et archivés pour prévenir la réutilisation frauduleuse.',
          },
          {
            id: 'priv-sessions',
            title: '3. Sécurité des sessions et liens à usage unique (5 minutes)',
            body: 'Chaque session enregistrée affiche le type d’appareil, le navigateur et la dernière activité afin de permettre la déconnexion à distance depuis le profil. Les liens de vérification d’e-mail et de réinitialisation de mot de passe expirent strictement après 5 minutes et deviennent définitivement invalides dès leur première utilisation.',
          },
          {
            id: 'priv-permissions',
            title: '4. Autorisations navigateur facultatives (Géolocalisation & Notifications)',
            body: 'L’accès à la géolocalisation et aux notifications web reste totalement optionnel et déclenché uniquement sur action volontaire depuis la page Mon Compte. Un refus n’entraîne aucune restriction d’accès aux cours ou aux examens.',
          },
          {
            id: 'priv-retention',
            title: '5. Conservation, justificatifs QR et droits des utilisateurs',
            body: 'Les reçus de paiement signés numériquement (vérifiables par QR sur https://tadribi.chtbqi.com/verify-receipt) restent accessibles au titulaire du compte pour impression ou export PDF/JPG. Vous pouvez à tout moment rectifier vos données ou contacter le support officiel.',
          },
        ];

    return (
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div className="addressp-box-white space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#d8dfe2]">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-[#83a329]" />
              <div>
                <h1 className="text-xl font-extrabold text-[#384D55]">
                  {isAr ? 'سياسة الخصوصية وحماية البيانات — منصة تدريبي' : 'Politique de confidentialité — Tadribi'}
                </h1>
                <p className="text-xs text-[#6b787e]" dir="ltr">
                  https://tadribi.chtbqi.com/privacy
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded bg-[#e2efbf] border border-[#A6CE39] text-[#2c4a12] text-[11px] font-extrabold">
              {isAr ? 'محدّثة 2026' : 'Mise à jour 2026'}
            </span>
          </div>

          <div className="p-3 rounded-[5px] bg-[#f7f9fa] border border-[#d8dfe2] flex flex-wrap gap-2">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollToSection(s.id)}
                className="px-2.5 py-1 rounded bg-white border border-[#d8dfe2] hover:border-[#83a329] text-[11px] font-bold text-[#384D55] cursor-pointer"
              >
                {s.title}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {sections.map((s) => (
              <section
                key={s.id}
                id={s.id}
                className="p-4 rounded-[6px] border border-[#e4e9ec] bg-[#fcfdfd] space-y-2"
              >
                <h2 className="font-extrabold text-sm sm:text-base text-[#384D55]">{s.title}</h2>
                <p className="text-xs sm:text-sm text-[#4a555b] leading-relaxed whitespace-pre-line break-words">
                  {s.body}
                </p>
              </section>
            ))}
          </div>

          <div className="p-4 rounded-[6px] bg-[#f9fcf2] border border-[#A6CE39] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="space-y-1">
              <div className="font-extrabold text-[#384D55] flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-[#557a16]" />
                <span>
                  {isAr ? 'مراجع الأمان والمزودون المعتمدون:' : 'Références sécurité & partenaires :'}
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  href="https://firebase.google.com/support/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-bold text-[#557a16] hover:underline"
                >
                  <span>Firebase Privacy & Security</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-bold text-[#557a16] hover:underline"
                >
                  <span>Google Privacy Policy</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate('terms')}
                className="imgsend2-secondary !py-1.5 !px-3 text-xs"
              >
                {isAr ? 'اتفاقية الاستخدام' : 'Conditions'}
              </button>
              <button
                type="button"
                onClick={() => navigate('report')}
                className="imgsend2 !py-1.5 !px-3 text-xs"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{isAr ? 'الإبلاغ عن مشكلة' : 'Signaler un problème'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'terms') {
    const sections = isAr
      ? [
          {
            id: 'term-accept',
            title: '1. القبول والأهلية القانونية واستخدام النطاق الرسمي',
            body: 'يمثل تسجيلك أو استخدامك لمنصة تدريبي (https://tadribi.chtbqi.com/) موافقة صريحة وكاملة على بنود اتفاقية الاستخدام هذه. يلتزم المستخدم بتقديم بيانات صحيحة عند التسجيل أو إكمال الملف الشخصي، والحفاظ على سرية بيانات الدخول وعدم مشاركة الحساب مع أطراف تجارية أو جهات نشر.',
          },
          {
            id: 'term-ip',
            title: '2. الملكية الفكرية وحظر النسخ أو إعادة البيع',
            body: 'جميع الدروس، الشروحات الصوتية، الملخصات، أسئلة بنوك التدريب، نماذج الامتحانات المحاكية، وتصاميم كشوف النقاط والشعارات مملوكة حصرياً لمنصة تدريبي للتدريب الحر. يُرخص للمشترك بالاستخدام الشخصي والتعليمي فقط، ويُحظر نسخ المحتوى آلياً أو إعادة نشره أو تداوله عبر مجموعات مدفوعة أو منصات خارجية، كما تتيح المنصة أدوات تصدير رسمية (PDF / JPG / طباعة) موقّعة لنتائج الطالب وإيصالاته الخاصة فقط.',
          },
          {
            id: 'term-payments',
            title: '3. شروط الاشتراكات: الدفع العالمي مقابل الدفع المحلي الموريتاني',
            body: 'أ) بوابة الدفع العالمية (Visa / MasterCard): مستقلة بالكامل وتمنح تفعيلاً فورياً للباقة المختارة فور نجاح معالجة البطاقة، مع إصدار فاتورة إلكترونية رسمية قابلة للطباعة والتحقق الرقمي.\nب) الدفع المحلي (السداد، مصرفي، بنكيلي): مستقل بالكامل عن الدفع بالبطاقات، ويخضع كل إيصال مرفوع لفحص آلي متعدد المراحل ثم مراجعة إدارية عند اللزوم. يُرفض الإيصال فوراً إذا كان تالفاً، من تطبيق غير مطابق، مكرراً، منتهي الصلاحية، غير مقروء المبلغ، أو محوّلاً لمستفيد مختلف. عند نقص المبلغ المرسل عن قيمة الباقة، يمكن تسجيله كدفعة جزئية ثم إكماله لاحقاً وفق الضوابط المعروضة في صفحة الدفع.',
          },
          {
            id: 'term-referrals',
            title: '4. نظام الإحالات والنقاط والمكافآت',
            body: 'يتم توليد رابط إحالة شخصي فريد لكل مشترك على النطاق الرسمي (https://tadribi.chtbqi.com/?ref=CODE). تُمنح نقاط الإحالة فقط بعد قيام المستخدم المدعو بالتسجيل الفعلي وتوثيق بريده الإلكتروني بصورة مشروعة. أي محاولة لإنشاء حسابات وهمية أو متكررة أو استغلال الروابط آلياً تؤدي إلى حجب النقاط وإمكانية تعليق الحساب.',
          },
          {
            id: 'term-bac',
            title: '5. الطبيعة التربوية لحاسبة الباكالوريا والامتحانات المحاكية',
            body: 'تُقدَّم دروس الباكالوريا الموريتانية (SN، M/C، LM، LO)، وبنوك الأسئلة، والامتحانات المحاكية من 20، وحاسبة معدل الباكالوريا كأدوات مساعدة للتدريب والتقييم الذاتي والتقدير الشخصي، ولا تُغني بأي حال عن النتائج أو الشهادات الرسمية الصادرة عن وزارة التهذيب الوطني وإصلاح النظام التعليمي في الجمهورية الإسلامية الموريتانية.',
          },
          {
            id: 'term-enforcement',
            title: '6. تعليق الحساب وتسوية المنازعات والتواصل الرسمي',
            body: 'يحق للإدارة إيقاف أو تقييد أي حساب يثبت تورطه في تلاعب بالإيصالات، استغلال للثغرات، أو انتهاك لحقوق الملكية الفكرية، مع إتاحة قناة "الإبلاغ عن مشكلة" و"تواصل بنا" لتقديم التظلمات والشكاوى ومراجعتها من طرف الإدارة الرسمية المعتمدة.',
          },
        ]
      : [
          {
            id: 'term-accept',
            title: '1. Acceptation et usage personnel',
            body: 'L’accès et l’inscription sur Tadribi (https://tadribi.chtbqi.com/) valent acceptation sans réserve des présentes conditions générales d’utilisation. L’utilisateur s’engage à fournir des informations exactes et à conserver la confidentialité de ses identifiants.',
          },
          {
            id: 'term-ip',
            title: '2. Propriété intellectuelle et protection du contenu',
            body: 'Les cours, fiches de synthèse, banques de questions, examens simulés et supports graphiques sont la propriété exclusive de Tadribi. Toute extraction automatisée, copie massive ou redistribution commerciale est strictement interdite. Seuls les exports officiels (relevés de notes et reçus personnels PDF/JPG) sont autorisés.',
          },
          {
            id: 'term-payments',
            title: '3. Paiements internationaux (Visa/MasterCard) et paiements locaux (Mauritanie)',
            body: 'Les deux systèmes sont strictement indépendants : les cartes Visa/MasterCard activent immédiatement l’abonnement choisi, tandis que les transferts locaux (Sedad, Masrvi, Bankily) passent par une inspection automatisée multi-critères vérifiant l’authenticité, la date, l’unicité du numéro d’opération, le montant et le bénéficiaire.',
          },
          {
            id: 'term-referrals',
            title: '4. Programme de parrainage et loyauté',
            body: 'Chaque membre dispose d’un lien officiel unique sur https://tadribi.chtbqi.com/?ref=CODE. Les points ne sont crédités qu’après vérification effective de l’e-mail du filleul. Tout abus entraîne l’annulation des points.',
          },
          {
            id: 'term-bac',
            title: '5. Caractère indicatif des simulations et du calculateur Bac',
            body: 'Les moyennes calculées et notes simulées sur 20 constituent des indicateurs pédagogiques d’entraînement et ne se substituent pas aux délibérations officielles des examens nationaux.',
          },
          {
            id: 'term-enforcement',
            title: '6. Suspension de compte et voies de recours',
            body: 'En cas de fraude sur justificatif ou violation des règles, l’administration se réserve le droit de suspendre l’accès. Les utilisateurs peuvent soumettre toute réclamation via « Signaler un problème » ou « Nous contacter ».',
          },
        ];

    return (
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div className="addressp-box-white space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#d8dfe2]">
            <div className="flex items-center gap-3">
              <FileText className="w-6 h-6 text-[#83a329]" />
              <div>
                <h1 className="text-xl font-extrabold text-[#384D55]">
                  {isAr ? 'اتفاقية الاستخدام والشروط والأحكام — منصة تدريبي' : 'Conditions d’utilisation — Tadribi'}
                </h1>
                <p className="text-xs text-[#6b787e]" dir="ltr">
                  https://tadribi.chtbqi.com/terms
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded bg-[#e2efbf] border border-[#A6CE39] text-[#2c4a12] text-[11px] font-extrabold">
              {isAr ? 'سارية المفعول' : 'En vigueur'}
            </span>
          </div>

          <div className="p-3 rounded-[5px] bg-[#f7f9fa] border border-[#d8dfe2] flex flex-wrap gap-2">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollToSection(s.id)}
                className="px-2.5 py-1 rounded bg-white border border-[#d8dfe2] hover:border-[#83a329] text-[11px] font-bold text-[#384D55] cursor-pointer"
              >
                {s.title}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {sections.map((s) => (
              <section
                key={s.id}
                id={s.id}
                className="p-4 rounded-[6px] border border-[#e4e9ec] bg-[#fcfdfd] space-y-2"
              >
                <h2 className="font-extrabold text-sm sm:text-base text-[#384D55]">{s.title}</h2>
                <p className="text-xs sm:text-sm text-[#4a555b] leading-relaxed whitespace-pre-line break-words">
                  {s.body}
                </p>
              </section>
            ))}
          </div>

          <div className="p-4 rounded-[6px] bg-[#f9fcf2] border border-[#A6CE39] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate('privacy')}
                className="font-bold text-[#557a16] hover:underline cursor-pointer"
              >
                {isAr ? 'سياسة الخصوصية' : 'Politique de confidentialité'}
              </button>
              <button
                type="button"
                onClick={() => navigate('subscriptions')}
                className="font-bold text-[#557a16] hover:underline cursor-pointer"
              >
                {isAr ? 'الباقات والاشتراكات' : 'Abonnements'}
              </button>
              <button
                type="button"
                onClick={() => navigate('contact')}
                className="font-bold text-[#557a16] hover:underline cursor-pointer"
              >
                {isAr ? 'تواصل بنا' : 'Nous contacter'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => navigate('report')}
              className="imgsend2 !py-1.5 !px-3 text-xs"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{isAr ? 'الإبلاغ عن مشكلة' : 'Signaler un problème'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'contact') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div className="addressp-box-white space-y-5">
          <div className="flex items-center gap-3 pb-3 border-b border-[#d8dfe2]">
            <Mail className="w-6 h-6 text-[#83a329]" />
            <div>
              <h1 className="text-xl font-extrabold text-[#384D55]">
                {isAr ? 'تواصل بنا' : 'Nous contacter'}
              </h1>
              <p className="text-xs text-[#6b787e]">
                {isAr
                  ? 'فريق الدعم الفني والأكاديمي جاهز لمساعدتك في استفسارات الاشتراكات، المسارات التربوية، الباكالوريا، أو الملاحظات التقنية.'
                  : 'Notre équipe d’assistance est disponible pour toute question sur les abonnements, les cours ou le support technique.'}
              </p>
            </div>
          </div>

          {submitSuccessId !== null && (
            <div className="p-3.5 rounded-[4px] border border-[#A6CE39] bg-[#e2efbf] text-[#384D55] text-xs sm:text-sm font-bold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#557a16] shrink-0" />
              <span>
                {isAr
                  ? `تم إرسال رسالتك بنجاح وحفظها تحت الرقم المرجعي (#${submitSuccessId}). سيتواصل معك فريق الإدارة قريباً.`
                  : `Votre message a été enregistré avec succès (référence #${submitSuccessId}). Notre équipe vous répondra prochainement.`}
              </span>
            </div>
          )}

          {submitError && (
            <div className="p-3 rounded-[4px] border border-red-200 bg-red-50 text-red-700 text-xs font-bold">
              {submitError}
            </div>
          )}

          <form onSubmit={handleSubmitContact} className="space-y-3.5 text-xs sm:text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-[#384D55] mb-1">
                  {isAr ? 'الاسم الكامل' : 'Nom complet'} <span className="required">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={isAr ? 'أدخل اسمك الكامل' : 'Votre nom complet'}
                  className="template-input"
                />
              </div>
              <div>
                <label className="block font-bold text-[#384D55] mb-1">
                  {isAr ? 'البريد الإلكتروني' : 'Adresse e-mail'} <span className="required">*</span>
                </label>
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  className="template-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-[#384D55] mb-1">
                  {isAr ? 'رقم الهاتف / واتساب (اختياري)' : 'Téléphone / WhatsApp (optionnel)'}
                </label>
                <input
                  type="tel"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+222 XX XX XX XX"
                  className="template-input"
                />
              </div>
              <div>
                <label className="block font-bold text-[#384D55] mb-1">
                  {isAr ? 'نوع الرسالة' : 'Catégorie'}
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="template-input"
                >
                  <option value="general">{isAr ? 'استفسار عام' : 'Demande générale'}</option>
                  <option value="subscriptions">
                    {isAr ? 'الاشتراكات والمدفوعات' : 'Abonnements et paiements'}
                  </option>
                  <option value="baccalaureate">
                    {isAr ? 'المحتوى التربوي والباكالوريا' : 'Contenu pédagogique & Bac'}
                  </option>
                  <option value="technical">{isAr ? 'مشكلة تقنية' : 'Assistance technique'}</option>
                  <option value="partnership">{isAr ? 'شراكة أو مقترح تطوير' : 'Partenariat / Suggestion'}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-bold text-[#384D55] mb-1">
                {isAr ? 'الموضوع' : 'Objet'} <span className="required">*</span>
              </label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={isAr ? 'عنوان مختصر لرسالتك' : 'Objet de votre message'}
                className="template-input"
              />
            </div>

            <div>
              <label className="block font-bold text-[#384D55] mb-1">
                {isAr ? 'نص الرسالة' : 'Message'} <span className="required">*</span>
              </label>
              <textarea
                required
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  isAr
                    ? 'اكتب تفاصيل استفسارك أو ملاحظتك ليتم الرد عليك في أقرب وقت...'
                    : 'Décrivez votre demande en détail...'
                }
                className="w-full border border-[#d3d6d8] bg-white rounded-[4px] p-2.5 text-xs sm:text-sm text-[#384D55] outline-none focus:border-[#83a329]"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button type="submit" disabled={submitting} className="imgsend2 text-xs">
                <Send className="w-3.5 h-3.5" />
                <span>
                  {submitting
                    ? isAr
                      ? 'جارٍ الإرسال...'
                      : 'Envoi...'
                    : isAr
                      ? 'إرسال الرسالة للإدارة'
                      : 'Envoyer le message'}
                </span>
              </button>
              <span className="text-[11px] text-[#6b787e]">
                {isAr
                  ? 'تصل رسالتك مباشرة إلى لوحة الإدارة مع إشعار فوري.'
                  : 'Votre message est transmis directement à l’administration.'}
              </span>
            </div>
          </form>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[#d8dfe2]">
            <div className="border border-[#d8dfe2] rounded-[6px] p-3.5 bg-[#f7f9fa] space-y-1.5">
              <div className="font-bold text-[#384D55] text-xs flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-[#83a329]" />
                <span>{isAr ? 'البريد الرسمي' : 'E-mail officiel'}</span>
              </div>
              <a
                href="mailto:abdarrahmannagi@gmail.com"
                dir="ltr"
                className="text-xs font-bold text-[#557a16] hover:underline block break-all"
              >
                abdarrahmannagi@gmail.com
              </a>
            </div>

            <div className="border border-[#d8dfe2] rounded-[6px] p-3.5 bg-[#f7f9fa] space-y-1.5">
              <div className="font-bold text-[#384D55] text-xs flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-[#83a329]" />
                <span>{isAr ? 'واتساب الدعم' : 'Support WhatsApp'}</span>
              </div>
              <a
                href="https://wa.me/22247526504"
                target="_blank"
                rel="noopener noreferrer"
                dir="ltr"
                className="text-xs font-bold text-[#557a16] hover:underline block"
              >
                +222 47 52 65 04
              </a>
            </div>

            <div className="border border-[#d8dfe2] rounded-[6px] p-3.5 bg-[#f7f9fa] space-y-2">
              <div className="font-bold text-[#384D55] text-xs flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-[#83a329]" />
                <span>{isAr ? 'قنوات الحساب' : 'Espace membre'}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate('support')}
                  className="imgsend2 !py-1 !px-2.5 !text-[11px]"
                >
                  {isAr ? 'الدعم المباشر' : 'Chat direct'}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('report')}
                  className="imgsend2-secondary !py-1 !px-2.5 !text-[11px]"
                >
                  {isAr ? 'بلاغ فني' : 'Signaler'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 'about'
  const aboutPillars = isAr
    ? [
        {
          title: 'رسالة منصة تدريبي ورؤيتنا التربوية',
          body: 'تأسست منصة التدريب الحر — تدريبي (https://tadribi.chtbqi.com/) لتكون المرجع الرقمي الموريتاني المتكامل لإعداد المترشحين لمسابقات المعلمين والتكوين المهني التربوي، ومرافقة طلاب الباكالوريا الوطنية في الشعب المعتمدة عبر تجربة رقمية واضحة، سريعة، وثلاثية اللغات (العربية، الفرنسية، والإنجليزية) مع الحفاظ على دقة المصطلح التربوي والعلمي.',
        },
        {
          title: 'المسارات الرسمية والباكالوريا الموريتانية',
          body: 'تغطي المنصة مسارات المعلمين الثلاثة (المسار العربي، المسار الفرنسي، والمسار المزدوج) عبر التخطيط والقياس وعلم النفس التربوي وطرائق التدريس وإدارة القسم، كما توفر فضاءً متخصصاً للباكالوريا الموريتانية يشمل الشعب الأربع: العلوم الطبيعية (SN)، الرياضيات (M/C)، الآداب العصرية (LM)، والآداب الأصلية (LO)، مع حاسبة معدل رسمية دقيقة من 20 وإمكانية تصدير النتائج عبر PDF متجهي وصور 300 DPI.',
        },
        {
          title: 'التقييم الذكي، كشوف النقاط، والقراءة الصوتية',
          body: 'يعتمد نظام الاختبارات على التصحيح المعياري من 20 نقطة مع تحليل نقاط القوة والضعف حسب المادة والمحور، وبنك أسئلة متنامٍ متاح للتدريب السريع أو المحاكاة الرسمية (70 سؤالاً)، إضافة إلى تقنية القراءة الصوتية الواضحة للدروس والأسئلة وكشوف درجات PDF جاهزة للطباعة.',
        },
        {
          title: 'الفصل الاحترافي لأنظمة الدفع والتوثيق بالرمز المربّع (QR)',
          body: 'توفر المنصة بوابة مستقلة للبطاقات المصرفية العالمية (Visa / MasterCard) تفعّل الاشتراك لحظياً، إلى جانب نظام محلي موريتاني مستقل عبر السداد ومصرفي وبنكيلي مزوّد بفحص آلي للإيصالات. جميع الفواتير تصدر بصيغة PDF وJPG 300 DPI مع رمز QR مشفّر للتحقق الفوري عبر الرابط الرسمي للمنصة.',
        },
      ]
    : [
        {
          title: 'Mission et vision pédagogique',
          body: 'Fondée pour accompagner les candidats mauritaniens aux concours d’instituteurs et au Baccalauréat national, Tadribi (https://tadribi.chtbqi.com/) réunit cours structurés, fiches synthétiques, banques de questions et examens chronométrés dans un environnement multilingue fiable.',
        },
        {
          title: 'Filières officielles & Baccalauréat Mauritanien',
          body: 'Couverture complète des parcours Instituteurs (Arabe, Français, Bilingue) et des 4 séries du Baccalauréat (SN, M/C, LM, LO), accompagnée d’un calculateur officiel de moyenne /20 avec export PDF vectoriel et JPG 300 DPI.',
        },
        {
          title: 'Évaluation sur 20 et relevés professionnels',
          body: 'Correction instantanée sur 20 points, suivi statistique par thème, synthèse vocale haute clarté et relevés de performance exportables.',
        },
        {
          title: 'Paiements séparés & reçus vérifiables par QR',
          body: 'Passerelle internationale Visa/MasterCard à activation immédiate et système local mauritanien indépendant (Sedad, Masrvi, Bankily) avec reçus signés numériquement.',
        },
      ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <div className="addressp-box-white space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#d8dfe2]">
          <div className="flex items-center gap-3">
            <BookCheck className="w-6 h-6 text-[#83a329]" />
            <div>
              <h1 className="text-xl font-extrabold text-[#384D55]">
                {isAr ? 'من نحن — منصة التدريب الحر (Tadribi)' : 'À propos de Tadribi'}
              </h1>
              <p className="text-xs text-[#6b787e]" dir="ltr">
                https://tadribi.chtbqi.com/about
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#e2efbf] border border-[#A6CE39] text-[#2c4a12] text-[11px] font-extrabold">
            <Globe className="w-3.5 h-3.5" />
            <span>{isAr ? 'الجمهورية الإسلامية الموريتانية' : 'Mauritanie'}</span>
          </span>
        </div>

        <div className="space-y-3.5">
          {aboutPillars.map((sec, idx) => (
            <section
              key={idx}
              className="p-4 rounded-[6px] border border-[#e4e9ec] bg-[#fcfdfd] space-y-1.5"
            >
              <h2 className="font-extrabold text-sm sm:text-base text-[#384D55]">{sec.title}</h2>
              <p className="text-xs sm:text-sm text-[#4a555b] leading-relaxed break-words">
                {sec.body}
              </p>
            </section>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="border border-[#d8dfe2] rounded-[6px] p-3.5 bg-[#f7f9fa]">
            <div className="font-extrabold text-[#83a329] mb-1">
              {isAr ? 'توثيق الدفع الموريتاني' : 'Partenaires locaux'}
            </div>
            <p className="text-[#6b787e]">
              {isAr
                ? 'دعم مباشر لعمليات السداد ومصرفي وبنكيلي ضمن بيئة تحقق ذكية معزولة.'
                : 'Compatibilité directe Sedad, Masrvi et Bankily.'}
            </p>
          </div>
          <div className="border border-[#d8dfe2] rounded-[6px] p-3.5 bg-[#f7f9fa]">
            <div className="font-extrabold text-[#83a329] mb-1">
              {isAr ? 'تواصل مباشر ودعم فني' : 'Assistance & Support'}
            </div>
            <p className="text-[#6b787e]">
              {isAr
                ? 'دردشة فورية مع الإدارة ونظام تذاكر وبلاغات متكامل لمتابعة أي استفسار.'
                : 'Chat direct, formulaire de contact et suivi des signalements.'}
            </p>
          </div>
          <div className="border border-[#d8dfe2] rounded-[6px] p-3.5 bg-[#f7f9fa] flex flex-col justify-between gap-2">
            <div className="font-extrabold text-[#83a329]">
              {isAr ? 'ابدأ الآن أو تواصل معنا' : 'Accès rapide'}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate('baccalaureate')}
                className="imgsend2 !py-1 !px-2.5 text-[11px]"
              >
                {isAr ? 'قسم الباكالوريا' : 'Baccalauréat'}
              </button>
              <button
                type="button"
                onClick={() => navigate('report')}
                className="imgsend2-secondary !py-1 !px-2.5 text-[11px]"
              >
                {isAr ? 'الإبلاغ عن مشكلة' : 'Signaler'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
