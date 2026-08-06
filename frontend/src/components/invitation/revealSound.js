// Procedural WebAudio sound worlds for the 4 signature invitation openings.
// Subtle, tasteful, non-intrusive. No external audio files / no licensing needed.
// Each returns a controller: { start(), stop(), setMuted(bool), muted }.

const AC = () => window.AudioContext || window.webkitAudioContext;

function makeReverb(ctx, seconds = 2.2, decay = 3.0) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  return conv;
}

function tone(ctx, dest, { freq, type = "sine", t0, dur, gain = 0.12, attack = 0.02, detune = 0, glideTo = null }) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  o.detune.value = detune;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(dest);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noiseBurst(ctx, dest, { t0, dur = 0.5, gain = 0.15, freq = 2400, q = 0.7 }) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp).connect(g).connect(dest);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

// A gentle sustained "string" pad (saw through lowpass + slow vibrato) — violin-ish.
function pad(ctx, dest, { freqs, t0, dur = 6, gain = 0.05 }) {
  freqs.forEach((f, i) => {
    const o = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const vib = ctx.createOscillator();
    const vibG = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.value = f;
    lp.type = "lowpass";
    lp.frequency.value = 1600;
    vib.frequency.value = 5.2;
    vibG.gain.value = f * 0.006;
    vib.connect(vibG).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 1.2 + i * 0.15);
    g.gain.setValueAtTime(gain, t0 + dur - 1.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(lp).connect(g).connect(dest);
    o.start(t0); vib.start(t0);
    o.stop(t0 + dur + 0.1); vib.stop(t0 + dur + 0.1);
  });
}

const PROFILES = {
  // Sealed Envelope: paper swish → wax-seal crack → warm resolving chord.
  envelope(ctx, out, now) {
    noiseBurst(ctx, out, { t0: now + 0.05, dur: 0.6, gain: 0.10, freq: 1800, q: 0.5 });   // paper slide
    tone(ctx, out, { freq: 140, type: "square", t0: now + 0.75, dur: 0.12, gain: 0.14 }); // seal crack (thock)
    noiseBurst(ctx, out, { t0: now + 0.78, dur: 0.18, gain: 0.12, freq: 900, q: 1.2 });
    noiseBurst(ctx, out, { t0: now + 1.35, dur: 0.7, gain: 0.08, freq: 2600, q: 0.4 });    // flap opening
    pad(ctx, out, { freqs: [196.0, 293.66, 392.0], t0: now + 1.4, dur: 6, gain: 0.045 });  // G major warmth
  },
  // Flower Garden: airy string pad + delicate celesta pentatonic sprinkle.
  garden(ctx, out, now) {
    pad(ctx, out, { freqs: [261.63, 329.63, 392.0, 493.88], t0: now + 0.1, dur: 7, gain: 0.04 });
    const notes = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
    notes.forEach((f, i) => tone(ctx, out, { freq: f, type: "triangle", t0: now + 0.5 + i * 0.28, dur: 1.6, gain: 0.06, attack: 0.01 }));
  },
  // Sparkling Ballroom: shimmering bell glissando + grand major swell.
  ballroom(ctx, out, now) {
    const up = [392.0, 523.25, 659.25, 783.99, 1046.5, 1318.5];
    up.forEach((f, i) => tone(ctx, out, { freq: f, type: "sine", t0: now + 0.15 + i * 0.12, dur: 1.4, gain: 0.05, attack: 0.005 }));
    pad(ctx, out, { freqs: [261.63, 329.63, 392.0, 523.25], t0: now + 0.9, dur: 6.5, gain: 0.05 }); // C major grand
    tone(ctx, out, { freq: 1567.98, type: "sine", t0: now + 1.6, dur: 2.2, gain: 0.03 });
  },
  // Modern Minimal: one clean bell ding + soft sub + short tail.
  minimal(ctx, out, now) {
    tone(ctx, out, { freq: 880.0, type: "sine", t0: now + 0.15, dur: 2.4, gain: 0.10, attack: 0.004 });
    tone(ctx, out, { freq: 1320.0, type: "sine", t0: now + 0.16, dur: 1.6, gain: 0.04 });
    tone(ctx, out, { freq: 110.0, type: "sine", t0: now + 0.1, dur: 2.0, gain: 0.06 });
  },
};

export function createRevealSound(styleKey) {
  let ctx = null, master = null, muted = false, started = false;
  const key = PROFILES[styleKey] ? styleKey : "minimal";

  const start = () => {
    if (started) return;
    started = true;
    try {
      const Ctor = AC();
      if (!Ctor) return;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      const verb = makeReverb(ctx, 2.4, 3.2);
      const verbGain = ctx.createGain();
      verbGain.gain.value = 0.5;
      master.connect(ctx.destination);
      verb.connect(verbGain).connect(ctx.destination);
      // route profile through both dry (master) and wet (verb)
      const bus = ctx.createGain();
      bus.connect(master);
      bus.connect(verb);
      if (ctx.state === "suspended") ctx.resume();
      PROFILES[key](ctx, bus, ctx.currentTime + 0.03);
    } catch (e) { /* audio unsupported — silently ignore */ }
  };

  const setMuted = (m) => {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
  };

  const stop = () => {
    try { if (ctx) { master && master.gain.setTargetAtTime(0, ctx.currentTime, 0.15); setTimeout(() => ctx && ctx.close(), 400); } } catch (e) {}
  };

  return { start, stop, setMuted, get muted() { return muted; } };
}
