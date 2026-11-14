import { useId, type KeyboardEvent, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { IconName } from '../icons/paths';
import { Icon } from './Icon';

export interface SegmentOption<T extends string | number> {
  readonly value: T;
  readonly label: string;
  readonly sub?: string;
  readonly icon?: IconName;
  readonly badge?: ReactNode;
}

interface SegmentedProps<T extends string | number> {
  readonly label: string;
  readonly value: T;
  readonly options: readonly SegmentOption<T>[];
  readonly onChange: (value: T) => void;
  readonly variant?: 'pills' | 'cards' | 'floors';
  readonly hideLabel?: boolean;
}

/** A radio group drawn as buttons, with arrow-key movement like native radios. */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  variant = 'pills',
  hideLabel = false,
}: SegmentedProps<T>) {
  const id = useId();
  const { dir } = useI18n();

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys =
      dir === 'rtl'
        ? { next: 'ArrowLeft', prev: 'ArrowRight' }
        : { next: 'ArrowRight', prev: 'ArrowLeft' };
    const index = options.findIndex((option) => option.value === value);
    let next = index;
    if (event.key === keys.next || event.key === 'ArrowDown') next = (index + 1) % options.length;
    else if (event.key === keys.prev || event.key === 'ArrowUp')
      next = (index - 1 + options.length) % options.length;
    else return;
    event.preventDefault();
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons[next]?.focus();
  };

  return (
    <div className={`segmented segmented--${variant}`}>
      <span id={id} className={hideLabel ? 'visually-hidden' : 'segmented__label'}>
        {label}
      </span>
      {/* Arrow keys move between the radios inside, which carry the focus (roving tabindex). */}
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus */}
      <div
        role="radiogroup"
        aria-labelledby={id}
        className="segmented__options"
        onKeyDown={onKeyDown}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              className="segmented__option"
              onClick={() => onChange(option.value)}
            >
              {option.icon && <Icon name={option.icon} size={variant === 'cards' ? 30 : 20} />}
              <span className="segmented__text">
                <span className="segmented__name">{option.label}</span>
                {option.sub && <span className="segmented__sub">{option.sub}</span>}
              </span>
              {option.badge}
            </button>
          );
        })}
      </div>
    </div>
  );
}
