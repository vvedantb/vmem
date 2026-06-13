interface IconProps {
  size?: number;
  className?: string;
}

/**
 * Eva (CarePulse internal agent) logo mark — inlined from
 * https://eva.carepulse.co.uk/icon.svg so it renders offline during talks.
 */
export default function EvaIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
      aria-hidden="true"
    >
      <rect width="512" height="512" rx="108" ry="108" fill="#ffffff" />
      <polygon points="0,256 217,237 256,64 295,237 512,256" fill="#8B3FB8" />
      <polygon points="0,256 217,275 256,449 295,275 512,256" fill="#3B7DD8" />
    </svg>
  );
}
