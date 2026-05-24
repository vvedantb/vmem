interface IconProps {
  size?: number;
  className?: string;
}

export default function GmailIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
    >
      <rect x="4" y="14" width="56" height="36" rx="3" fill="#ffffff" />
      <polygon points="4,14 32,38 60,14" fill="#ea4335" />
      <polygon points="4,14 20,32 4,48" fill="#c5221f" />
      <polygon points="60,14 44,32 60,48" fill="#b31412" />
    </svg>
  );
}
