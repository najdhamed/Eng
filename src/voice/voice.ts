import { speaker } from '../services/speech';
import { createVoiceEngine } from './engine';
import { createSayer } from './say';

/** The one recorded-voice engine and the one voice chooser for the whole app. */
export const voiceEngine = createVoiceEngine();
export const sayer = createSayer(voiceEngine, speaker);
