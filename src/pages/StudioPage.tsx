import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from '../components/Icon';
import { useSpeech } from '../hooks/useSpeech';
import { useI18n } from '../i18n/I18nContext';
import type { MessageKey } from '../i18n/translate';
import {
  buildCatalogue,
  coverage,
  type Atom,
  type AtomGroup,
  type Catalogue,
} from '../voice/catalogue';
import { Recorder } from '../voice/recorder';
import { spellNumbers } from '../voice/text';
import { voiceEngine } from '../voice/voice';

const GROUPS: readonly { group: AtomGroup; label: MessageKey }[] = [
  { group: 'phrase', label: 'studio.groupPhrase' },
  { group: 'number', label: 'studio.groupNumber' },
  { group: 'floor', label: 'studio.groupFloor' },
  { group: 'place', label: 'studio.groupPlace' },
];

const catalogues = new Map<string, Catalogue>();

type Phase =
  | { kind: 'idle' }
  | { kind: 'recording' }
  | { kind: 'saving' }
  | { kind: 'saved'; key: string; ms: number }
  | { kind: 'problem'; message: MessageKey };

/**
 * Where the team records the Saudi voice. Each phrase is recorded once, and the
 * app rebuilds every sentence from them (see voice/catalogue.ts). Recordings
 * stay on this device until exported, so they can be sent to the developers and
 * shipped with the site.
 */
export function StudioPage() {
  const tr = useI18n();
  const { locale } = tr;
  const speech = useSpeech();
  const pack = useSyncExternalStore(
    voiceEngine.subscribe,
    voiceEngine.getSnapshot,
    voiceEngine.getSnapshot,
  );

  const [catalogue, setCatalogue] = useState<Catalogue | null>(catalogues.get(locale) ?? null);
  const [focus, setFocus] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [level, setLevel] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const recorder = useRef<Recorder | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const canRecord = Recorder.supported();

  // The list of phrases takes a moment to work out, so show the page first.
  useEffect(() => {
    void voiceEngine.load(locale);
    const cached = catalogues.get(locale);
    if (cached) {
      setCatalogue(cached);
      return;
    }
    setCatalogue(null);
    const timer = window.setTimeout(() => {
      const built = buildCatalogue(locale);
      catalogues.set(locale, built);
      setCatalogue(built);
    }, 40);
    return () => window.clearTimeout(timer);
  }, [locale]);

  useEffect(() => () => recorder.current?.cancel(), []);

  const recorded = useMemo(
    () => new Set(voiceEngine.keys(locale)),
    [locale, pack.version], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const stats = useMemo(
    () => (catalogue ? coverage(catalogue, recorded) : null),
    [catalogue, recorded],
  );

  const order = useMemo(() => catalogue?.atoms ?? [], [catalogue]);
  const firstTodo = order.find((atom) => !recorded.has(atom.key));
  const current: Atom | undefined =
    order.find((atom) => atom.key === focus) ?? firstTodo ?? order[0];

  const nextAfter = useCallback(
    (key: string) => {
      const from = order.findIndex((atom) => atom.key === key);
      const after = [...order.slice(from + 1), ...order.slice(0, from)];
      return after.find((atom) => !recorded.has(atom.key) && atom.key !== key)?.key ?? null;
    },
    [order, recorded],
  );

  const start = async () => {
    if (!current) return;
    setMessage(null);
    try {
      const r = new Recorder(setLevel);
      await r.start();
      recorder.current = r;
      setPhase({ kind: 'recording' });
    } catch {
      setPhase({ kind: 'problem', message: 'studio.micDenied' });
    }
  };

  const stop = async () => {
    const r = recorder.current;
    if (!r || !current) return;
    recorder.current = null;
    setPhase({ kind: 'saving' });
    try {
      const clip = await r.stop();
      if (clip.silent || clip.ms < 120) {
        setPhase({ kind: 'problem', message: 'studio.noSound' });
        return;
      }
      await voiceEngine.save(locale, {
        key: current.key,
        text: current.text,
        wav: clip.wav,
        ms: clip.ms,
      });
      setPhase({ kind: 'saved', key: current.key, ms: clip.ms });
      setFocus(nextAfter(current.key));
    } catch {
      setPhase({ kind: 'problem', message: 'studio.noSound' });
    }
  };

  const exportPack = async () => {
    const zip = await voiceEngine.exportZip(locale);
    const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `darbak-voice-${locale}.zip`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const importPack = async (file: File | undefined) => {
    if (!file) return;
    try {
      const added = await voiceEngine.importZip(locale, new Uint8Array(await file.arrayBuffer()));
      setMessage(tr.t('studio.imported', { n: added }));
    } catch (error) {
      setMessage(
        tr.t('studio.importFailed', {
          reason: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  };

  const percent =
    stats && stats.routesTotal ? Math.floor((stats.routesFull / stats.routesTotal) * 100) : 0;
  const finished = stats !== null && stats.atomsDone === stats.atomsTotal && stats.atomsTotal > 0;
  const recording = phase.kind === 'recording';
  const busy = phase.kind === 'saving';
  const isRecorded = current ? recorded.has(current.key) : false;
  const spelled = current && current.group === 'number' ? spellNumbers(current.text) : null;

  return (
    <div className="page studio">
      <header className="page-head">
        <h1 id="page-title" tabIndex={-1}>
          {tr.t('studio.title')}
        </h1>
        <a className="btn btn--ghost btn--sm" href="#prefs">
          {tr.t('studio.back')}
        </a>
      </header>

      {!canRecord && (
        <p className="notice notice--warn">
          <Icon name="alert" />
          <span>{tr.t('studio.noRecorder')}</span>
        </p>
      )}

      <section className="card studio__intro">
        <p>{tr.t('studio.intro', { n: catalogue?.atoms.length ?? '…' })}</p>
        <p className="studio__tip">{tr.t('studio.tip')}</p>
        <p className="studio__tip">{tr.t('studio.fallbackNote')}</p>
      </section>

      {!catalogue || !stats ? (
        <p className="studio__loading" role="status">
          {tr.t('studio.building')}
        </p>
      ) : (
        <>
          <section className="card studio__progress" aria-live="polite">
            <div
              className="studio__bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={stats.atomsTotal}
              aria-valuenow={stats.atomsDone}
              aria-label={tr.t('studio.progress', {
                done: stats.atomsDone,
                total: stats.atomsTotal,
              })}
            >
              <span style={{ inlineSize: `${(stats.atomsDone / stats.atomsTotal) * 100}%` }} />
            </div>
            <p className="studio__count">
              {tr.t('studio.progress', { done: stats.atomsDone, total: stats.atomsTotal })}
              <span> · {tr.t('studio.routes', { percent })}</span>
            </p>
          </section>

          {finished && (
            <p className="notice notice--ok" role="status">
              <Icon name="check" />
              <span>{tr.t('studio.done')}</span>
            </p>
          )}

          {current && (
            <section className="card studio__now" aria-label={tr.t('studio.current')}>
              <p className="studio__label">{tr.t('studio.current')}</p>
              <p className="studio__phrase" lang={locale} dir={tr.dir}>
                {current.text}
              </p>
              {spelled && spelled !== current.text && (
                <p className="studio__spelled">{tr.t('studio.readAs', { words: spelled })}</p>
              )}
              <p className="studio__example" lang={locale} dir={tr.dir}>
                {tr.t('studio.example', { sentence: current.example })}
              </p>

              <div className="studio__meter" aria-hidden="true">
                <span style={{ inlineSize: `${Math.round(level * 100)}%` }} />
              </div>

              <div className="studio__controls">
                {recording ? (
                  <button
                    type="button"
                    className="btn btn--primary btn--lg btn--grow studio__rec is-on"
                    onClick={stop}
                  >
                    <Icon name="mute" />
                    {tr.t('studio.stop')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn--primary btn--lg btn--grow studio__rec"
                    disabled={!canRecord || busy}
                    onClick={start}
                  >
                    <Icon name="mic" />
                    {isRecorded ? tr.t('studio.redo') : tr.t('studio.record')}
                  </button>
                )}
                {isRecorded && !recording && (
                  <button
                    type="button"
                    className="btn btn--soft btn--square"
                    aria-label={tr.t('studio.play')}
                    onClick={() => void voiceEngine.preview(locale, current.key)}
                  >
                    <Icon name="speaker" />
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={recording || busy}
                  onClick={() => setFocus(nextAfter(current.key))}
                >
                  {tr.t('studio.skip')}
                </button>
              </div>

              <p className="studio__status" role="status">
                {recording && tr.t('studio.recording')}
                {phase.kind === 'saved' &&
                  tr.t('studio.saved', { seconds: (phase.ms / 1000).toFixed(1) })}
                {phase.kind === 'problem' && tr.t(phase.message)}
              </p>
            </section>
          )}

          <section className="card studio__list" aria-label={tr.t('studio.list')}>
            {GROUPS.map(({ group, label }) => {
              const atoms = order.filter((atom) => atom.group === group);
              if (atoms.length === 0) return null;
              const done = atoms.filter((atom) => recorded.has(atom.key)).length;
              return (
                <details key={group} open={group === current?.group}>
                  <summary>
                    <span>{tr.t(label)}</span>
                    <span className="chip">
                      {done}/{atoms.length}
                    </span>
                  </summary>
                  <ul className="studio__items">
                    {atoms.map((atom) => {
                      const has = recorded.has(atom.key);
                      return (
                        <li key={atom.key}>
                          <button
                            type="button"
                            className={
                              atom.key === current?.key ? 'studio__item is-current' : 'studio__item'
                            }
                            aria-current={atom.key === current?.key ? 'true' : undefined}
                            disabled={recording || busy}
                            onClick={() => {
                              setFocus(atom.key);
                              setPhase({ kind: 'idle' });
                            }}
                          >
                            <span
                              className={has ? 'studio__tick is-done' : 'studio__tick'}
                              aria-hidden="true"
                            >
                              {has && <Icon name="check" size={16} strokeWidth={2.6} />}
                            </span>
                            <span className="studio__item-text" lang={locale} dir={tr.dir}>
                              {atom.text}
                            </span>
                          </button>
                          {has && (
                            <button
                              type="button"
                              className="icon-btn icon-btn--ghost"
                              aria-label={`${tr.t('studio.delete')}: ${atom.text}`}
                              disabled={recording || busy}
                              onClick={() => void voiceEngine.remove(locale, atom.key)}
                            >
                              <Icon name="trash" size={18} />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              );
            })}
          </section>

          <section className="card studio__share">
            <button
              type="button"
              className="btn btn--soft"
              disabled={pack && recorded.size === 0}
              onClick={() => speech.speak(tr.t('prefs.testPhrase'), { force: true })}
            >
              <Icon name="speaker" />
              {tr.t('studio.testSentence')}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={recorded.size === 0}
              onClick={() => void exportPack()}
            >
              <Icon name="printer" />
              {tr.t('studio.export')}
            </button>
            <p className="settings__note">{tr.t('studio.exportSub')}</p>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => fileInput.current?.click()}
            >
              {tr.t('studio.import')}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".zip,application/zip"
              hidden
              onChange={(event) => {
                void importPack(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            {confirmClear ? (
              <button
                type="button"
                className="btn btn--outline"
                onClick={() => {
                  setConfirmClear(false);
                  void voiceEngine.clearDevice(locale);
                }}
              >
                <Icon name="trash" />
                {tr.t('studio.clearSure')}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--ghost"
                disabled={recorded.size === 0}
                onClick={() => setConfirmClear(true)}
              >
                {tr.t('studio.clear')}
              </button>
            )}
            {message && (
              <p className="settings__note" role="status">
                {message}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
