/**
 * The Darbak symbol (the letter dal drawn as a map pin), from the brand
 * identity. It takes its colour from the text colour around it, so it can be
 * white on the navy bar, blue on white, or yellow in high contrast.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="28 28 144 144"
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M58 28 H100 A72 72 0 0 1 100 172 H28 V58 A30 30 0 0 1 58 28 Z M92 172 L69.6 111.2 A34 34 0 1 1 130.4 111.2 L108 172 Z"
      />
      <circle cx="100" cy="96" r="13" />
    </svg>
  );
}
