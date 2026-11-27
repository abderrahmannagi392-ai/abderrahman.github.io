import React, { useState } from 'react';
import { AlertTriangle, Award, CheckCircle2, CreditCard, RefreshCw, ShieldCheck, Tag } from 'lucide-react';
import { PaymentBrandBadges } from '../components/PaymentBrandBadges';
import { useApp } from '../context/AppContext';
import { getT } from '../i18n/translations';
import { activateFreePlanInFirestore } from '../lib/firestoreService';
import type { SubscriptionPlan } from '../types';
import { apiRequest } from '../utils/api';
import { localeCode, tr } from '../utils/locale';

export const SubscriptionsPage: React.FC = () => {
  const { lang, user, firebaseUser, plans, annualSavings, freeLimits, navigate, goToAuth, refreshUser } =
    useApp();
  const t = getT(lang);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleChoosePlan = async (plan: SubscriptionPlan) => {
    setNotice(null);
    if (!user) {
      goToAuth('login');
      return;
    }
    if (plan.price_mru === 0) {
      setBusyPlanId(plan.firestoreId || String(plan.id));
      try {
        await apiRequest('/api/payments/activate-free', {
          method: 'POST',
          json: { planId: plan.id },
        }).catch(() => {});
        if (firebaseUser?.emailVerified && plan.firestoreId) {
          await activateFreePlanInFirestore(user.uid, plan).catch(() => {});
        }
        await refreshUser();
        navigate('lessons');
      } catch (err: any) {
        setNotice(err?.message || null);
      } finally {
        setBusyPlanId(null);
      }
      return;
    }
    navigate('checkout', { planId: plan.id });
  };

  const paidDefaultPlanId =
    plans.find((p) => p.billing_cycle === 'annual' || p.slug === 'annual-concours')?.id ||
    plans.find((p) => p.price_mru > 0)?.id ||
    2;

  return (
    <div className="px-4 sm:px-6 py-6 space-y-5">
      <div className="rotator-box">
        <div className="rotator-box-header flex-wrap gap-2">
          <span>
            {tr(
              lang,
              'باقات الاشتراك لمسابقة اكتتاب المعلمين',
              'Offres et abonnements de préparation au concours',
              'Subscription Plans for Teachers Recruitment Prep'
            )}
          </span>
          <PaymentBrandBadges size="sm" showMauritanianMethods />
        </div>

        <p className="text-xs sm:text-sm text-[#4c626b] mb-4">
          {tr(
            lang,
            'اختر الباقة المناسبة لجدول تحضيرك. نوفر الدفع الإلكتروني عبر بطاقات Visa وMasterCard، وكذلك الدفع المحلي عبر السداد ومصرفي وبنكيلي مع فحص ومراجعة الإيصال.',
            'Choisissez la formule adaptée. Paiement par carte Visa / MasterCard ou transfert local via Sedad, Masrvi et Bankily avec vérification du reçu.',
            'Choose the plan that fits your study schedule. Pay via global Visa / MasterCard or local Mauritanian transfers (Sedad, Masrvi, Bankily) with receipt verification.'
          )}
        </p>

        {notice && (
          <div className="mb-3 p-3 rounded-[3px] border border-red-200 bg-red-50 text-red-700 text-xs font-bold">
            {notice}
          </div>
        )}

        {user?.activeSubscription && (
          <div className="addtocartnotf flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2 text-xs">
              <Award className="w-4 h-4 text-[#557a16]" />
              <span>
                {t.currentPlanBadge}:{' '}
                {lang === 'ar' ? user.activeSubscription.name_ar : user.activeSubscription.name_fr}
              </span>
            </div>
            {user.activeSubscription.expires_at && (
              <span className="text-xs tabular-nums">
                {tr(lang, 'صالح لغاية: ', "Valable jusqu'au : ", 'Valid until: ')}
                {new Date(user.activeSubscription.expires_at).toLocaleDateString(localeCode(lang))}
              </span>
            )}
          </div>
        )}

        {!user?.activeSubscription && user?.latestExpiredSubscription && (
          <div className="mb-4 p-3.5 rounded-[4px] border border-amber-300 bg-amber-50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <div>
                <div className="font-bold">
                  {tr(
                    lang,
                    `انتهت صلاحية اشتراكك السابق (${user.latestExpiredSubscription.name_ar})`,
                    `Votre abonnement précédent a expiré (${user.latestExpiredSubscription.name_fr})`,
                    `Your previous subscription expired (${user.latestExpiredSubscription.name_fr})`
                  )}
                </div>
                {user.latestExpiredSubscription.expires_at && (
                  <div className="text-[11px] text-amber-800">
                    {tr(lang, 'تاريخ الانتهاء: ', 'Expiré le : ', 'Expired on: ')}
                    {new Date(user.latestExpiredSubscription.expires_at).toLocaleDateString(localeCode(lang))}{' '}
                    —{' '}
                    {tr(
                      lang,
                      'يمكنك التجديد الآن عبر البطاقة العالمية أو عبر التحويل المحلي.',
                      'Vous pouvez renouveler par carte bancaire ou par transfert local.',
                      'You can renew now via global card or local bank transfer.'
                    )}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('checkout', { planId: paidDefaultPlanId })}
              className="imgsend2 text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{tr(lang, 'تجديد الاشتراك', 'Renouveler', 'Renew Subscription')}</span>
            </button>
          </div>
        )}

        {plans.length === 0 ? (
          <div className="addressp-box text-center text-sm text-[#6b787e]">{t.loading}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const isCurrent =
                (user?.activeSubscription?.planFirestoreId &&
                  plan.firestoreId &&
                  user.activeSubscription.planFirestoreId === plan.firestoreId) ||
                user?.activeSubscription?.plan_slug === plan.slug ||
                user?.activeSubscription?.plan_id === plan.id;
              const isAnnual = plan.billing_cycle === 'annual' || plan.slug === 'annual-concours';
              const isHighlighted = Boolean(plan.is_popular) || isAnnual;
              const features = lang === 'ar' ? plan.features_ar : plan.features_fr;
              const busyKey = plan.firestoreId || String(plan.id);

              return (
                <div
                  key={busyKey}
                  className={`addressp-box flex flex-col justify-between mb-0 ${
                    isHighlighted ? 'border-[#A6CE39] border-2 bg-[#fbfdf6]' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <h2 className="text-base font-extrabold text-[#384D55]">
                        {lang === 'ar' ? plan.name_ar : plan.name_fr}
                      </h2>
                      {isAnnual && annualSavings && annualSavings.savingsAmount > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] bg-[#557a16] text-white text-[11px] font-bold">
                          <Tag className="w-3 h-3" />
                          <span>
                            {tr(
                              lang,
                              `وفر ${annualSavings.savingsPercent}% (${annualSavings.savingsAmount.toLocaleString()} أوقية)`,
                              `Économisez ${annualSavings.savingsPercent}%`,
                              `Save ${annualSavings.savingsPercent}%`
                            )}
                          </span>
                        </span>
                      ) : (
                        isHighlighted && <span className="new-badge">{t.badgeNew}</span>
                      )}
                    </div>
                    <p className="text-xs text-[#6b787e] mb-3">
                      {lang === 'ar' ? plan.description_ar : plan.description_fr}
                    </p>

                    <div className="bg-[#f4f6f7] border border-[#d8dfe2] rounded-[3px] p-3 mb-4">
                      {plan.price_mru === 0 ? (
                        <div>
                          <div className="text-xl font-extrabold text-[#384D55]">
                            {tr(lang, 'مجاني (0 MRU)', 'Gratuit (0 MRU)', 'Free (0 MRU)')}
                          </div>
                          {freeLimits && (
                            <div className="text-[11px] font-semibold text-[#5c686e] mt-1">
                              {tr(
                                lang,
                                `${freeLimits.daily_lessons_limit} دروس · ${freeLimits.daily_questions_limit} سؤالاً · ${freeLimits.daily_exams_limit} اختبار يومياً`,
                                `${freeLimits.daily_lessons_limit} leçons · ${freeLimits.daily_questions_limit} questions · ${freeLimits.daily_exams_limit} examen / jour`,
                                `${freeLimits.daily_lessons_limit} lessons · ${freeLimits.daily_questions_limit} questions · ${freeLimits.daily_exams_limit} exam/day`
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-xl font-extrabold text-[#384D55] tabular-nums">
                              {plan.price_mru.toLocaleString()} MRU
                            </span>
                            {isAnnual && annualSavings && annualSavings.savingsAmount > 0 && (
                              <span className="text-xs line-through text-[#8c989e] tabular-nums">
                                {annualSavings.twelveMonthsCost.toLocaleString()} MRU
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-bold text-[#6b787e] tabular-nums">
                            {isAnnual
                              ? tr(
                                  lang,
                                  '12 شهراً كاملاً من تاريخ التفعيل',
                                  '12 mois complets dès activation',
                                  '12 full months from activation'
                                )
                              : `${plan.duration_days} ${tr(lang, 'يوماً', 'jours', 'days')}`}
                            {plan.price_eur > 0 ? ` · ${plan.price_eur} €` : ''}
                          </div>
                        </>
                      )}
                    </div>

                    <ul className="space-y-2 text-xs text-[#384D55] mb-5">
                      {features.map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#557a16] shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    type="button"
                    disabled={busyPlanId === busyKey}
                    onClick={() => void handleChoosePlan(plan)}
                    className={
                      isCurrent || plan.price_mru === 0 ? 'imgsend2-secondary w-full' : 'imgsend2 w-full'
                    }
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>
                      {busyPlanId === busyKey
                        ? t.loading
                        : isCurrent
                          ? t.currentPlanBadge
                          : plan.price_mru === 0
                            ? tr(lang, 'ابدأ الآن مجاناً', 'Commencer gratuitement', 'Start Free Now')
                            : t.subscribeNow}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Accepted Mauritanian & Card Payment Methods Notice */}
      <div className="addressp-box flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 text-xs font-bold text-[#384D55]">
          <ShieldCheck className="w-5 h-5 text-[#557a16] shrink-0" />
          <span>
            {tr(
              lang,
              'الوسائل المعتمدة: Visa وMasterCard (تفعيل فوري)، بالإضافة إلى السداد ومصرفي وبنكيلي (مراجعة الإيصال).',
              'Moyens acceptés : Visa et MasterCard (activation immédiate), Sedad, Masrvi et Bankily (validation du reçu).',
              'Accepted methods: Visa & MasterCard (instant activation), plus Sedad, Masrvi & Bankily (receipt verification).'
            )}
          </span>
        </div>
        <PaymentBrandBadges size="md" showMauritanianMethods />
      </div>
    </div>
  );
};
