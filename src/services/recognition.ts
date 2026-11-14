/**
 * Minimal typings for the Web Speech API's SpeechRecognition, which is not in
 * TypeScript's DOM library. Chrome, Edge and Safari expose it (Chrome and
 * Safari as webkitSpeechRecognition); Firefox does not.
 */
export interface RecognitionResultEvent {
  readonly results: ArrayLike<ArrayLike<{ readonly transcript: string }>>;
}

export interface RecognitionErrorEvent {
  readonly error: string;
}

export interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

type RecognitionConstructor = new () => Recognition;

export function getRecognition(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
