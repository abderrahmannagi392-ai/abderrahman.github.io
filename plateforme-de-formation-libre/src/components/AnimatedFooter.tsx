import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../utils/api';
import { tr } from '../utils/locale';
import { PAYMENT_LOGO_URLS } from './PaymentBrandBadges';

const DROPDOWN_GROUPS: Array<{ title: string; titleFr: string; items: string[] }> = [
  {
    title: 'الشعب',
    titleFr: 'Filières',
    items: [
      'اللغة العربية',
      'التربية الإسلامية',
      'الرياضيات',
      'العلوم الطبيعية',
      'علوم التربية',
      'علم النفس التربوي',
    ],
  },
  {
    title: 'الولايات',
    titleFr: 'Wilayas',
    items: [
      'الحوض الشرقي',
      'الحوض الغربي',
      'العصابة',
      'كوركول',
      'البراكنة',
      'الترارزة',
      'آدرار',
      'داخلت نواذيبو',
      'تكانت',
      'كيدي ماغا',
      'تيرس زمور',
      'إينشيري',
      'نواكشوط الغربية',
      'نواكشوط الشمالية',
      'نواكشوط الجنوبية',
    ],
  },
];

interface ParticleSpec {
  left: string;
  size: number;
  duration: string;
  delay: string;
}

export const AnimatedFooter: React.FC = () => {
  const { lang, user, navigate, goToAuth } = useApp();

  const footerRef = useRef<HTMLElement | null>(null);
  const ddRef = useRef<HTMLDivElement | null>(null);
  const ddBtnRef = useRef<HTMLButtonElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  const [revealed, setRevealed] = useState(false);
  const [ddOpen, setDdOpen] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [btnDone, setBtnDone] = useState(false);
  const [message, setMessage] = useState('');
  const [showTop, setShowTop] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  const particles = useMemo<ParticleSpec[]>(() => {
    return Array.from({ length: 18 }, (_, i) => {
      const seedA = ((i * 37 + 13) % 100);
      const seedB = ((i * 53 + 7) % 100);
      const seedC = ((i * 71 + 29) % 100);
      return {
        left: `${seedA}%`,
        size: Number((3 + (seedB / 100) * 6).toFixed(2)),
        duration: `${(7 + (seedC / 100) * 8).toFixed(2)}s`,
        delay: `${((seedB / 100) * 8).toFixed(2)}s`,
      };
    });
  }, []);

  // Reveal animation on IntersectionObserver
  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;
    if (typeof IntersectionObserver !== 'undefined') {
      const io = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            setRevealed(true);
            io.disconnect();
          }
        },
        { threshold: 0.12 }
      );
      io.observe(el);
      return () => io.disconnect();
    } else {
      setRevealed(true);
    }
  }, []);

  // Outside click and Escape key handling for dropdown
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ddRef.current && !ddRef.current.contains(e.target as Node)) {
        setDdOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ddOpen) {
        setDdOpen(false);
        ddBtnRef.current?.focus();
      }
    };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [ddOpen]);

  // Scroll tracking for circular Back-to-Top button
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setShowTop(y > 200);
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const pct = maxScroll > 0 ? Math.min(1, Math.max(0, y / maxScroll)) : 0;
      setScrollProgress(pct);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // 3D tilt hover handlers for payment cards & partner badge
  const handleTiltMove = (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', `${x * 22}deg`);
    el.style.setProperty('--rx', `${-y * 22}deg`);
  };

  const handleTiltLeave = (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--rx', '0deg');
  };

  // Magnetic mouse pull on social circles
  const handleSocMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const a = e.currentTarget;
    const r = a.getBoundingClientRect();
    const dx = (e.clientX - r.left - r.width / 2) * 0.35;
    const dy = (e.clientY - r.top - r.height / 2) * 0.35 - 4;
    a.style.transform = `translate(${dx}px,${dy}px)`;
  };

  const handleSocLeave = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.style.transform = '';
  };

  const triggerShake = () => {
    const el = emailInputRef.current;
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  };

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      triggerShake();
      setMessage(
        tr(
          lang,
          'أدخل بريداً إلكترونياً صحيحاً.',
          'Veuillez saisir une adresse e-mail valide.',
          'Please enter a valid email address.'
        )
      );
      return;
    }

    setMessage('');
    setSubmitting(true);
    setBtnDone(false);

    try {
      await apiRequest('/api/newsletter', {
        method: 'POST',
        json: {
          email: cleanEmail,
          country: selectedRegion || 'منصة التدريب الحر',
        },
      });
      setSubmitting(false);
      setBtnDone(true);
      setMessage(
        tr(
          lang,
          'تم تسجيل اشتراكك. ستصلك النشرة على بريدك.',
          'Inscription enregistrée. Vous recevrez nos actualités par e-mail.',
          'Subscription confirmed. Updates will arrive in your inbox.'
        )
      );
      setEmail('');
      window.setTimeout(() => {
        setBtnDone(false);
      }, 3000);
    } catch (err: any) {
      setSubmitting(false);
      triggerShake();
      setMessage(
        err?.message ||
          tr(
            lang,
            'تعذّر تسجيل الاشتراك حالياً، حاول مرة أخرى.',
            "Impossible d'enregistrer votre inscription pour le moment.",
            'Unable to subscribe right now. Please try again.'
          )
      );
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const dashOffset = 132 * (1 - scrollProgress);

  return (
    <div className="ht-ft-root mt-auto">
      <footer ref={footerRef} className={`ft${revealed ? ' in' : ''}`}>
        {/* Animated dual waves */}
        <div className="wave" aria-hidden="true">
          <svg viewBox="0 0 2880 60" preserveAspectRatio="none">
            <path
              d="M0 30Q360 -6 720 30T1440 30T2160 30T2880 30V60H0Z"
              fill="var(--g2)"
              opacity=".55"
            />
          </svg>
        </div>
        <div className="wave" aria-hidden="true">
          <svg viewBox="0 0 2880 60" preserveAspectRatio="none" style={{ animationDuration: '9s' }}>
            <path d="M0 34Q360 64 720 34T1440 34T2160 34T2880 34V60H0Z" fill="var(--fbg)" />
          </svg>
        </div>

        {/* Floating green particle dots */}
        <div className="fx" aria-hidden="true">
          {particles.map((p, idx) => (
            <span
              key={idx}
              className="dot"
              style={{
                left: p.left,
                width: `${p.size}px`,
                height: `${p.size}px`,
                animationDuration: p.duration,
                animationDelay: p.delay,
              }}
            />
          ))}
        </div>

        <div className="in-wrap">
          {/* Newsletter Strip */}
          <div className="nl rv" style={{ '--n': 0 } as React.CSSProperties}>
            <div>
              <h3>
                {tr(
                  lang,
                  'اشترك مجاناً في نشرات المسابقات التربوية',
                  'Abonnez-vous gratuitement aux bulletins des concours',
                  'Subscribe free to competition updates'
                )}
              </h3>
              <p>
                {tr(
                  lang,
                  'كي يصلك آخر برامج ومستجدات مسابقة اكتتاب المعلمين في موريتانيا',
                  'Recevez les derniers programmes et annonces du concours des instituteurs en Mauritanie',
                  'Receive the latest syllabi and Mauritanian teacher recruitment competition news'
                )}
              </p>
            </div>
            <form onSubmit={handleNewsletterSubmit} noValidate>
              <div
                ref={ddRef}
                className={`dd${ddOpen ? ' open' : ''}${selectedRegion ? ' has' : ''}`}
              >
                <button
                  ref={ddBtnRef}
                  type="button"
                  className="dd-b"
                  aria-haspopup="listbox"
                  aria-expanded={ddOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDdOpen((prev) => !prev);
                  }}
                >
                  <span className="dd-t">
                    {selectedRegion ||
                      tr(lang, 'اختر الشعبة أو الولاية', 'Choisir une filière ou wilaya', 'Choose track or region')}
                  </span>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                <div
                  className="dd-l"
                  role="listbox"
                  aria-label={tr(lang, 'الشعبة أو الولاية', 'Filière ou wilaya', 'Track or region')}
                >
                  {DROPDOWN_GROUPS.map((grp) => (
                    <React.Fragment key={grp.title}>
                      <div className="dd-g">{lang === 'ar' ? grp.title : grp.titleFr}</div>
                      <div className="dd-grid">
                        {grp.items.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            className={`dd-o${selectedRegion === opt ? ' sel' : ''}`}
                            role="option"
                            aria-selected={selectedRegion === opt}
                            onClick={() => {
                              setSelectedRegion(opt);
                              setDdOpen(false);
                            }}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <input
                ref={emailInputRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={tr(lang, 'بريدك الإلكتروني', 'Votre e-mail', 'Your email')}
                aria-label={tr(lang, 'بريدك الإلكتروني', 'Votre e-mail', 'Your email')}
                autoComplete="email"
              />
              <button className={`btn${submitting ? ' load' : ''}`} type="submit" disabled={submitting}>
                <span className="t">
                  {btnDone
                    ? tr(lang, 'تم ✓', 'OK ✓', 'Done ✓')
                    : tr(lang, 'اشترك', "S'inscrire", 'Subscribe')}
                </span>
              </button>
              <div className="msg" aria-live="polite">
                {message}
              </div>
            </form>
          </div>

          {/* 4 Columns */}
          <div className="cols">
            {/* Column 1: About */}
            <div className="col about rv" style={{ '--n': 1 } as React.CSSProperties}>
              <div className="brand">
                <svg viewBox="0 0 100 100" aria-hidden="true">
                  <circle cx="50" cy="50" r="48" fill="none" stroke="var(--ink)" strokeWidth="1.6" />
                  <path className="s" d="M32 52v14c6 8 30 8 36 0V52" />
                  <g className="cap">
                    <path className="f" d="M50 28L82 42 50 56 18 42z" />
                    <g className="tas">
                      <path className="s" d="M78 44v18" />
                      <circle className="f" cx="78" cy="65" r="3.4" />
                    </g>
                  </g>
                </svg>
                <b>{tr(lang, 'منصة التدريب الحر', 'Formation Libre', 'Free Training')}</b>
              </div>
              <h3>{tr(lang, 'عن منصة التدريب الحر', 'À propos de la plateforme', 'About the Platform')}</h3>
              <ul>
                <li>
                  <button type="button" className="lk" onClick={() => navigate('about')}>
                    {tr(lang, 'من نحن', 'À propos', 'About Us')}
                  </button>
                </li>
                <li>
                  <button type="button" className="lk" onClick={() => navigate('privacy')}>
                    {tr(lang, 'سياسة الخصوصية', 'Confidentialité', 'Privacy Policy')}
                  </button>
                </li>
                <li>
                  <button type="button" className="lk" onClick={() => navigate('terms')}>
                    {tr(lang, 'اتفاقية الاستخدام', 'Conditions d’utilisation', 'Terms of Use')}
                  </button>
                </li>
                <li>
                  <button type="button" className="lk" onClick={() => navigate('contact')}>
                    {tr(lang, 'تواصل بنا', 'Nous contacter', 'Contact Us')}
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 2: Account & Path */}
            <div className="col rv" style={{ '--n': 2 } as React.CSSProperties}>
              <h3>{tr(lang, 'حسابك ومسارك', 'Compte et parcours', 'Account & Path')}</h3>
              <ul>
                <li>
                  <button
                    type="button"
                    className="lk"
                    onClick={() => (user ? navigate('profile') : goToAuth('login'))}
                  >
                    {tr(lang, 'حسابي', 'Mon compte', 'My Account')}
                  </button>
                </li>
                <li>
                  <button type="button" className="lk" onClick={() => navigate('baccalaureate')}>
                    {tr(lang, 'قسم الباكالوريا', 'Baccalauréat', 'Baccalaureate')}
                  </button>
                </li>
                <li>
                  <button type="button" className="lk" onClick={() => navigate('subscriptions')}>
                    {tr(lang, 'الباقات والاشتراكات', 'Abonnements', 'Subscriptions')}
                  </button>
                </li>
                <li>
                  <button type="button" className="lk" onClick={() => navigate('dashboard')}>
                    {tr(lang, 'لوحة الطالب', 'Tableau de bord', 'Dashboard')}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="lk"
                    onClick={() => navigate('favorites')}
                  >
                    {tr(lang, 'المفضلة', 'Favoris', 'Favorites')}
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 3: Payment Methods (Visa, Mastercard, Bankily, Masrvi, Sedad) + Official Sim */}
            <div className="col rv" style={{ '--n': 3 } as React.CSSProperties}>
              <h3>{tr(lang, 'وسائل الدفع', 'Moyens de paiement', 'Payment Methods')}</h3>
              <div className="pay">
                <div
                  className="pc tilt"
                  role="button"
                  tabIndex={0}
                  aria-label="Visa"
                  onClick={() => navigate('subscriptions')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') navigate('subscriptions');
                  }}
                  onMouseMove={handleTiltMove}
                  onMouseLeave={handleTiltLeave}
                >
                  <span className="visa">VISA</span>
                </div>
                <div
                  className="pc m tilt"
                  role="button"
                  tabIndex={0}
                  aria-label="Mastercard"
                  onClick={() => navigate('subscriptions')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') navigate('subscriptions');
                  }}
                  onMouseMove={handleTiltMove}
                  onMouseLeave={handleTiltLeave}
                >
                  <span className="mcn">Mastercard</span>
                  <span className="mcc">
                    <i className="r" />
                    <i className="o" />
                  </span>
                </div>
                <div
                  className="pc local tilt"
                  role="button"
                  tabIndex={0}
                  aria-label="بنكيلي Bankily"
                  onClick={() => navigate('subscriptions')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') navigate('subscriptions');
                  }}
                  onMouseMove={handleTiltMove}
                  onMouseLeave={handleTiltLeave}
                >
                  <img src={PAYMENT_LOGO_URLS.bankily} alt="بنكيلي" loading="lazy" />
                  <span className="plbl">{lang === 'ar' ? 'بنكيلي' : 'Bankily'}</span>
                </div>
                <div
                  className="pc local tilt"
                  role="button"
                  tabIndex={0}
                  aria-label="مصرفي Masrvi"
                  onClick={() => navigate('subscriptions')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') navigate('subscriptions');
                  }}
                  onMouseMove={handleTiltMove}
                  onMouseLeave={handleTiltLeave}
                >
                  <img src={PAYMENT_LOGO_URLS.masrvi} alt="مصرفي" loading="lazy" />
                  <span className="plbl">{lang === 'ar' ? 'مصرفي' : 'Masrvi'}</span>
                </div>
                <div
                  className="pc local tilt"
                  role="button"
                  tabIndex={0}
                  aria-label="السداد Sedad"
                  onClick={() => navigate('subscriptions')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') navigate('subscriptions');
                  }}
                  onMouseMove={handleTiltMove}
                  onMouseLeave={handleTiltLeave}
                >
                  <img src={PAYMENT_LOGO_URLS.sedad} alt="السداد" loading="lazy" />
                  <span className="plbl">{lang === 'ar' ? 'السداد' : 'Sedad'}</span>
                </div>
              </div>
              <p className="pnote">
                {tr(
                  lang,
                  'ندعم البطاقات العالمية (Visa / Mastercard) ووسائل الدفع المحلية المعتمدة (بنكيلي، مصرفي، السداد).',
                  'Cartes Visa / Mastercard et transferts locaux mauritaniens (Bankily, Masrvi, Sedad).',
                  'Global Visa / Mastercard cards and Mauritanian local apps (Bankily, Masrvi, Sedad).'
                )}
              </p>
              <button
                type="button"
                className="mock"
                onClick={() => navigate('exams', { examMode: 'official_sim' })}
              >
                <b>
                  {tr(
                    lang,
                    'المحاكاة الرسمية (70 سؤالاً)',
                    'Simulation officielle (70 questions)',
                    'Official Simulation (70 Questions)'
                  )}
                </b>
                <span>»</span>
              </button>
            </div>

            {/* Column 4: Contact & Social */}
            <div className="col rv" style={{ '--n': 4 } as React.CSSProperties}>
              <h3>{tr(lang, 'تواصل معنا', 'Contactez-nous', 'Contact Us')}</h3>
              <ul>
                <li>
                  <button type="button" className="lk" onClick={() => navigate('support')}>
                    {tr(lang, 'الدعم والتواصل', 'Support et contact', 'Support & Contact')}
                  </button>
                </li>
                <li>
                  <button type="button" className="lk" onClick={() => navigate('contact')}>
                    {tr(lang, 'تواصل بنا', 'Nous contacter', 'Contact Us')}
                  </button>
                </li>
                <li>
                  <button type="button" className="lk" onClick={() => navigate('report')}>
                    {tr(lang, 'الإبلاغ عن مشكلة', 'Signaler un problème', 'Report an Issue')}
                  </button>
                </li>
              </ul>
              <a className="mail" href="mailto:abdarrahmannagi@gmail.com">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M3 7l9 6 9-6" />
                </svg>
                abdarrahmannagi@gmail.com
              </a>
              <div className="soc">
                <a
                  href="https://wa.me/22247526504"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="واتساب"
                  style={{ '--n': 0 } as React.CSSProperties}
                  onMouseMove={handleSocMove}
                  onMouseLeave={handleSocLeave}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 21l1.6-4.8A9 9 0 1 1 8 19.5z" />
                    <path d="M9 9c0 3 3 6 6 6l1-2-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2z" />
                  </svg>
                </a>
                <a
                  href="https://www.facebook.com/abdarrahman.nagi/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="فيسبوك"
                  style={{ '--n': 1 } as React.CSSProperties}
                  onMouseMove={handleSocMove}
                  onMouseLeave={handleSocLeave}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z" />
                  </svg>
                </a>
                <a
                  href="https://www.instagram.com/abdarrahmannagi?igshid=OGQ5ZDc2ODk2ZA%3D%3D"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="إنستغرام"
                  style={{ '--n': 2 } as React.CSSProperties}
                  onMouseMove={handleSocMove}
                  onMouseLeave={handleSocLeave}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="5" />
                    <circle cx="12" cy="12" r="4" />
                    <path d="M17.5 6.5h.01" />
                  </svg>
                </a>
                <a
                  href="https://www.tiktok.com/@abdarrahman_nagi?_t=8iFCfbQM0AA&_r=1"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="تيك توك"
                  style={{ '--n': 3 } as React.CSSProperties}
                  onMouseMove={handleSocMove}
                  onMouseLeave={handleSocLeave}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M15 3v10.5a4 4 0 1 1-4-4" />
                    <path d="M15 3c.3 2.4 2 4.2 5 4.5" />
                  </svg>
                </a>
                <a
                  href="https://www.youtube.com/@abdarrahman_nagi"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="يوتيوب"
                  style={{ '--n': 4 } as React.CSSProperties}
                  onMouseMove={handleSocMove}
                  onMouseLeave={handleSocLeave}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="2" y="5" width="20" height="14" rx="4" />
                    <path d="M10 9l5 3-5 3z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>

          {/* Bottom Bar: Right-aligned compact Partner CHTBQI (no white bg) + Location & Copyright */}
          <div className="bar rv" style={{ '--n': 5 } as React.CSSProperties}>
            <div className="collab">
              <span className="cl">
                {tr(lang, 'بالتعاون مع', 'En partenariat avec', 'In partnership with')}
              </span>
              <a
                className="pl-clean"
                href="https://chtbqi.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="شتبقي CHTBQI"
              >
                <img
                  src="/assets/images/chtbqi-logo.webp"
                  alt="شعار شتبقي CHTBQI"
                  width={124}
                  height={38}
                />
              </a>
            </div>
            <div className="bar-meta">
              <span className="pin">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z" />
                  <circle cx="12" cy="10" r="2.5" />
                </svg>
                {tr(lang, 'العيون، موريتانيا', 'Aioun, Mauritanie', 'Aioun, Mauritania')}
              </span>
              <span>
                {tr(
                  lang,
                  'منصة التدريب الحر – Plateforme de Formation Libre © 2026. كافة الحقوق محفوظة.',
                  'منصة التدريب الحر – Plateforme de Formation Libre © 2026. Tous droits réservés.',
                  'Free Training Platform – Plateforme de Formation Libre © 2026. All rights reserved.'
                )}
              </span>
            </div>
            <div aria-hidden="true" />
          </div>
        </div>
      </footer>

      {/* Circular Scroll Progress Back-to-Top Button */}
      <button
        type="button"
        className={`top${showTop ? ' show' : ''}`}
        aria-label={tr(lang, 'العودة إلى الأعلى', 'Haut de page', 'Back to top')}
        onClick={scrollToTop}
      >
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <circle className="bg" cx="24" cy="24" r="21" />
          <circle
            className="pr"
            cx="24"
            cy="24"
            r="21"
            style={{ strokeDashoffset: dashOffset }}
          />
        </svg>
        <svg className="ar" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>
    </div>
  );
};
