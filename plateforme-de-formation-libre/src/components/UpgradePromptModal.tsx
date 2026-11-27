import React from 'react';
import { CheckCircle2, Crown, Sparkles, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const UpgradePromptModal: React.FC = () => {
  const { lang, upgradeModal, closeUpgradeModal, navigate, plans } = useApp();

  if (!upgradeModal.open) return null;

  const isAr = lang === 'ar';
  const paidPlans = plans.filter((p) => p.billing_cycle !== 'free' && p.active === 1);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 backdrop-blur-xs p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={closeUpgradeModal}
    >
      <div
        className="w-full max-w-lg bg-white border border-[#d8dfe2] rounded-[8px] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#384D55] text-white px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[#A6CE39]/20 border border-[#A6CE39] flex items-center justify-center text-[#A6CE39]">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold">
                {isAr ? 'ترقية الباقة لفتح المزايا المتقدمة' : 'Passez à une offre supérieure'}
              </h2>
              <p className="text-[11px] text-[#cfe0e6]">
                {isAr
                  ? 'حسابك الحالي على الباقة المجانية'
                  : 'Votre compte utilise actuellement la formule gratuite'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeUpgradeModal}
            className="p-1.5 rounded hover:bg-white/10 text-white cursor-pointer"
            aria-label={isAr ? 'إغلاق' : 'Fermer'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {upgradeModal.featureLabel && (
            <div className="bg-[#f9fcf2] border border-[#c8e085] rounded-[6px] p-3 text-xs text-[#384D55] font-semibold flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-[#83a329] shrink-0 mt-0.5" />
              <span>{upgradeModal.featureLabel}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="border border-[#d8dfe2] rounded-[6px] p-3 bg-[#f7f9fa]">
              <div className="font-extrabold text-[#384D55] mb-2">
                {isAr ? 'الباقة المجانية الحالية' : 'Offre Gratuite actuelle'}
              </div>
              <ul className="space-y-1.5 text-[#6b787e]">
                <li>• {isAr ? 'حصة يومية مجانية من الأسئلة والدروس' : 'Quota quotidien de questions et leçons'}</li>
                <li>• {isAr ? 'امتحان تجريبي محدود يومياً' : 'Examen blanc limité par jour'}</li>
                <li>• {isAr ? 'حاسبة معدل الباكالوريا' : 'Calculateur de moyenne du Bac'}</li>
              </ul>
            </div>

            <div className="border-2 border-[#A6CE39] rounded-[6px] p-3 bg-[#f9fcf2]">
              <div className="font-extrabold text-[#384D55] mb-2 flex items-center justify-between">
                <span>{isAr ? 'الباقة المدفوعة الشاملة' : 'Abonnement Complet'}</span>
                {paidPlans[0] && (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-[#A6CE39] text-[#22313a] font-bold">
                    {paidPlans[0].price_mru} {paidPlans[0].currency}
                  </span>
                )}
              </div>
              <ul className="space-y-1.5 text-[#384D55]">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#83a329] shrink-0" />
                  <span>{isAr ? 'وصول غير محدود لبنك الأسئلة والدروس' : 'Accès illimité aux questions et leçons'}</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#83a329] shrink-0" />
                  <span>{isAr ? 'المحاكاة الرسمية للامتحانات ومركز المراجعة' : 'Simulations officielles et révision'}</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#83a329] shrink-0" />
                  <span>{isAr ? 'النطق الصوتي المتقدم وتنزيل كشوف النقاط' : 'Audio avancé et relevés imprimables'}</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[#e6e9eb]">
            <button
              type="button"
              onClick={closeUpgradeModal}
              className="imgsend2-secondary text-xs"
            >
              {isAr ? 'المتابعة بالمجاني' : 'Continuer en gratuit'}
            </button>
            <button
              type="button"
              onClick={() => {
                closeUpgradeModal();
                navigate('subscriptions');
              }}
              className="imgsend2 text-xs"
            >
              {isAr ? 'استعراض الباقات والاشتراك' : 'Voir les abonnements'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
