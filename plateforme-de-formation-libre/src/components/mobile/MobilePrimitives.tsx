import React, { useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  GraduationCap,
  Home,
  LayoutGrid,
  MessageCircle,
  RefreshCw,
} from 'lucide-react';
import { triggerHaptic } from '../../hooks/useMobilePlatform';

export type MobileTabId = 'home' | 'learn' | 'exams' | 'chats' | 'menu';

export const MobileLeafEmblemGraphic: React.FC = () => (
  <svg
    width="98"
    height="84"
    viewBox="0 0 120 100"
    fill="none"
    aria-hidden="true"
    className="shrink-0 select-none"
  >
    {/* Laurel leaves in dark forest green */}
    <g fill="#55720f" opacity="0.45">
      <ellipse cx="26" cy="70" rx="7" ry="3.2" transform="rotate(-35 26 70)" />
      <ellipse cx="21" cy="60" rx="7" ry="3.2" transform="rotate(-18 21 60)" />
      <ellipse cx="19" cy="49" rx="7" ry="3.2" transform="rotate(-4 19 49)" />
      <ellipse cx="22" cy="38" rx="7" ry="3.2" transform="rotate(14 22 38)" />
      <ellipse cx="28" cy="27" rx="6.5" ry="3" transform="rotate(32 28 27)" />
      <ellipse cx="94" cy="70" rx="7" ry="3.2" transform="rotate(35 94 70)" />
      <ellipse cx="99" cy="60" rx="7" ry="3.2" transform="rotate(18 99 60)" />
      <ellipse cx="101" cy="49" rx="7" ry="3.2" transform="rotate(4 101 49)" />
      <ellipse cx="98" cy="38" rx="7" ry="3.2" transform="rotate(-14 98 38)" />
      <ellipse cx="92" cy="27" rx="6.5" ry="3" transform="rotate(-32 92 27)" />
    </g>
    {/* Sparkles */}
    <path
      d="M36 30L37.8 34.2L42 36L37.8 37.8L36 42L34.2 37.8L30 36L34.2 34.2Z"
      fill="#ffffff"
      opacity="0.92"
    />
    <path
      d="M84 56L85.4 59.6L89 61L85.4 62.4L84 66L82.6 62.4L79 61L82.6 59.6Z"
      fill="#ffffff"
      opacity="0.88"
    />
    {/* Official Emblem Crest */}
    <rect x="34" y="24" width="52" height="52" rx="16" fill="#1c2a0e" />
    <path
      d="M44 43C50 38 56 38 60 42C64 38 70 38 76 43V60C70 56 64 56 60 59C56 56 50 56 44 60V43Z"
      fill="#e6f2c4"
    />
    <path d="M60 42V59" stroke="#7c9e1c" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M45 65C54 61 66 61 75 65" stroke="#a4cc39" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export const MobileTopHeader: React.FC<{
  title: string;
  showBack?: boolean;
  backLabel?: string;
  onBack?: () => void;
  scrolled?: boolean;
  startSlot?: React.ReactNode;
  endSlot?: React.ReactNode;
}> = ({ title, showBack = true, backLabel = 'رجوع', onBack, scrolled = false, startSlot, endSlot }) => {
  return (
    <header className={`tdr-m-header ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="flex items-center justify-start">
        {startSlot ? (
          startSlot
        ) : showBack && onBack ? (
          <button
            type="button"
            onClick={() => {
              triggerHaptic(8);
              onBack();
            }}
            className="tdr-m-back-btn"
          >
            <span>{backLabel}</span>
          </button>
        ) : (
          <span />
        )}
      </div>
      <h1 className="tdr-m-header-title">{title}</h1>
      <div className="flex items-center justify-end">{endSlot || <span />}</div>
    </header>
  );
};

export const MobileListRow: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClick?: () => void;
  trailing?: React.ReactNode;
  dir?: 'rtl' | 'ltr';
  danger?: boolean;
}> = ({ icon, title, subtitle, onClick, trailing, dir = 'rtl', danger = false }) => {
  const Chevron = dir === 'rtl' ? ArrowLeft : ArrowRight;
  const content = (
    <>
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span
          className="tdr-m-icon-circle"
          style={
            danger
              ? {
                  background: 'var(--m-errbg)',
                  color: 'var(--m-err)',
                  borderColor: 'var(--m-errline)',
                }
              : undefined
          }
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="text-[0.94rem] font-bold truncate"
            style={{ color: danger ? 'var(--m-err)' : 'var(--m-ink)' }}
          >
            {title}
          </div>
          {subtitle && (
            <div className="text-[0.75rem] truncate mt-0.5" style={{ color: 'var(--m-muted)' }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {trailing !== undefined ? (
          trailing
        ) : (
          <Chevron className="w-[18px] h-[18px]" style={{ color: 'var(--m-muted)' }} />
        )}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={() => {
          triggerHaptic(8);
          onClick();
        }}
        className="tdr-m-list-row"
      >
        {content}
      </button>
    );
  }
  return <div className="tdr-m-list-row cursor-default">{content}</div>;
};

export const MobileGreenSwitch: React.FC<{
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
  disabled?: boolean;
}> = ({ checked, onChange, ariaLabel, disabled = false }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    disabled={disabled}
    data-checked={checked ? 'true' : 'false'}
    onClick={() => {
      triggerHaptic(10);
      onChange();
    }}
    className="tdr-m-switch"
  >
    <span className="tdr-m-switch-thumb" />
  </button>
);

export const MobileBottomNav: React.FC<{
  activeTab: MobileTabId;
  onSelect: (tab: MobileTabId) => void;
  unreadChats?: number;
  unreadMenu?: number;
  labels?: Record<MobileTabId, string>;
}> = ({ activeTab, onSelect, unreadChats = 0, unreadMenu = 0, labels }) => {
  const items: Array<{ id: MobileTabId; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'home', label: labels?.home || 'الرئيسية', icon: <Home className="w-[20px] h-[20px]" /> },
    {
      id: 'learn',
      label: labels?.learn || 'الدروس',
      icon: <BookOpen className="w-[20px] h-[20px]" />,
    },
    {
      id: 'exams',
      label: labels?.exams || 'الامتحانات',
      icon: <GraduationCap className="w-[20px] h-[20px]" />,
    },
    {
      id: 'chats',
      label: labels?.chats || 'المحادثات',
      icon: <MessageCircle className="w-[20px] h-[20px]" />,
      badge: unreadChats,
    },
    {
      id: 'menu',
      label: labels?.menu || 'القائمة',
      icon: <LayoutGrid className="w-[20px] h-[20px]" />,
      badge: unreadMenu,
    },
  ];

  return (
    <div className="tdr-m-nav-wrap">
      <nav className="tdr-m-nav" aria-label="التنقل السفلي">
        {items.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                triggerHaptic(8);
                onSelect(item.id);
              }}
              data-active={active ? 'true' : 'false'}
              className="tdr-m-nav-item"
              aria-current={active ? 'page' : undefined}
            >
              <span className="relative inline-flex items-center justify-center">
                {item.icon}
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span
                    className="absolute -top-1.5 -end-2 min-w-[16px] h-[16px] px-1 rounded-full text-[10px] font-extrabold text-white flex items-center justify-center"
                    style={{ background: '#b80000' }}
                  >
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </span>
              <span className="truncate max-w-full px-0.5">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export const MobileDarkSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  icon?: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}> = ({ open, onClose, icon, title, description, children }) => {
  const startYRef = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  if (!open) return null;

  return (
    <div
      className="tdr-m-sheet-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="tdr-m-sheet"
        style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
        onTouchStart={(e) => {
          startYRef.current = e.touches[0]?.clientY ?? null;
        }}
        onTouchMove={(e) => {
          if (startYRef.current === null) return;
          const delta = (e.touches[0]?.clientY ?? 0) - startYRef.current;
          if (delta > 0) setDragY(Math.min(delta, 180));
        }}
        onTouchEnd={() => {
          if (dragY > 72) {
            setDragY(0);
            startYRef.current = null;
            onClose();
            return;
          }
          setDragY(0);
          startYRef.current = null;
        }}
      >
        <div className="tdr-m-sheet-handle" />
        {icon && (
          <div className="flex justify-center mb-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(164, 204, 57, 0.18)', color: '#a4cc39' }}
            >
              {icon}
            </div>
          </div>
        )}
        <h2 className="text-center text-base font-extrabold tdr-m-kufi leading-snug" style={{ color: '#e3eadb' }}>
          {title}
        </h2>
        {description && (
          <p className="text-center text-xs mt-2 leading-relaxed" style={{ color: 'var(--m-sheet-sub)' }}>
            {description}
          </p>
        )}
        <div className="mt-5 space-y-2.5">{children}</div>
      </div>
    </div>
  );
};

export const MobilePullToRefreshIndicator: React.FC<{
  pullDistance: number;
  refreshing: boolean;
}> = ({ pullDistance, refreshing }) => {
  if (!refreshing && pullDistance <= 6) return null;
  const clamped = refreshing ? 42 : Math.min(54, pullDistance);
  return (
    <div
      className="flex items-center justify-center overflow-hidden transition-all duration-150"
      style={{ height: `${clamped}px` }}
      aria-live="polite"
    >
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center border"
        style={{
          background: 'var(--m-brand-soft)',
          borderColor: 'var(--m-brand-border)',
          color: 'var(--m-brand-deep)',
        }}
      >
        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
      </div>
    </div>
  );
};

export const MobileSkeletonList: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <div className="space-y-2.5" aria-busy="true">
    {Array.from({ length: count }, (_, idx) => (
      <div key={idx} className="tdr-m-card p-3.5 flex items-center gap-3">
        <div className="tdr-m-skeleton w-10 h-10 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="tdr-m-skeleton h-3.5 w-3/4" />
          <div className="tdr-m-skeleton h-2.5 w-1/2" />
        </div>
      </div>
    ))}
  </div>
);

export const MobileSnackbar: React.FC<{
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}> = ({ message, actionLabel, onAction, onDismiss }) => (
  <div className="tdr-m-snackbar" role="status">
    <span className="text-xs font-bold leading-relaxed flex-1">{message}</span>
    <div className="flex items-center gap-2 shrink-0">
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer"
          style={{ background: '#a4cc39', color: '#1c2a0e' }}
        >
          {actionLabel}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs font-bold opacity-75 px-1.5 py-1 cursor-pointer"
        >
          ✕
        </button>
      )}
    </div>
  </div>
);
