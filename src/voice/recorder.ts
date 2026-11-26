import { processRecording, type ProcessedClip } from './wav';

/**
 * Records one phrase from the microphone and cleans it up (see wav.ts).
 * `onLevel` reports the input loudness (0 to 1) so the speaker can see that
 * they are being heard.
 */
export class Recorder {
  private stream: MediaStream | null = null;
  private media: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private context: AudioContext | null = null;
  private frame = 0;

  static supported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== 'undefined'
    );
  }

  constructor(private readonly onLevel?: (level: number) => void) {}

  /** Asks for the microphone (if needed) and starts. Throws if the person says no. */
  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: true,
        autoGainControl: false,
      },
    });
    this.chunks = [];
    this.media = new MediaRecorder(this.stream);
    this.media.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    this.media.start();
    this.watchLevel();
  }

  private watchLevel(): void {
    if (!this.onLevel || !this.stream) return;
    try {
      this.context = new AudioContext();
      const source = this.context.createMediaStreamSource(this.stream);
      const analyser = this.context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const value of data) peak = Math.max(peak, Math.abs(value - 128));
        this.onLevel?.(Math.min(1, peak / 90));
        this.frame = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // No meter: recording still works.
    }
  }

  private release(): void {
    cancelAnimationFrame(this.frame);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.onLevel?.(0);
  }

  /** Stops, and returns the cleaned-up clip. */
  async stop(): Promise<ProcessedClip> {
    const media = this.media;
    if (!media) throw new Error('Not recording');
    const finished = new Promise<void>((resolve) => {
      media.onstop = () => resolve();
    });
    if (media.state !== 'inactive') media.stop();
    await finished;
    this.release();
    this.media = null;

    const blob = new Blob(this.chunks, { type: media.mimeType });
    const decoder = new AudioContext();
    try {
      const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
      const mono = new Float32Array(decoded.length);
      for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
        const data = decoded.getChannelData(channel);
        for (let i = 0; i < data.length; i += 1)
          mono[i] = mono[i]! + data[i]! / decoded.numberOfChannels;
      }
      return processRecording(mono, decoded.sampleRate);
    } finally {
      void decoder.close().catch(() => undefined);
    }
  }

  cancel(): void {
    if (this.media && this.media.state !== 'inactive') {
      this.media.onstop = null;
      this.media.stop();
    }
    this.media = null;
    this.release();
  }
}
