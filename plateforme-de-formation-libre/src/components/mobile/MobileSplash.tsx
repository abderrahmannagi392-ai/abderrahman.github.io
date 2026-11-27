import React, { useEffect, useState } from 'react';
import { MobileBackground } from './MobileBackground';

export const MobileSplash: React.FC<{
  visible: boolean;
  onDone: () => void;
}> = ({ visible, onDone }) => {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const t1 = window.setTimeout(() => setLeaving(true), 780);
    const t2 = window.setTimeout(() => onDone(), 1120);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [visible, onDone]);

  if (!visible) return null;

  return (
    <div className={`tdr-m-splash ${leaving ? 'is-leaving' : ''}`} aria-hidden={!visible}>
      <MobileBackground />
      <div className="relative z-10 text-center px-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 border shadow-sm" style={{ background: 'var(--m-brand)', borderColor: 'var(--m-brand-d)' }}>
          <img
            src="/pwa-192x192.png"
            alt="تدريبي"
            className="w-14 h-14 rounded-xl object-contain"
          />
        </div>
        <div>
          <h1 className="tdr-m-auth-title" style={{ fontSize: '2.2rem' }}>
            تدريبي
            <svg viewBox="0 0 200 12" preserveAspectRatio="none">
              <path d="M3 8 C50 2 110 2 197 7" />
            </svg>
          </h1>
        </div>
        <p className="tdr-m-auth-tag" style={{ marginTop: 8 }}>
          تعلّم بحرّية، وطوّر مسارك.
        </p>
      </div>
    </div>
  );
};
