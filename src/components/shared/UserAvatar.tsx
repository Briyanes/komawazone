import Image from 'next/image';

export interface UserAvatarProps {
  avatarUrl?: string | null;
  username?: string | null;
  size?: number;
  className?: string;
}

export function UserAvatar({ avatarUrl, username, size = 36, className }: UserAvatarProps) {
  if (avatarUrl) {
    return (
      <div className={`relative shrink-0 overflow-hidden rounded-full ${className}`} style={{ width: size, height: size }}>
        <Image
          src={avatarUrl}
          alt={username ?? 'User'}
          fill
          className="object-cover"
          sizes={`${size}px`}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full text-white font-bold ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size <= 28 ? 10 : 13,
        background: `hsl(${((username ?? 'A').charCodeAt(0) * 37) % 360}, 65%, 45%)`
      }}
    >
      {(username ?? '?').charAt(0).toUpperCase()}
    </div>
  );
}
