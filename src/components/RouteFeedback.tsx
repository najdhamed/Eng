import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { MessageKey } from '../i18n/translate';
import type { PlannedRoute } from '../navigation/planner';
import {
  NOTE_MAX,
  REASONS,
  addFeedback,
  readFeedback,
  recentAnswer,
  removeFeedback,
  type FeedbackEntry,
  type Reason,
  type Verdict,
} from '../services/feedback';
import { Icon } from './Icon';

type Focus = 'details' | 'thanks' | 'title';

/**
 * Shown once the visitor has arrived: was the route right? One tap for "yes";
 * "no" opens a short list of what went wrong and an optional note.
 * The answer is kept on this device only (see services/feedback).
 */
export function RouteFeedback({ route, guided }: { route: PlannedRoute; guided: boolean }) {
  const tr = useI18n();
  const from = route.start.id;
  const to = route.destination.id;
  const noteId = useId();

  // A refresh on the arrival screen must not ask again for the route just answered.
  const [given, setGiven] = useState<FeedbackEntry | null>(() =>
    recentAnswer(readFeedback(), from, to),
  );
  const [reporting, setReporting] = useState(false);
  const [reasons, setReasons] = useState<readonly Reason[]>([]);
  const [note, setNote] = useState('');

  // Focus moves with the screen: a keyboard or screen-reader user must not be left on a button that vanished.
  const focusNext = useRef<Focus | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const details = useRef<HTMLHeadingElement>(null);
  const thanks = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const target = { details, thanks, title }[focusNext.current ?? 'title'];
    if (focusNext.current) target.current?.focus();
    focusNext.current = null;
  }, [given, reporting]);

  const save = (verdict: Verdict) => {
    const entry = addFeedback({
      from,
      to,
      verdict,
      reasons: verdict === 'wrong' ? reasons : [],
      note: verdict === 'wrong' ? note : '',
      mobility: route.mobility,
      guided,
      locale: tr.locale,
    });
    focusNext.current = 'thanks';
    setReporting(false);
    setGiven(entry);
  };

  const undo = () => {
    if (given) removeFeedback(given.at);
    focusNext.current = 'title';
    setGiven(null);
    setReasons([]);
    setNote('');
  };

  const toggle = (reason: Reason) =>
    setReasons((now) =>
      now.includes(reason) ? now.filter((item) => item !== reason) : [...now, reason],
    );

  if (given) {
    return (
      <section className="feedback" aria-labelledby={`${noteId}-thanks`}>
        <p id={`${noteId}-thanks`} className="feedback__thanks" ref={thanks} tabIndex={-1}>
          <Icon name="check" size={20} strokeWidth={2.4} />
          {tr.t(given.verdict === 'right' ? 'feedback.thanksRight' : 'feedback.thanksWrong')}
        </p>
        <button type="button" className="btn btn--ghost btn--sm" onClick={undo}>
          {tr.t('feedback.undo')}
        </button>
      </section>
    );
  }

  if (reporting) {
    return (
      <section className="feedback" aria-labelledby={`${noteId}-what`}>
        <h3 id={`${noteId}-what`} className="feedback__title" ref={details} tabIndex={-1}>
          {tr.t('feedback.whatWrong')}
        </h3>
        <p className="feedback__sub">{tr.t('feedback.whatWrongHint')}</p>
        <div className="feedback__reasons">
          {REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              className="chip-btn"
              aria-pressed={reasons.includes(reason)}
              onClick={() => toggle(reason)}
            >
              {tr.t(`feedback.reason.${reason}` satisfies MessageKey)}
            </button>
          ))}
        </div>
        <label className="feedback__label" htmlFor={noteId}>
          {tr.t('feedback.note')}
        </label>
        <textarea
          id={noteId}
          className="feedback__note"
          rows={3}
          maxLength={NOTE_MAX}
          value={note}
          placeholder={tr.t('feedback.notePlaceholder')}
          onChange={(event) => setNote(event.target.value)}
        />
        <div className="feedback__actions">
          <button type="button" className="btn btn--primary" onClick={() => save('wrong')}>
            {tr.t('feedback.send')}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              focusNext.current = 'title';
              setReporting(false);
            }}
          >
            {tr.t('feedback.back')}
          </button>
        </div>
        <p className="feedback__private">{tr.t('feedback.private')}</p>
      </section>
    );
  }

  return (
    <section className="feedback" aria-labelledby={`${noteId}-q`}>
      <h3 id={`${noteId}-q`} className="feedback__title" ref={title} tabIndex={-1}>
        {tr.t('feedback.title')}
      </h3>
      <p className="feedback__sub">{tr.t('feedback.sub')}</p>
      <div className="feedback__choices">
        <button
          type="button"
          className="btn btn--outline feedback__yes"
          onClick={() => save('right')}
        >
          <Icon name="check" size={22} strokeWidth={2.4} />
          {tr.t('feedback.right')}
        </button>
        <button
          type="button"
          className="btn btn--outline feedback__no"
          onClick={() => {
            focusNext.current = 'details';
            setReporting(true);
          }}
        >
          <Icon name="alert" size={22} />
          {tr.t('feedback.wrong')}
        </button>
      </div>
      <p className="feedback__private">{tr.t('feedback.private')}</p>
    </section>
  );
}
