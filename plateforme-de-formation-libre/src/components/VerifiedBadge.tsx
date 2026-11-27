import React from 'react';

interface VerifiedBadgeProps {
  verified?: boolean | number | null;
  label?: string | null;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({
  verified,
  label,
  size = 'sm',
  className = '',
}) => {
  if (!verified) return null;
  const px = size === 'xs' ? 14 : size === 'md' ? 20 : 17;
  const titleText = label && label.trim() ? label.trim() : 'حساب موثق';

  return (
    <span
      title={titleText}
      aria-label={titleText}
      className={`inline-flex items-center justify-center shrink-0 align-middle ${className}`}
    >
      <svg width={px} height={px} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10.5" fill="#1D9BF0" />
        <path
          d="M8.5 12.4l2.3 2.3 4.8-5.1"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
};
