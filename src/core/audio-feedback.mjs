let audioContext = null;

function getAudioContext() {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) return null;
  audioContext ||= new AudioContextClass();
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

export function prepareAudioFeedback() {
  getAudioContext();
}

function playToneSequence(tones) {
  const context = getAudioContext();
  if (!context) return;
  const start = context.currentTime + 0.015;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, start);
  master.gain.exponentialRampToValueAtTime(0.12, start + 0.012);
  master.gain.exponentialRampToValueAtTime(0.0001, start + tones.at(-1).offset + tones.at(-1).duration + 0.08);
  master.connect(context.destination);
  tones.forEach(({ frequency, offset, duration }) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start + offset);
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.8, start + offset + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + duration + 0.02);
  });
}

export function playAppointmentCreatedSound() {
  playToneSequence([
    { frequency: 660, offset: 0, duration: 0.11 },
    { frequency: 880, offset: 0.1, duration: 0.16 },
  ]);
}

export function playAppointmentDeletedSound() {
  playToneSequence([
    { frequency: 520, offset: 0, duration: 0.09 },
    { frequency: 390, offset: 0.08, duration: 0.13 },
  ]);
}
