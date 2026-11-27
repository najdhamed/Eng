#!/usr/bin/env python3
"""Reads phrases aloud with an open text-to-speech model, for scripts/generate-voice.ts.

The generator starts this once and talks to it over standard input and output,
one JSON object per line:

    in:   {"text": "لِفّ يَمِين"}
    out:  {"wav": "<base64 of a 16-bit mono WAV file>"}   or   {"error": "…"}

It first prints {"ready": true, "name": "<model folder>", "rate": 22050}.

Needs the sherpa-onnx package (the 1.x line still bundles the espeak phonemiser
that the Arabic Piper voices rely on):

    pip install "sherpa-onnx<2" numpy

and a model folder from https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models
for example vits-piper-ar_JO-kareem-medium (Piper) or nabra-82m-arabic-int8 (Kokoro).
"""
import base64
import io
import json
import os
import sys
import wave


def fail(message):
    sys.stdout.write(json.dumps({"error": message}, ensure_ascii=False) + "\n")
    sys.stdout.flush()
    sys.exit(2)


def load(folder):
    try:
        import numpy  # noqa: F401
        import sherpa_onnx
    except ImportError:
        fail('Python packages are missing. Run: pip install "sherpa-onnx<2" numpy')
    if int(sherpa_onnx.__version__.split(".")[0]) >= 2:
        fail('sherpa-onnx %s no longer includes the Arabic phonemiser. Run: pip install "sherpa-onnx<2"' % sherpa_onnx.__version__)
    if not os.path.isdir(folder):
        fail("Model folder not found: %s" % folder)

    tokens = os.path.join(folder, "tokens.txt")
    data_dir = os.path.join(folder, "espeak-ng-data")
    voices = os.path.join(folder, "voices.bin")
    if os.path.exists(voices):
        model = os.path.join(folder, "model.int8.onnx")
        if not os.path.exists(model):
            model = os.path.join(folder, "model.onnx")
        kind = sherpa_onnx.OfflineTtsModelConfig(
            kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
                model=model, voices=voices, tokens=tokens, data_dir=data_dir, lang="ar"
            ),
            num_threads=2,
            provider="cpu",
        )
    else:
        models = [f for f in os.listdir(folder) if f.endswith(".onnx")]
        if len(models) != 1:
            fail("Expected exactly one .onnx file in %s, found %d" % (folder, len(models)))
        kind = sherpa_onnx.OfflineTtsModelConfig(
            vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                model=os.path.join(folder, models[0]), tokens=tokens, data_dir=data_dir
            ),
            num_threads=2,
            provider="cpu",
        )
    config = sherpa_onnx.OfflineTtsConfig(model=kind)
    if not config.validate():
        fail("The model folder is not a usable sherpa-onnx voice: %s" % folder)
    return sherpa_onnx.OfflineTts(config)


def wav_bytes(samples, rate):
    import numpy as np

    pcm = (np.clip(np.asarray(samples, dtype=np.float32), -1.0, 1.0) * 32767.0).astype("<i2")
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(pcm.tobytes())
    return buffer.getvalue()


def main():
    if len(sys.argv) != 2:
        fail("Usage: piper_voice.py MODEL_FOLDER")
    folder = os.path.normpath(sys.argv[1])
    tts = load(folder)
    sys.stdout.write(
        json.dumps({"ready": True, "name": os.path.basename(folder), "rate": tts.sample_rate}) + "\n"
    )
    sys.stdout.flush()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            text = json.loads(line)["text"]
            audio = tts.generate(text, sid=0, speed=1.0)
            if len(audio.samples) == 0:
                raise RuntimeError("the model made no sound for this text")
            reply = {"wav": base64.b64encode(wav_bytes(audio.samples, audio.sample_rate)).decode("ascii")}
        except Exception as error:  # one bad phrase must not stop the run
            reply = {"error": str(error)}
        sys.stdout.write(json.dumps(reply, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
