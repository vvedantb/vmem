interface LinearIconProps {
  size?: number;
  // Unused — kept for API parity with @tabler/icons-react icons so the same
  // iconMap can render Tabler icons and this inline SVG interchangeably.
  stroke?: number;
  className?: string;
}

/**
 * Linear brand mark. Inline SVG because @tabler/icons-react does not ship
 * `IconBrandLinear`. Path sourced from Linear's public brand assets.
 */
export default function LinearIcon({ size = 24, className }: LinearIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M1.22541 61.5228c-.2225-.9485.90748-1.5459 1.59638-.857L39.3342 97.1782c.6889.6889.0915 1.8189-.857 1.5964C20.0515 94.4522 5.54779 79.9485 1.22541 61.5228ZM.00189 46.8891c-.01237.14934.04259.29565.14852.40158l55.85791 55.8579c.1059.1059.2522.1609.4016.1486 3.0952-.2547 6.0725-.9099 8.8726-1.9073L1.90917 38.0163C.91181 40.8164.25665 43.7939.00189 46.8891ZM4.21093 29.7072c-.16085.35454-.08346.77233.19354 1.04933l64.8451 64.845c.277.277.6948.3543 1.0493.1935 2.1703-.9847 4.2412-2.1763 6.1836-3.5584L7.76933 23.5236C6.3872 25.466 5.19562 27.5369 4.21093 29.7072ZM12.6003 18.6099c-.4196.4196-.4417 1.0898-.0443 1.5289 15.3409 16.9586 21.1282 31.6325 30.2075 33.0196.4395.0672 1.0117-.1468 1.4313-.5664l33.0193-30.2074c.4391-.3974.4172-1.0676-.0024-1.4872C69.2149 12.4687 54.5486 6.68049 40.1603 7.10034c-.4346.01269-.9042.42555-1.0867.6081L12.6003 18.6099ZM47.137 1.24706c-.4312.01262-.771.3694-.7089.7961l.0002.00096L59.7745 83.8558c.0621.4265.4672.7079.883.6146 11.0305-2.4755 19.7128-11.1578 22.1883-22.1883.0933-.4158-.1882-.8208-.6148-.8828L47.137 1.24706Z" />
    </svg>
  );
}
