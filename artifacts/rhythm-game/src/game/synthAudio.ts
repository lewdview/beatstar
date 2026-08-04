/**
 * Procedural Web Audio Synthesizer for PIM Rhythm Engine
 * Generates BPM-synced synthetic audio buffers when offline or when remote audio URLs are unavailable.
 */

export function generateSyntheticAudioBuffer(
  audioCtx: AudioContext,
  bpm: number = 120,
  duration: number = 120
): AudioBuffer {
  const sampleRate = audioCtx.sampleRate || 44100;
  const numSamples = Math.floor(sampleRate * Math.min(duration, 300)); // Cap at 5 mins
  const buffer = audioCtx.createBuffer(2, numSamples, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  const beatDur = 60 / bpm;
  const eighthDur = beatDur / 2;

  // Scale degrees for synth arpeggio (A minor scale in Hz: A2, C3, E3, G3, A3, C4, E4)
  const scale = [110.0, 130.81, 164.81, 196.0, 220.0, 261.63, 329.63];

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const beatIndex = Math.floor(t / beatDur);
    const timeInBeat = t % beatDur;
    const timeInEighth = t % eighthDur;

    let sampleL = 0;
    let sampleR = 0;

    // 1. Kick Drum (Beats 1, 2, 3, 4) - Pitch sweep 140Hz -> 35Hz
    if (timeInBeat < 0.18) {
      const kickEnv = Math.exp(-timeInBeat * 25);
      const kickFreq = 35 + 105 * Math.exp(-timeInBeat * 40);
      const kickWave = Math.sin(2 * Math.PI * kickFreq * timeInBeat);
      sampleL += kickWave * kickEnv * 0.7;
      sampleR += kickWave * kickEnv * 0.7;
    }

    // 2. Snare Drum (Beats 2 and 4)
    if (beatIndex % 2 === 1 && timeInBeat < 0.22) {
      const snareEnv = Math.exp(-timeInBeat * 18);
      const noise = (Math.random() * 2 - 1) * 0.4;
      const body = Math.sin(2 * Math.PI * 180 * timeInBeat) * 0.3 * Math.exp(-timeInBeat * 30);
      sampleL += (noise + body) * snareEnv * 0.5;
      sampleR += (noise + body) * snareEnv * 0.5;
    }

    // 3. Hi-Hat (Every 8th note)
    if (timeInEighth < 0.05) {
      const hatEnv = Math.exp(-timeInEighth * 80);
      const hatNoise = (Math.random() * 2 - 1) * 0.2;
      sampleL += hatNoise * hatEnv * 0.3;
      sampleR += hatNoise * hatEnv * 0.3;
    }

    // 4. Synth Arpeggio (16th notes)
    const sixteenthDur = beatDur / 4;
    const sixteenthIndex = Math.floor(t / sixteenthDur);
    const timeInSixteenth = t % sixteenthDur;
    const noteFreq = scale[sixteenthIndex % scale.length];
    const synthEnv = Math.exp(-timeInSixteenth * 12);
    
    // Sawtooth-like wave with stereo width
    const phaseL = (t * noteFreq) % 1;
    const phaseR = (t * noteFreq * 1.003) % 1; // Slight detune for stereo width
    const sawL = (2 * phaseL - 1) * 0.15;
    const sawR = (2 * phaseR - 1) * 0.15;

    sampleL += sawL * synthEnv;
    sampleR += sawR * synthEnv;

    // Normalize & write to channels
    left[i] = Math.max(-1, Math.min(1, sampleL * 0.8));
    right[i] = Math.max(-1, Math.min(1, sampleR * 0.8));
  }

  return buffer;
}

/**
 * Helper to turn an AudioBuffer into a Data URL WAV string if needed
 */
export function audioBufferToWavDataUrl(buffer: AudioBuffer): string {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const numSamples = buffer.length;

  const blockAlign = (numChannels * bitDepth) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  const channels: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}
