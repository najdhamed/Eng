import { ICON_PATHS, type IconName } from '../icons/paths';

interface IconProps {
  readonly name: IconName;
  readonly size?: number;
  readonly strokeWidth?: number;
  readonly className?: string;
  /** Gives the icon an accessible name. Leave out for decorative icons. */
  readonly label?: string;
}

export function Icon({ name, size = 24, strokeWidth = 1.75, className, label }: IconProps) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
