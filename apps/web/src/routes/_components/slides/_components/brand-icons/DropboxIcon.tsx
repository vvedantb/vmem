interface IconProps {
  size?: number;
  className?: string;
}

export default function DropboxIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 2L0 6L6 10L12 6L6 2Z" fill="#0061FF" />
      <path d="M18 2L12 6L18 10L24 6L18 2Z" fill="#0061FF" />
      <path d="M0 14L6 18L12 14L6 10L0 14Z" fill="#0061FF" />
      <path d="M18 10L12 14L18 18L24 14L18 10Z" fill="#0061FF" />
      <path d="M6 19.5L12 15.5L18 19.5L12 23.5L6 19.5Z" fill="#0061FF" />
    </svg>
  );
}
