export default function GrokLogo({ className }: { className?: string }) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M9.27 15.29 15.79 6h-2.64l-5.2 7.41zm7.54-9.29-8.2 11.67H6l8.2-11.67zM3.59 21l4.52-6.44L9.56 17 6.22 21zm10.72-7.24L17.71 18H15.1l-2.07-2.95zM18 6v12h-2V6z"
      />
    </svg>
  );
}
