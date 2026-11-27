import React, { useEffect, useState } from 'react';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { AlertCircle, Clock } from 'lucide-react';
import {
  AuthButton,
  AuthOkCheckmark,
  AuthPasswordField,
  AuthShell,
  AuthTitle,
} from '../components/AuthShell';
import { useApp } from '../context/AppContext';
import { auth, translateFirebaseAuthError } from '../lib/firebase';
import { apiRequest } from '../utils/api';
import { tr } from '../utils/locale';

type TokenStatus = 'checking' | 'valid' | 'expired' | 'used' | 'invalid' | 'success';

export const ResetPasswordPage: React.FC = () => {
  const { lang, viewParams, navigate } = useApp();
  const isAr = lang === 'ar';

  const sp =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const resetToken = (viewParams.resetToken || sp?.get('token') || '').trim();
  const actionToken = (viewParams.actionToken || sp?.get('at') || '').trim();
  const oobCode = (viewParams.oobCode || sp?.get('oobCode') || '').trim();

  const [status, setStatus] = useState<TokenStatus>('checking');
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [targetEmail, setTargetEmail] = useState<string>('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const validate = async () => {
      if (!resetToken && !actionToken && !oobCode) {
        if (!active) return;
        setStatus('invalid');
        setStatusMsg(
          tr(
            lang,
            'رابط استعادة كلمة المرور غير صالح أو منقوص.',
            'Lien de réinitialisation invalide ou incomplet.',
            'Invalid or incomplete password reset link.'
          )
        );
        return;
      }

      try {
        if (resetToken) {
          const res = await apiRequest<{
            valid: boolean;
            remainingSeconds?: number;
          }>(`/api/auth/reset-token-status?token=${encodeURIComponent(resetToken)}`);
          if (!active) return;
          if (res.valid) {
            setRemainingSeconds(res.remainingSeconds ?? 300);
            setStatus('valid');
          } else {
            setStatus('invalid');
          }
          return;
        }

        if (actionToken) {
          const res = await apiRequest<{
            valid: boolean;
            email?: string;
            remainingSeconds?: number;
          }>(`/api/auth/reset-token-status?at=${encodeURIComponent(actionToken)}`);
          if (!active) return;
          if (!res.valid) {
            setStatus('invalid');
            return;
          }
          if (oobCode) {
            const fbEmail = await verifyPasswordResetCode(auth, oobCode);
            if (!active) return;
            setTargetEmail(fbEmail || res.email || '');
          } else if (res.email) {
            setTargetEmail(res.email);
          }
          setRemainingSeconds(res.remainingSeconds ?? 300);
          setStatus('valid');
          return;
        }

        if (oobCode) {
          const fbEmail = await verifyPasswordResetCode(auth, oobCode);
          if (!active) return;
          setTargetEmail(fbEmail || '');
          setStatus('valid');
        }
      } catch (err: any) {
        if (!active) return;
        const code = err?.data?.code || err?.code || '';
        if (code === 'TOKEN_EXPIRED') {
          setStatus('expired');
          setStatusMsg(
            err?.message ||
              tr(
                lang,
                'انتهت صلاحية رابط استعادة كلمة المرور (الحد الأقصى 5 دقائق). يرجى طلب رابط جديد.',
                'Ce lien a expiré (durée maximale de 5 minutes). Veuillez en demander un nouveau.',
                'This password reset link has expired (5-minute limit). Please request a new one.'
              )
          );
        } else if (code === 'TOKEN_ALREADY_USED') {
          setStatus('used');
          setStatusMsg(
            err?.message ||
              tr(
                lang,
                'تم استخدام رابط استعادة كلمة المرور هذا مسبقاً. كل رابط صالح لمرة واحدة فقط.',
                'Ce lien à usage unique a déjà été utilisé.',
                'This single-use reset link has already been used.'
              )
          );
        } else if (typeof code === 'string' && code.startsWith('auth/')) {
          setStatus(code === 'auth/expired-action-code' ? 'expired' : 'invalid');
          setStatusMsg(translateFirebaseAuthError(err, lang));
        } else {
          setStatus('invalid');
          setStatusMsg(
            err?.message ||
              tr(
                lang,
                'رابط استعادة كلمة المرور غير صالح.',
                'Lien de réinitialisation invalide.',
                'Invalid password reset link.'
              )
          );
        }
      }
    };

    void validate();
    return () => {
      active = false;
    };
  }, [resetToken, actionToken, oobCode, lang]);

  // Countdown tick for the 5-minute window
  useEffect(() => {
    if (status !== 'valid' || remainingSeconds === null) return;
    if (remainingSeconds <= 0) {
      setStatus('expired');
      setStatusMsg(
        tr(
          lang,
          'انتهت مهلة الـ 5 دقائق المحددة لهذا الرابط. يرجى طلب رابط جديد.',
          'Le délai de 5 minutes pour ce lien est écoulé.',
          'The 5-minute validity window for this link has expired.'
        )
      );
      return;
    }
    const iv = window.setInterval(() => {
      setRemainingSeconds((prev) => (prev === null ? null : Math.max(0, prev - 1)));
    }, 1000);
    return () => window.clearInterval(iv);
  }, [status, remainingSeconds, lang]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (newPassword.length < 8) {
      setFormError(
        tr(
          lang,
          'يجب أن تتكون كلمة المرور الجديدة من 8 أحرف على الأقل.',
          'Le nouveau mot de passe doit contenir au moins 8 caractères.',
          'New password must be at least 8 characters long.'
        )
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError(
        tr(
          lang,
          'كلمتا المرور غير متطابقتين.',
          'Les mots de passe ne correspondent pas.',
          'Passwords do not match.'
        )
      );
      return;
    }

    setBusy(true);
    try {
      if (resetToken) {
        await apiRequest('/api/auth/reset-password', {
          method: 'POST',
          json: { token: resetToken, newPassword },
        });
        setStatus('success');
        return;
      }

      if (actionToken) {
        await apiRequest('/api/auth/action-tokens/consume', {
          method: 'POST',
          json: { purpose: 'password_reset', token: actionToken },
        });
      }

      if (oobCode) {
        await confirmPasswordReset(auth, oobCode, newPassword);
      }

      setStatus('success');
    } catch (err: any) {
      const code = err?.data?.code || err?.code || '';
      if (code === 'TOKEN_EXPIRED') {
        setStatus('expired');
        setStatusMsg(err?.message);
      } else if (code === 'TOKEN_ALREADY_USED') {
        setStatus('used');
        setStatusMsg(err?.message);
      } else if (typeof code === 'string' && code.startsWith('auth/')) {
        setFormError(translateFirebaseAuthError(err, lang));
      } else {
        setFormError(
          err?.message ||
            tr(
              lang,
              'تعذر تعيين كلمة المرور الجديدة.',
              'Impossible de modifier le mot de passe.',
              'Failed to reset password.'
            )
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <AuthShell>
      <AuthTitle>
        {tr(lang, 'تعيين كلمة مرور جديدة', 'Nouveau mot de passe', 'Reset Password')}
      </AuthTitle>
      <div className="tag in" style={{ '--i': 1 } as React.CSSProperties}>
        {tr(
          lang,
          'رابط آمن صالح لمدة 5 دقائق فقط ويُستخدم لمرة واحدة.',
          'Lien sécurisé valable 5 minutes à usage unique.',
          'Secure single-use link valid for 5 minutes.'
        )}
      </div>

      <div className="box in" style={{ '--i': 2 } as React.CSSProperties}>
        {status === 'checking' && (
          <div className="py-8 text-center text-xs font-bold opacity-80">
            {tr(
              lang,
              'جارٍ التحقق من صلاحية رابط الاستعادة...',
              'Vérification du lien en cours...',
              'Validating reset link...'
            )}
          </div>
        )}

        {(status === 'expired' || status === 'used' || status === 'invalid') && (
          <div className="pn center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-50 border border-red-200 text-red-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="hd">
              {status === 'expired'
                ? tr(lang, 'انتهت صلاحية الرابط', 'Lien expiré', 'Link Expired')
                : status === 'used'
                  ? tr(lang, 'رابط مستخدم مسبقاً', 'Lien déjà utilisé', 'Link Already Used')
                  : tr(lang, 'رابط غير صالح', 'Lien invalide', 'Invalid Link')}
            </h2>
            <p className="mut">{statusMsg}</p>
            <div className="flex flex-col gap-2">
              <AuthButton type="button" full onClick={() => navigate('forgot-password')}>
                {tr(
                  lang,
                  'طلب رابط استعادة جديد',
                  'Demander un nouveau lien',
                  'Request a New Reset Link'
                )}
              </AuthButton>
              <button
                type="button"
                className="lnk"
                onClick={() => navigate('login')}
              >
                {tr(lang, 'العودة لتسجيل الدخول', 'Retour à la connexion', 'Back to Login')}
              </button>
            </div>
          </div>
        )}

        {status === 'valid' && (
          <form onSubmit={handleSubmit} className="pn space-y-4" noValidate>
            {remainingSeconds !== null && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-[6px] bg-[#f9fcf2] border border-[#A6CE39] text-xs font-bold text-[#384D55]">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-[#557a16]" />
                  <span>
                    {tr(
                      lang,
                      'الوقت المتبقي لصلاحية الرابط:',
                      'Temps restant :',
                      'Link expires in:'
                    )}
                  </span>
                </span>
                <span className="font-mono text-[#456810]" dir="ltr">
                  {formatCountdown(remainingSeconds)}
                </span>
              </div>
            )}

            {targetEmail && (
              <div className="text-xs opacity-80" dir="ltr">
                {targetEmail}
              </div>
            )}

            {formError && (
              <div className="ferr show" role="alert">
                {formError}
              </div>
            )}

            <AuthPasswordField
              id="rp-new"
              label={tr(
                lang,
                'كلمة المرور الجديدة (8 أحرف على الأقل):',
                'Nouveau mot de passe (8 car. min) :',
                'New password (min 8 chars):'
              )}
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
              ariaShowLabel={tr(lang, 'إظهار', 'Afficher', 'Show')}
              ariaHideLabel={tr(lang, 'إخفاء', 'Masquer', 'Hide')}
            />

            <AuthPasswordField
              id="rp-confirm"
              label={tr(
                lang,
                'تأكيد كلمة المرور الجديدة:',
                'Confirmer le mot de passe :',
                'Confirm new password:'
              )}
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              ariaShowLabel={tr(lang, 'إظهار', 'Afficher', 'Show')}
              ariaHideLabel={tr(lang, 'إخفاء', 'Masquer', 'Hide')}
            />

            <AuthButton type="submit" full loading={busy}>
              {tr(
                lang,
                'حفظ كلمة المرور الجديدة',
                'Enregistrer le nouveau mot de passe',
                'Save New Password'
              )}
            </AuthButton>
          </form>
        )}

        {status === 'success' && (
          <div className="pn center space-y-4">
            <AuthOkCheckmark />
            <h2 className="hd">
              {tr(
                lang,
                'تم تحديث كلمة المرور بنجاح',
                'Mot de passe mis à jour',
                'Password Updated Successfully'
              )}
            </h2>
            <p className="mut">
              {isAr
                ? 'تم اعتماد كلمة المرور الجديدة وإبطال هذا الرابط نهائياً. يمكنك الآن تسجيل الدخول.'
                : 'Votre nouveau mot de passe est actif et ce lien a été invalidé.'}
            </p>
            <AuthButton type="button" full onClick={() => navigate('login')}>
              {tr(lang, 'تسجيل الدخول الآن', 'Se connecter', 'Sign In Now')}
            </AuthButton>
          </div>
        )}
      </div>
    </AuthShell>
  );
};
