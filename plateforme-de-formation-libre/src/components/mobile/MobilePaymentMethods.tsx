import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Lock,
  Smartphone,
  Star,
  Trash2,
  Wallet,
} from 'lucide-react';
import { PAYMENT_LOGO_URLS } from '../PaymentBrandBadges';
import { useApp } from '../../context/AppContext';
import type { Language } from '../../types';
import { tr } from '../../utils/locale';
import { MobileDarkSheet, MobileListRow } from './MobilePrimitives';

export type MobilePaymentMethodId = 'sedad' | 'masrvi' | 'bankily' | 'visa' | 'mastercard';

export interface SavedCardPreview {
  brand: 'visa' | 'mastercard';
  last4: string;
  expMonth: string;
  expYear: string;
  holder: string;
}

export interface MobilePaymentPreferences {
  defaultMethod: MobilePaymentMethodId;
  walletPhones: Partial<Record<'sedad' | 'masrvi' | 'bankily', string>>;
  /**
   * SECURITY: Stores ONLY non-sensitive display metadata (brand, last4, expiry, holder name).
   * Full card numbers (PAN) and CVC codes are NEVER stored anywhere in state, localStorage, or API calls.
   */
  savedCardPreview: Partial<Record<'visa' | 'mastercard', SavedCardPreview>>;
}

function getPrefsKey(uid?: string): string {
  return `tdr_m_pay_prefs_${uid || 'guest'}`;
}

export function loadMobilePaymentPrefs(uid?: string): MobilePaymentPreferences {
  try {
    const raw = window.localStorage.getItem(getPrefsKey(uid));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MobilePaymentPreferences>;
      return {
        defaultMethod: parsed.defaultMethod || 'sedad',
        walletPhones: parsed.walletPhones || {},
        savedCardPreview: parsed.savedCardPreview || {},
      };
    }
  } catch {
    // ignore storage restriction
  }
  return {
    defaultMethod: 'sedad',
    walletPhones: {},
    savedCardPreview: {},
  };
}

export function saveMobilePaymentPrefs(uid: string | undefined, prefs: MobilePaymentPreferences): void {
  try {
    window.localStorage.setItem(getPrefsKey(uid), JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

/** Standard Luhn checksum validation — never persists the PAN */
function passesLuhn(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

export const PaymentMethodBadgeIcon: React.FC<{ method: MobilePaymentMethodId }> = ({ method }) => {
  if (method === 'sedad' || method === 'masrvi' || method === 'bankily') {
    return (
      <img
        src={PAYMENT_LOGO_URLS[method]}
        alt={method}
        className="w-6 h-6 object-contain rounded-full bg-white p-0.5"
        loading="lazy"
      />
    );
  }
  if (method === 'visa') {
    return (
      <span className="font-black italic text-[10px] tracking-tight" style={{ color: 'var(--m-brand-deep)' }}>
        VISA
      </span>
    );
  }
  return <CreditCard className="w-5 h-5" />;
};

export interface PaymentMethodDescriptor {
  id: MobilePaymentMethodId;
  titleAr: string;
  titleFr: string;
  titleEn: string;
  accountInfoAr: string;
  accountInfoFr: string;
  kind: 'local_wallet' | 'hosted_card';
  accountNumber?: string;
  beneficiary?: string;
}

export const OFFICIAL_MOBILE_PAYMENT_METHODS: PaymentMethodDescriptor[] = [
  {
    id: 'sedad',
    titleAr: 'السداد (Sedad)',
    titleFr: 'Sedad',
    titleEn: 'Sedad',
    accountInfoAr: 'تحويل محلي مباشر مع رفع إيصال السداد',
    accountInfoFr: 'Transfert local direct avec reçu Sedad',
    kind: 'local_wallet',
  },
  {
    id: 'masrvi',
    titleAr: 'مصرفي (Masrvi)',
    titleFr: 'Masrvi',
    titleEn: 'Masrvi',
    accountInfoAr: 'تحويل محلي عبر تطبيق مصرفي ورفع الإيصال',
    accountInfoFr: 'Transfert Masrvi avec vérification du reçu',
    kind: 'local_wallet',
  },
  {
    id: 'bankily',
    titleAr: 'بنكيلي (Bankily)',
    titleFr: 'Bankily',
    titleEn: 'Bankily',
    accountInfoAr: 'دفع محلي عبر بنكيلي وتحقق فوري من الإيصال',
    accountInfoFr: 'Paiement Bankily avec reçu',
    kind: 'local_wallet',
  },
  {
    id: 'visa',
    titleAr: 'بطاقة Visa',
    titleFr: 'Carte Visa',
    titleEn: 'Visa Card',
    accountInfoAr: 'الدفع الإلكتروني عبر بوابة NardoPay الآمنة',
    accountInfoFr: 'Paiement sécurisé via NardoPay',
    kind: 'hosted_card',
  },
  {
    id: 'mastercard',
    titleAr: 'بطاقة Mastercard',
    titleFr: 'Carte Mastercard',
    titleEn: 'Mastercard',
    accountInfoAr: 'الدفع الإلكتروني عبر بوابة NardoPay الآمنة',
    accountInfoFr: 'Paiement sécurisé via NardoPay',
    kind: 'hosted_card',
  },
];

export const MobilePaymentMethodsScreen: React.FC<{
  onOpenSubscriptions: (preselectMethod?: MobilePaymentMethodId) => void;
  onNotice: (text: string, ok?: boolean) => void;
}> = ({ onOpenSubscriptions, onNotice }) => {
  const { lang, user, paymentMethods: serverMethods } = useApp();
  const isAr = lang === 'ar';

  const [prefs, setPrefs] = useState<MobilePaymentPreferences>(() => loadMobilePaymentPrefs(user?.uid));
  const [editingMethod, setEditingMethod] = useState<PaymentMethodDescriptor | null>(null);
  const [confirmRemoveMethod, setConfirmRemoveMethod] = useState<MobilePaymentMethodId | null>(null);

  // Ephemeral sheet form state — NEVER persisted for cards
  const [walletPhoneInput, setWalletPhoneInput] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [copiedNum, setCopiedNum] = useState(false);

  useEffect(() => {
    setPrefs(loadMobilePaymentPrefs(user?.uid));
  }, [user?.uid]);

  const getServerConfig = (id: MobilePaymentMethodId) =>
    serverMethods.find((m) => m.code.toLowerCase() === id);

  const openEditor = (desc: PaymentMethodDescriptor) => {
    setSheetError(null);
    setCardNumber('');
    setCardCvc('');
    setCopiedNum(false);
    if (desc.kind === 'local_wallet') {
      setWalletPhoneInput(prefs.walletPhones[desc.id as 'sedad' | 'masrvi' | 'bankily'] || user?.phone || '');
    } else {
      const existing = prefs.savedCardPreview[desc.id as 'visa' | 'mastercard'];
      setCardHolder(existing?.holder || user?.name || '');
      setCardExpiry(existing ? `${existing.expMonth}/${existing.expYear}` : '');
    }
    setEditingMethod(desc);
  };

  const updatePrefs = (next: MobilePaymentPreferences) => {
    setPrefs(next);
    saveMobilePaymentPrefs(user?.uid, next);
  };

  const handleSaveWallet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMethod || editingMethod.kind !== 'local_wallet') return;
    const digits = walletPhoneInput.replace(/\D/g, '');
    if (digits.length < 8) {
      setSheetError(
        tr(lang, 'أدخل رقم هاتف صحيحاً (8 أرقام على الأقل).', 'Numéro invalide (8 chiffres min).', 'Enter a valid 8+ digit phone.')
      );
      return;
    }
    const id = editingMethod.id as 'sedad' | 'masrvi' | 'bankily';
    const next: MobilePaymentPreferences = {
      ...prefs,
      walletPhones: { ...prefs.walletPhones, [id]: walletPhoneInput.trim() },
    };
    updatePrefs(next);
    setEditingMethod(null);
    onNotice(tr(lang, 'تم حفظ رقم التحويل المفضل.', 'Numéro enregistré.', 'Wallet preference saved.'));
  };

  const handleSaveCardPreview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMethod || editingMethod.kind !== 'hosted_card') return;
    const brand = editingMethod.id as 'visa' | 'mastercard';
    const digits = cardNumber.replace(/\D/g, '');
    const expMatch = cardExpiry.trim().match(/^(\d{2})\/(\d{2})$/);
    const cvcDigits = cardCvc.replace(/\D/g, '');

    if (cardHolder.trim().length < 2) {
      setSheetError(tr(lang, 'أدخل اسم حامل البطاقة.', 'Nom du titulaire requis.', 'Cardholder name required.'));
      return;
    }
    if (!passesLuhn(digits)) {
      setSheetError(tr(lang, 'رقم البطاقة غير صالح.', 'Numéro de carte invalide.', 'Invalid card number.'));
      return;
    }
    if (!expMatch || Number(expMatch[1]) < 1 || Number(expMatch[1]) > 12) {
      setSheetError(tr(lang, 'صيغة الانتهاء غير صحيحة (MM/YY).', 'Expiration invalide (MM/YY).', 'Invalid expiry (MM/YY).'));
      return;
    }
    if (cvcDigits.length < 3 || cvcDigits.length > 4) {
      setSheetError(tr(lang, 'رمز CVC يجب أن يكون 3 أو 4 أرقام.', 'CVC à 3 ou 4 chiffres requis.', 'Invalid CVC.'));
      return;
    }

    // Store ONLY masked last4 + expiry + holder (NEVER store full PAN or CVC)
    const preview: SavedCardPreview = {
      brand,
      last4: digits.slice(-4),
      expMonth: expMatch[1],
      expYear: expMatch[2],
      holder: cardHolder.trim(),
    };
    // Clear sensitive inputs immediately
    setCardNumber('');
    setCardCvc('');

    const next: MobilePaymentPreferences = {
      ...prefs,
      savedCardPreview: { ...prefs.savedCardPreview, [brand]: preview },
    };
    updatePrefs(next);
    setEditingMethod(null);
    onNotice(
      tr(
        lang,
        `تم حفظ تفضيل البطاقة المنتهية بـ ${preview.last4} للعرض فقط (الدفع الفعلي عبر NardoPay).`,
        `Préférence enregistrée (•••• ${preview.last4}).`,
        `Masked card •••• ${preview.last4} saved (charges run via NardoPay).`
      )
    );
  };

  const handleSetDefault = (id: MobilePaymentMethodId) => {
    updatePrefs({ ...prefs, defaultMethod: id });
    onNotice(tr(lang, 'تم تعيين وسيلة الدفع الافتراضية.', 'Moyen de paiement par défaut mis à jour.', 'Default method updated.'));
  };

  const handleRemoveSaved = (id: MobilePaymentMethodId) => {
    const next: MobilePaymentPreferences = {
      ...prefs,
      walletPhones: { ...prefs.walletPhones },
      savedCardPreview: { ...prefs.savedCardPreview },
    };
    if (id === 'sedad' || id === 'masrvi' || id === 'bankily') {
      delete next.walletPhones[id];
    } else {
      delete next.savedCardPreview[id];
    }
    updatePrefs(next);
    setConfirmRemoveMethod(null);
    setEditingMethod(null);
    onNotice(tr(lang, 'تمت إزالة البيانات المحفوظة للوسيلة.', 'Données supprimées.', 'Saved details removed.'));
  };

  return (
    <div className="space-y-3.5">
      <div className="tdr-m-hero-card space-y-1.5">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5" />
          <h2 className="text-base font-extrabold tdr-m-kufi">
            {tr(lang, 'طرق الدفع المعتمدة', 'Moyens de paiement', 'Payment Methods')}
          </h2>
        </div>
        <p className="text-xs opacity-90 leading-relaxed">
          {tr(
            lang,
            'اختر وسيلة الدفع الافتراضية لاشتراكاتك: التحويلات المحلية الموريتانية (السداد، مصرفي، بنكيلي) أو البطاقات البنكية عبر NardoPay.',
            'Choisissez votre moyen par défaut : portefeuilles locaux ou cartes via NardoPay.',
            'Manage your default payment method for subscriptions.'
          )}
        </p>
      </div>

      <div className="space-y-2.5">
        {OFFICIAL_MOBILE_PAYMENT_METHODS.map((m) => {
          const isDefault = prefs.defaultMethod === m.id;
          const srv = getServerConfig(m.id);
          const savedWallet =
            m.kind === 'local_wallet' ? prefs.walletPhones[m.id as 'sedad' | 'masrvi' | 'bankily'] : undefined;
          const savedCard =
            m.kind === 'hosted_card' ? prefs.savedCardPreview[m.id as 'visa' | 'mastercard'] : undefined;

          let sub = isAr ? m.accountInfoAr : m.accountInfoFr;
          if (savedWallet) {
            sub = `${tr(lang, 'رقم الإرسال:', 'Émetteur :', 'Sender:')} ${savedWallet}`;
          } else if (savedCard) {
            sub = `•••• ${savedCard.last4} (${savedCard.expMonth}/${savedCard.expYear})`;
          } else if (srv?.account_number) {
            sub = `${tr(lang, 'الحساب الرسمي:', 'Compte :', 'Account:')} ${srv.account_number}`;
          }

          return (
            <MobileListRow
              key={m.id}
              dir={isAr ? 'rtl' : 'ltr'}
              icon={<PaymentMethodBadgeIcon method={m.id} />}
              title={isAr ? m.titleAr : m.titleFr}
              subtitle={sub}
              trailing={
                <div className="flex items-center gap-1.5">
                  {isDefault && (
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold"
                      style={{
                        background: 'var(--m-brand-soft)',
                        color: 'var(--m-brand-deep)',
                        border: '1px solid var(--m-brand-border)',
                      }}
                    >
                      {tr(lang, 'افتراضي', 'Par défaut', 'Default')}
                    </span>
                  )}
                </div>
              }
              onClick={() => openEditor(m)}
            />
          );
        })}
      </div>

      {/* Security & Integration Transparency Note */}
      <div
        className="tdr-m-card p-3.5 flex items-start gap-2.5 text-xs"
        style={{ color: 'var(--m-ink-sub)' }}
      >
        <Lock className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--m-brand-d)' }} />
        <span className="leading-relaxed">
          {tr(
            lang,
            'السداد ومصرفي وبنكيلي متصلة فعلياً بنظام التحقق الآلي من الإيصالات. بطاقات Visa وMastercard تتم معالجتها عبر بوابة NardoPay المستضافة دون حفظ أرقام البطاقات أو رمز CVC على الجهاز أو الخادم.',
            'Sedad, Masrvi et Bankily sont connectés au vérificateur de reçus. Visa/Mastercard passent par NardoPay hébergé sans stocker les numéros.',
            'Local wallets connect to receipt verification; Visa/Mastercard run via hosted NardoPay checkout with zero PAN/CVC storage.'
          )}
        </span>
      </div>

      {/* Bottom Sheet Editor for Selected Method */}
      <MobileDarkSheet
        open={Boolean(editingMethod)}
        onClose={() => setEditingMethod(null)}
        icon={
          editingMethod?.kind === 'local_wallet' ? (
            <Smartphone className="w-6 h-6" />
          ) : (
            <CreditCard className="w-6 h-6" />
          )
        }
        title={
          editingMethod
            ? isAr
              ? editingMethod.titleAr
              : editingMethod.titleFr
            : ''
        }
        description={
          editingMethod?.kind === 'local_wallet'
            ? getServerConfig(editingMethod.id)?.instructions_ar ||
              (isAr ? editingMethod.accountInfoAr : editingMethod.accountInfoFr)
            : tr(
                lang,
                'يُستخدم هذا التفضيل للعرض السريع فقط؛ الدفع الفعلي للبطاقة يتم عبر نافذة NardoPay المشفرة.',
                'Préférence visuelle uniquement ; le débit réel s’effectue via NardoPay.',
                'UI preference only; real charges run on hosted NardoPay.'
              )
        }
      >
        {editingMethod && (
          <div className="space-y-3">
            {sheetError && (
              <div
                className="p-2.5 rounded-xl text-xs font-bold text-center"
                style={{ background: 'rgba(184,0,0,0.22)', color: '#ffb3b3' }}
              >
                {sheetError}
              </div>
            )}

            {/* Local Wallet Editor */}
            {editingMethod.kind === 'local_wallet' && (
              <form onSubmit={handleSaveWallet} className="space-y-3">
                {getServerConfig(editingMethod.id)?.account_number && (
                  <div
                    className="p-3 rounded-xl flex items-center justify-between gap-2 text-xs"
                    style={{ background: 'var(--m-sheet-btn)' }}
                  >
                    <div>
                      <div className="opacity-75">
                        {tr(lang, 'حساب المستفيد الرسمي', 'Compte bénéficiaire', 'Beneficiary Account')}
                      </div>
                      <div className="font-extrabold text-sm mt-0.5 tabular-nums" dir="ltr">
                        {getServerConfig(editingMethod.id)?.account_number}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const acc = getServerConfig(editingMethod.id)?.account_number || '';
                        navigator.clipboard?.writeText(acc).catch(() => {});
                        setCopiedNum(true);
                        window.setTimeout(() => setCopiedNum(false), 1800);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                      style={{ background: 'rgba(164, 204, 57, 0.2)', color: '#a4cc39' }}
                    >
                      {copiedNum ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedNum ? tr(lang, 'نُسخ', 'Copié', 'Copied') : tr(lang, 'نسخ', 'Copier', 'Copy')}</span>
                    </button>
                  </div>
                )}

                <div>
                  <label className="block text-xs mb-1.5" style={{ color: 'var(--m-sheet-sub)' }}>
                    {tr(lang, 'رقم هاتفك للتحويل (اختياري)', 'Votre téléphone émetteur', 'Your Sender Phone')}
                  </label>
                  <input
                    type="tel"
                    dir="ltr"
                    placeholder="22 00 00 00"
                    className="tdr-m-sheet-input"
                    value={walletPhoneInput}
                    onChange={(e) => setWalletPhoneInput(e.target.value)}
                  />
                </div>

                <button type="submit" className="tdr-m-sheet-btn tdr-m-sheet-btn--primary">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{tr(lang, 'حفظ رقم الإرسال', 'Enregistrer le numéro', 'Save Phone')}</span>
                </button>
              </form>
            )}

            {/* Visa / Mastercard Validated Masked Preview Form */}
            {editingMethod.kind === 'hosted_card' && (
              <form onSubmit={handleSaveCardPreview} className="space-y-2.5">
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--m-sheet-sub)' }}>
                    {tr(lang, 'اسم حامل البطاقة', 'Titulaire de la carte', 'Cardholder Name')}
                  </label>
                  <input
                    type="text"
                    className="tdr-m-sheet-input"
                    placeholder="MOHAMED AHMED"
                    value={cardHolder}
                    onChange={(e) => setCardHolder(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--m-sheet-sub)' }}>
                    {tr(lang, 'رقم البطاقة (للتحقق فقط)', 'Numéro de carte', 'Card Number (validated only)')}
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    dir="ltr"
                    autoComplete="off"
                    placeholder={
                      editingMethod.id === 'visa' ? '4••• •••• •••• ••••' : '5••• •••• •••• ••••'
                    }
                    className="tdr-m-sheet-input"
                    value={cardNumber}
                    onChange={(e) =>
                      setCardNumber(
                        e.target.value
                          .replace(/\D/g, '')
                          .slice(0, 16)
                          .replace(/(.{4})/g, '$1 ')
                          .trim()
                      )
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--m-sheet-sub)' }}>
                      {tr(lang, 'تاريخ الانتهاء', 'Expiration', 'Expiry')}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      placeholder="MM/YY"
                      maxLength={5}
                      className="tdr-m-sheet-input"
                      value={cardExpiry}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setCardExpiry(raw.length > 2 ? `${raw.slice(0, 2)}/${raw.slice(2)}` : raw);
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--m-sheet-sub)' }}>
                      CVC
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      dir="ltr"
                      autoComplete="off"
                      placeholder="•••"
                      maxLength={4}
                      className="tdr-m-sheet-input"
                      value={cardCvc}
                      onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    />
                  </div>
                </div>
                <button type="submit" className="tdr-m-sheet-btn tdr-m-sheet-btn--primary">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{tr(lang, 'تحقق وحفظ القناع (آخر 4 أرقام)', 'Valider et enregistrer', 'Validate & Save Last 4')}</span>
                </button>
              </form>
            )}

            {/* Common Sheet Actions */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleSetDefault(editingMethod.id)}
                className="tdr-m-sheet-btn"
              >
                <Star className="w-4 h-4" />
                <span>{tr(lang, 'تعيين كافتراضي', 'Par défaut', 'Set Default')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = editingMethod.id;
                  setEditingMethod(null);
                  onOpenSubscriptions(id);
                }}
                className="tdr-m-sheet-btn"
              >
                <Wallet className="w-4 h-4" />
                <span>{tr(lang, 'اشترك الآن', 'S’abonner', 'Subscribe')}</span>
              </button>
            </div>

            {((editingMethod.kind === 'local_wallet' &&
              prefs.walletPhones[editingMethod.id as 'sedad' | 'masrvi' | 'bankily']) ||
              (editingMethod.kind === 'hosted_card' &&
                prefs.savedCardPreview[editingMethod.id as 'visa' | 'mastercard'])) && (
              <button
                type="button"
                onClick={() => setConfirmRemoveMethod(editingMethod.id)}
                className="tdr-m-sheet-btn tdr-m-sheet-btn--danger"
              >
                <Trash2 className="w-4 h-4" />
                <span>{tr(lang, 'إزالة الطريقة المحفوظة', 'Supprimer', 'Remove Saved')}</span>
              </button>
            )}
          </div>
        )}
      </MobileDarkSheet>

      {/* Removal Confirmation Sheet */}
      <MobileDarkSheet
        open={Boolean(confirmRemoveMethod)}
        onClose={() => setConfirmRemoveMethod(null)}
        icon={<Trash2 className="w-6 h-6" />}
        title={tr(lang, 'إزالة بيانات الدفع المحفوظة؟', 'Supprimer ce moyen ?', 'Remove saved method?')}
        description={tr(
          lang,
          'سيتم مسح البيانات المحلية المحفوظة لهذه الوسيلة من جهازك فقط.',
          'Les préférences locales de ce moyen seront effacées.',
          'Saved local preferences for this method will be cleared.'
        )}
      >
        <button
          type="button"
          onClick={() => confirmRemoveMethod && handleRemoveSaved(confirmRemoveMethod)}
          className="tdr-m-sheet-btn tdr-m-sheet-btn--danger"
        >
          {tr(lang, 'نعم، إزالة', 'Oui, supprimer', 'Yes, Remove')}
        </button>
        <button
          type="button"
          onClick={() => setConfirmRemoveMethod(null)}
          className="tdr-m-sheet-btn"
        >
          {tr(lang, 'إلغاء', 'Annuler', 'Cancel')}
        </button>
      </MobileDarkSheet>
    </div>
  );
};
