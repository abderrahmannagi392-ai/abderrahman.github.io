import React from 'react';

interface NotificationBodyTextProps {
  text: string;
  className?: string;
}

const URL_SPLIT_REGEX = /(https?:\/\/[^\s<>"')]+[^\s<>"'.,;:!?)\]}])/gi;

export const NotificationBodyText: React.FC<NotificationBodyTextProps> = ({
  text,
  className = '',
}) => {
  if (!text) return null;
  const parts = text.split(URL_SPLIT_REGEX);

  return (
    <span className={className}>
      {parts.map((part, idx) => {
        if (/^https?:\/\//i.test(part)) {
          return (
            <a
              key={idx}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              dir="ltr"
              className="text-[#456810] dark:text-[#b9df55] font-bold underline break-all hover:opacity-80"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        return <React.Fragment key={idx}>{part}</React.Fragment>;
      })}
    </span>
  );
};
