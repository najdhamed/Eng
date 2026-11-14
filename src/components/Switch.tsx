import { useId } from 'react';
import type { IconName } from '../icons/paths';
import { Icon } from './Icon';

interface SwitchProps {
  readonly label: string;
  readonly description?: string;
  readonly icon?: IconName;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

export function Switch({ label, description, icon, checked, onChange }: SwitchProps) {
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={description ? `${id}-d` : undefined}
      className="switch-row"
      onClick={() => onChange(!checked)}
    >
      {icon && (
        <span className="switch-row__icon">
          <Icon name={icon} />
        </span>
      )}
      <span className="switch-row__text">
        <span className="switch-row__label">{label}</span>
        {description && (
          <span id={`${id}-d`} className="switch-row__sub">
            {description}
          </span>
        )}
      </span>
      <span className="switch" aria-hidden="true">
        <span className="switch__thumb" />
      </span>
    </button>
  );
}
