import type { Category } from '../domain/types';
import type { IconName } from '../icons/paths';
import { Icon } from './Icon';

export type Tone = 'primary' | 'soft' | 'warn' | 'ok' | 'neutral';

export function toneFor(category: Category): Tone {
  if (category === 'emergency') return 'warn';
  if (category === 'exit' || category === 'entrance') return 'ok';
  if (category === 'facility') return 'neutral';
  return 'soft';
}

interface PictogramProps {
  readonly icon: IconName;
  readonly tone?: Tone;
  readonly size?: 'sm' | 'md' | 'lg' | 'xl';
}

/** The square sign-style tile every place is shown with. */
export function Pictogram({ icon, tone = 'soft', size = 'md' }: PictogramProps) {
  const px = { sm: 18, md: 24, lg: 30, xl: 44 }[size];
  return (
    <span className={`pictogram pictogram--${tone} pictogram--${size}`}>
      <Icon name={icon} size={px} strokeWidth={size === 'xl' ? 2 : 1.85} />
    </span>
  );
}
