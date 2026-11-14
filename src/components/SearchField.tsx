import { useId, useRef, type FormEvent } from 'react';
import { useSpeech } from '../hooks/useSpeech';
import { useVoiceSearch } from '../hooks/useVoiceSearch';
import { useI18n } from '../i18n/I18nContext';
import { Icon } from './Icon';

interface SearchFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit?: () => void;
  readonly controls?: string;
}

export function SearchField({ value, onChange, onSubmit, controls }: SearchFieldProps) {
  const { t } = useI18n();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const { cancel } = useSpeech();
  const voice = useVoiceSearch((text) => {
    onChange(text);
    input.current?.focus();
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit?.();
  };

  const listening = voice.state === 'listening';
  return (
    <form className="search" role="search" onSubmit={submit}>
      <label htmlFor={id} className="visually-hidden">
        {t('home.searchLabel')}
      </label>
      <span className="search__icon">
        <Icon name="search" />
      </span>
      <input
        ref={input}
        id={id}
        className="search__input"
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        placeholder={listening ? t('voice.listening') : t('home.search')}
        value={value}
        onChange={(event) => {
          voice.clearError();
          onChange(event.target.value);
        }}
        aria-controls={controls}
      />
      {value && (
        <button
          type="button"
          className="search__btn"
          onClick={() => onChange('')}
          aria-label={t('a11y.clear')}
        >
          <Icon name="close" size={20} />
        </button>
      )}
      {voice.supported && (
        <button
          type="button"
          className={listening ? 'search__btn search__mic is-live' : 'search__btn search__mic'}
          aria-pressed={listening}
          aria-label={listening ? t('voice.listening') : t('voice.listen')}
          onClick={() => {
            cancel();
            if (listening) voice.stop();
            else voice.start();
          }}
        >
          <Icon name="mic" size={22} />
        </button>
      )}
      {voice.error && (
        <p className="search__error" role="alert">
          {t(voice.error)}
        </p>
      )}
    </form>
  );
}
