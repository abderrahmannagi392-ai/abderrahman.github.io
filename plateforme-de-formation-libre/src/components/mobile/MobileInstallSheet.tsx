import React, { useState } from 'react';
import { Download, PlusSquare, Share, Smartphone, X } from 'lucide-react';
import type { MobileOs } from '../../hooks/useMobilePlatform';
import type { Language } from '../../types';
import { tr } from '../../utils/locale';
import { MobileDarkSheet } from './MobilePrimitives';

export const MobileInstallCard: React.FC<{
  lang: Language;
  os: MobileOs;
  isStandalone: boolean;
  installDismissed: boolean;
  canPromptAndroidInstall: boolean;
  onPromptAndroidInstall: () => Promise<unknown>;
  onDismiss: () => void;
}> = ({
  lang,
  os,
  isStandalone,
  installDismissed,
  canPromptAndroidInstall,
  onPromptAndroidInstall,
  onDismiss,
}) => {
  const [iosSheetOpen, setIosSheetOpen] = useState(false);

  if (isStandalone || installDismissed) return null;

  const handleInstallClick = () => {
    if (os === 'ios') {
      setIosSheetOpen(true);
    } else if (canPromptAndroidInstall) {
      void onPromptAndroidInstall();
    } else {
      setIosSheetOpen(true);
    }
  };

  return (
    <>
      <div
        className="tdr-m-card p-3.5 flex items-center justify-between gap-3"
        style={{
          background: 'var(--m-brand-tint)',
          borderColor: 'var(--m-brand-border)',
        }}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="tdr-m-icon-circle shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-extrabold tdr-m-kufi truncate" style={{ color: 'var(--m-ink)' }}>
              {tr(lang, 'ثبّت تطبيق تدريبي على هاتفك', 'Installer l’app Tadreebi', 'Install Tadreebi App')}
            </div>
            <div className="text-[11px] truncate" style={{ color: 'var(--m-ink-sub)' }}>
              {os === 'ios'
                ? tr(lang, 'أضفه للشاشة الرئيسية في iPhone', 'Ajouter à l’écran d’accueil', 'Add to iPhone Home Screen')
                : tr(lang, 'تجربة تطبيق كاملة بدون شريط متصفح', 'Expérience app plein écran', 'Full-screen app experience')}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleInstallClick}
            className="min-h-[38px] px-3 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
            style={{
              background: 'var(--m-brand)',
              color: 'var(--m-btn-ink)',
              border: '1px solid var(--m-brand-d)',
            }}
          >
            <Download className="w-3.5 h-3.5" />
            <span>{tr(lang, 'تثبيت', 'Installer', 'Install')}</span>
          </button>
          <button
            type="button"
            aria-label={tr(lang, 'إغلاق', 'Fermer', 'Dismiss')}
            onClick={onDismiss}
            className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer"
            style={{ color: 'var(--m-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <MobileDarkSheet
        open={iosSheetOpen}
        onClose={() => setIosSheetOpen(false)}
        icon={<Smartphone className="w-6 h-6" />}
        title={
          os === 'ios'
            ? tr(lang, 'تثبيت تدريبي على iPhone', 'Installer sur iPhone', 'Install on iPhone')
            : tr(lang, 'تثبيت تدريبي على Android', 'Installer sur Android', 'Install on Android')
        }
        description={
          os === 'ios'
            ? tr(
                lang,
                'اتبع الخطوتين التاليتين في متصفح Safari ليفتح تدريبي كتطبيق مستقل:',
                'Suivez ces étapes dans Safari :',
                'Follow these steps in Safari:'
              )
            : tr(
                lang,
                'إذا لم تظهر نافذة التثبيت تلقائياً، يمكنك إضافته مباشرة من قائمة المتصفح:',
                'Vous pouvez ajouter l’app depuis le menu du navigateur :',
                'Add the app directly from your browser menu:'
              )
        }
      >
        {os === 'ios' ? (
          <div className="space-y-2.5 text-xs leading-relaxed" style={{ color: 'var(--m-sheet-ink)' }}>
            <div
              className="p-3 rounded-xl flex items-center gap-3"
              style={{ background: 'var(--m-sheet-btn)' }}
            >
              <Share className="w-5 h-5 shrink-0" style={{ color: '#a4cc39' }} />
              <span>
                {tr(
                  lang,
                  '1. اضغط على زر «مشاركة» (Share) أسفل شاشة Safari.',
                  '1. Appuyez sur Partager en bas de Safari.',
                  '1. Tap the Share button in Safari.'
                )}
              </span>
            </div>
            <div
              className="p-3 rounded-xl flex items-center gap-3"
              style={{ background: 'var(--m-sheet-btn)' }}
            >
              <PlusSquare className="w-5 h-5 shrink-0" style={{ color: '#a4cc39' }} />
              <span>
                {tr(
                  lang,
                  '2. اختر «إضافة إلى الشاشة الرئيسية» ثم اضغط «إضافة».',
                  '2. Sélectionnez « Sur l’écran d’accueil » puis Ajouter.',
                  '2. Choose « Add to Home Screen » then tap Add.'
                )}
              </span>
            </div>
          </div>
        ) : (
          <div
            className="p-3.5 rounded-xl text-xs leading-relaxed"
            style={{ background: 'var(--m-sheet-btn)', color: 'var(--m-sheet-ink)' }}
          >
            {tr(
              lang,
              'افتح قائمة Chrome (⋮) أعلى المتصفح ثم اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».',
              'Ouvrez le menu Chrome (⋮) puis sélectionnez « Installer l’application ».',
              'Open the browser menu (⋮) and tap « Install app ».'
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => setIosSheetOpen(false)}
          className="tdr-m-sheet-btn tdr-m-sheet-btn--primary"
        >
          {tr(lang, 'حسناً، فهمت', 'Compris', 'Got it')}
        </button>
      </MobileDarkSheet>
    </>
  );
};
