import { useState } from 'react';

interface FlagAvatarProps {
  imageUrl: string;
  code: string;
  name: string;
  fallbackColor: string;
  size?: 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<FlagAvatarProps['size']>, string> = {
  xxs: 'w-3.5 h-3.5 text-[7px]',
  xs: 'w-5 h-5 text-[8px]',
  sm: 'w-7 h-7 text-[10px]',
  md: 'w-9 h-9 text-xs',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl',
};

export function FlagAvatar({
  imageUrl,
  code,
  name,
  fallbackColor,
  size = 'sm',
  className = '',
}: FlagAvatarProps) {
  const [failed, setFailed] = useState(false);

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/85 bg-slate-900 select-none ${SIZE_CLASSES[size]} ${className}`}
      style={{ backgroundColor: failed || !imageUrl ? fallbackColor : undefined }}
      title={name}
    >
      {!failed && imageUrl ? (
        <img
          src={imageUrl}
          alt={name}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="font-bold tracking-tight text-white uppercase">
          {code.slice(0, 3)}
        </span>
      )}
    </span>
  );
}
