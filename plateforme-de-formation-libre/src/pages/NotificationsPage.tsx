import React, { useState } from 'react';
import { Bell, BellRing, CheckCheck, Megaphone, Volume2, VolumeX } from 'lucide-react';
import { NotificationBodyText } from '../components/NotificationBodyText';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../utils/api';

export const NotificationsPage: React.FC = () => {
  const {
    lang,
    user,
    notifications,
    unreadNotificationCount,
    markNotificationsRead,
    notificationSoundEnabled,
    toggleNotificationSound,
    navigate,
  } = useApp();
  const isAr = lang === 'ar';
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [browserPerm, setBrowserPerm] = useState<string>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );

  const visible =
    filter === 'unread' ? notifications.filter((n) => !n.is_read) : notifications;

  const handleEnableBrowserNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'denied') return;
    const res = await Notification.requestPermission();
    setBrowserPerm(res);
    if (user) {
      void apiRequest('/api/auth/permissions', {
        method: 'PATCH',
        json: { notificationPermissionStatus: res },
      }).catch(() => {});
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <div className="addressp-box-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#e2efbf] text-[#384D55] flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5 text-[#83a329]" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-[#384D55]">
              {isAr ? 'الإشعارات والتنبيهات' : 'Notifications et alertes'}
            </h1>
            <p className="text-xs text-[#6b787e]">
              {isAr
                ? `لديك ${unreadNotificationCount} إشعاراً غير مقروء`
                : `${unreadNotificationCount} notification(s) non lue(s)`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => toggleNotificationSound()}
            className="imgsend2-secondary text-xs"
            title={isAr ? 'التحكم بصوت الإشعارات' : 'Son des notifications'}
          >
            {notificationSoundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-[#557a16]" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-[#6b787e]" />
            )}
            <span>
              {notificationSoundEnabled
                ? isAr
                  ? 'الصوت: مفعل'
                  : 'Son : Activé'
                : isAr
                  ? 'الصوت: مكتوم'
                  : 'Son : Muet'}
            </span>
          </button>

          {browserPerm === 'default' && (
            <button
              type="button"
              onClick={() => void handleEnableBrowserNotifications()}
              className="imgsend2-secondary text-xs"
            >
              <BellRing className="w-3.5 h-3.5 text-[#83a329]" />
              <span>{isAr ? 'تفعيل إشعارات المتصفح' : 'Activer alertes navigateur'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setFilter('all')}
            className={filter === 'all' ? 'imgsend2 text-xs' : 'imgsend2-secondary text-xs'}
          >
            {isAr ? 'الكل' : 'Toutes'} ({notifications.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('unread')}
            className={filter === 'unread' ? 'imgsend2 text-xs' : 'imgsend2-secondary text-xs'}
          >
            {isAr ? 'غير المقروءة' : 'Non lues'} ({unreadNotificationCount})
          </button>
          {unreadNotificationCount > 0 && (
            <button
              type="button"
              onClick={() => void markNotificationsRead()}
              className="imgsend2-secondary text-xs"
            >
              <CheckCheck className="w-3.5 h-3.5 text-[#83a329]" />
              <span>{isAr ? 'تحديد الكل كمقروء' : 'Tout marquer lu'}</span>
            </button>
          )}
        </div>
      </div>

      {!user ? (
        <div className="addressp-box-white text-center py-10 space-y-3">
          <p className="text-sm font-bold text-[#384D55]">
            {isAr
              ? 'يرجى تسجيل الدخول لعرض تنبيهات حسابك وإشعارات الإدارة.'
              : 'Connectez-vous pour consulter vos notifications.'}
          </p>
          <button type="button" onClick={() => navigate('login')} className="imgsend2 text-xs">
            {isAr ? 'تسجيل الدخول' : 'Connexion'}
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="addressp-box-white text-center py-12 space-y-2">
          <Bell className="w-10 h-10 text-[#6b787e] mx-auto opacity-60" />
          <p className="text-sm font-bold text-[#384D55]">
            {isAr ? 'لا توجد إشعارات مطابقة حالياً.' : 'Aucune notification pour le moment.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((n) => (
            <div
              key={n.firestoreId || n.id}
              className={`border rounded-[6px] p-4 transition-colors ${
                !n.is_read
                  ? 'bg-[#f9fcf2] border-[#A6CE39]'
                  : 'bg-white border-[#d8dfe2]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-[#83a329] shrink-0" />
                  <h2 className="text-sm font-extrabold text-[#384D55]">
                    {isAr ? n.title_ar : n.title_fr || n.title_ar}
                  </h2>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  {(n.targetScope === 'all_including_future' || n.targetScope === 'current_users') && (
                    <span className="px-2 py-0.5 rounded bg-[#efefef] text-[#384D55] font-bold">
                      {isAr ? 'تنبيه من الإدارة' : 'Annonce Admin'}
                    </span>
                  )}
                  {!n.is_read && (
                    <span className="px-2 py-0.5 rounded bg-[#A6CE39] text-[#22313a] font-bold">
                      {isAr ? 'جديد' : 'Nouveau'}
                    </span>
                  )}
                  <span className="text-[#6b787e]" dir="ltr">
                    {new Date(n.created_at).toLocaleString(isAr ? 'ar-MR' : 'fr-FR')}
                  </span>
                </div>
              </div>
              <NotificationBodyText
                text={isAr ? n.body_ar : n.body_fr || n.body_ar}
                className="text-xs text-[#384D55] leading-relaxed whitespace-pre-line"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
