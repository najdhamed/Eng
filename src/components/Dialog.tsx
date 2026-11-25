import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { Icon } from './Icon';

interface DialogProps {
  readonly title: string;
  readonly open: boolean;
  readonly onClose?: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}

/**
 * A bottom sheet on phones and a centred card on wider screens, built on the
 * native <dialog> element so focus trapping and Escape come from the browser.
 */
export function Dialog({ title, open, onClose, children, footer }: DialogProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const body = useRef<HTMLDivElement>(null);
  // Long content scrolls; a scrolling area must be reachable with the keyboard.
  const [scrolls, setScrolls] = useState(false);

  useEffect(() => {
    const element = body.current;
    if (!element || !open || typeof ResizeObserver === 'undefined') return;
    const measure = () => setScrolls(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [open, children]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute('open', '');
      }
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose?.();
      }}
    >
      <div className="sheet__head">
        <h2 id={titleId} className="sheet__title">
          {title}
        </h2>
        {onClose && (
          <button
            type="button"
            className="icon-btn icon-btn--ghost"
            onClick={onClose}
            aria-label={t('a11y.close')}
          >
            <Icon name="close" />
          </button>
        )}
      </div>
      <div
        ref={body}
        className="sheet__body"
        {...(scrolls ? { tabIndex: 0, role: 'group', 'aria-labelledby': titleId } : {})}
      >
        {children}
      </div>
      {footer && <div className="sheet__foot">{footer}</div>}
    </dialog>
  );
}
