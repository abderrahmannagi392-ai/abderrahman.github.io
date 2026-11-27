import React, { useMemo, useState } from 'react';

const ARABIC_CHARS = 'أبتثجحخدذرزسشصضطظعغفقكلمنهوي';

export function computePasswordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^\w\s]/.test(password) || password.length >= 12) score++;
  return Math.max(1, score) as 1 | 2 | 3 | 4;
}

export const AuthShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const letters = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        char: ARABIC_CHARS[(i * 5) % ARABIC_CHARS.length],
        x: `${((i * 8.3 + 4) % 94).toFixed(1)}%`,
        s: `${34 + ((i * 19) % 52)}px`,
        d: `${20 + ((i * 3.5) % 16)}s`,
        w: `-${((i * 2.1) % 22).toFixed(1)}s`,
        r: `${((i * 11) % 46) - 23}deg`,
      })),
    []
  );

  return (
    <div className="auth-shell">
      <div className="letters" aria-hidden="true">
        {letters.map((item, idx) => (
          <span
            key={idx}
            style={
              {
                '--x': item.x,
                '--s': item.s,
                '--d': item.d,
                '--w': item.w,
                '--r': item.r,
              } as React.CSSProperties
            }
          >
            {item.char}
          </span>
        ))}
      </div>

      <div className="wave" aria-hidden="true">
        <svg viewBox="0 0 1200 90" preserveAspectRatio="none">
          <path d="M0 50 C200 10 400 10 600 50 S1000 90 1200 50 V90 H0Z" />
        </svg>
        <svg viewBox="0 0 1200 90" preserveAspectRatio="none">
          <path d="M0 60 C150 30 350 30 600 60 S1050 85 1200 60 V90 H0Z" />
        </svg>
      </div>

      <div className="wrap">{children}</div>
    </div>
  );
};

interface AuthTitleProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export const AuthTitle: React.FC<AuthTitleProps> = ({ children, style }) => (
  <h1 className="title in" style={style}>
    {children}
    <svg viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
      <path d="M3 8 C50 2 110 2 197 7" />
    </svg>
  </h1>
);

interface AuthPasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (val: string) => void;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
  ariaShowLabel?: string;
  ariaHideLabel?: string;
  errorMsg?: string | null;
}

export const AuthPasswordField: React.FC<AuthPasswordFieldProps> = ({
  id,
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  required,
  ariaShowLabel = 'إظهار كلمة المرور',
  ariaHideLabel = 'إخفاء كلمة المرور',
  errorMsg,
}) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className="field pw">
      <label htmlFor={id}>{label}</label>
      <div className="pw-input-wrap">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          dir="ltr"
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="eye"
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? ariaHideLabel : ariaShowLabel}
        >
          {visible ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 3l18 18M10.6 6.1A10 10 0 0112 6c7 0 11 6 11 6a17 17 0 01-3.2 3.9M6.6 6.6A17 17 0 001 12s4 7 11 7a10 10 0 004.2-.9" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {errorMsg !== undefined && (
        <div className={`ferr ${errorMsg ? 'show' : ''}`} role="alert">
          {errorMsg || ''}
        </div>
      )}
    </div>
  );
};

export const PasswordStrengthMeter: React.FC<{ password: string }> = ({ password }) => {
  const level = computePasswordStrength(password);
  return (
    <div className="meter" data-l={level} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </div>
  );
};

interface AuthButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  small?: boolean;
  full?: boolean;
  children: React.ReactNode;
}

export const AuthButton: React.FC<AuthButtonProps> = ({
  loading = false,
  small = false,
  full = false,
  className = '',
  children,
  disabled,
  ...rest
}) => (
  <button
    disabled={disabled || loading}
    className={`btn ${small ? 'sm' : ''} ${full ? 'full' : ''} ${loading ? 'loading' : ''} ${className}`.trim()}
    {...rest}
  >
    <span className="t">{children}</span>
    <span className="ld" aria-hidden="true" />
  </button>
);

export const AuthOkCheckmark: React.FC = () => (
  <svg className="okc" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="28" />
    <path d="M20 33l9 9 16-18" />
  </svg>
);
