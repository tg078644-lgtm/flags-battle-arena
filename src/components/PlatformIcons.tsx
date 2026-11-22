import { StreamPlatformId } from '../types';

interface PlatformIconProps {
  platform: StreamPlatformId;
  className?: string;
}

export function PlatformIcon({ platform, className = 'w-4 h-4' }: PlatformIconProps) {
  switch (platform) {
    case 'youtube':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="2" y="5" width="20" height="14" rx="4" fill="#FF0033" />
          <path d="M10 9.2L15.4 12L10 14.8V9.2Z" fill="#FFFFFF" />
        </svg>
      );
    case 'twitch':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M4.5 3L3 6.6V18.6H7.4V21L10.2 18.6H13.4L20.5 11.8V3H4.5ZM18.7 11L15.6 14H12.2L9.6 16.2V14H6.2V4.8H18.7V11Z"
            fill="#9146FF"
          />
          <rect x="14.2" y="7" width="1.7" height="4.4" rx="0.4" fill="#FFFFFF" />
          <rect x="10.2" y="7" width="1.7" height="4.4" rx="0.4" fill="#FFFFFF" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M15.6 3H13.1V15.2C13.1 16.7 11.9 17.9 10.4 17.9C8.9 17.9 7.7 16.7 7.7 15.2C7.7 13.8 8.8 12.6 10.2 12.5V9.9C7.4 10 5.1 12.3 5.1 15.2C5.1 18.1 7.5 20.5 10.4 20.5C13.3 20.5 15.7 18.1 15.7 15.2V8.9C16.9 9.8 18.4 10.3 20 10.3V7.8C17.6 7.8 15.6 5.7 15.6 3Z"
            fill="#00F2EA"
            transform="translate(-0.7 -0.4)"
          />
          <path
            d="M15.6 3H13.1V15.2C13.1 16.7 11.9 17.9 10.4 17.9C8.9 17.9 7.7 16.7 7.7 15.2C7.7 13.8 8.8 12.6 10.2 12.5V9.9C7.4 10 5.1 12.3 5.1 15.2C5.1 18.1 7.5 20.5 10.4 20.5C13.3 20.5 15.7 18.1 15.7 15.2V8.9C16.9 9.8 18.4 10.3 20 10.3V7.8C17.6 7.8 15.6 5.7 15.6 3Z"
            fill="#FF0050"
            transform="translate(0.7 0.4)"
          />
          <path
            d="M15.6 3H13.1V15.2C13.1 16.7 11.9 17.9 10.4 17.9C8.9 17.9 7.7 16.7 7.7 15.2C7.7 13.8 8.8 12.6 10.2 12.5V9.9C7.4 10 5.1 12.3 5.1 15.2C5.1 18.1 7.5 20.5 10.4 20.5C13.3 20.5 15.7 18.1 15.7 15.2V8.9C16.9 9.8 18.4 10.3 20 10.3V7.8C17.6 7.8 15.6 5.7 15.6 3Z"
            fill="#FFFFFF"
          />
        </svg>
      );
    case 'kick':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="2.5" y="2.5" width="19" height="19" rx="4" fill="#0B130A" stroke="#53FC18" strokeWidth="1.5" />
          <path
            d="M7 6.5H10.5V10.1H12.1V8.3H13.8V6.5H17.3V10.1H15.6V11.8H13.9V12.2H15.6V13.9H17.3V17.5H13.8V15.7H12.1V13.9H10.5V17.5H7V6.5Z"
            fill="#53FC18"
          />
        </svg>
      );
    case 'custom':
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="2.6" fill="#38BDF8" />
          <path
            d="M8.2 8.2C6.1 10.3 6.1 13.7 8.2 15.8M15.8 8.2C17.9 10.3 17.9 13.7 15.8 15.8"
            stroke="#38BDF8"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
          <path
            d="M5.2 5.2C1.6 8.8 1.6 15.2 5.2 18.8M18.8 5.2C22.4 8.8 22.4 15.2 18.8 18.8"
            stroke="#38BDF8"
            strokeOpacity="0.65"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}
