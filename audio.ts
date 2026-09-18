// audio.ts

// We declare the context outside, but initialize it ONLY in the browser
let ctx: AudioContext | null = null;

export const playSound = (type: 'alert' | 'focus' | 'success') => {
  // 1. SSR Check: Don't run on the Next.js server
  if (typeof window === 'undefined') return;

  // 2. Initialize AudioContext lazily on the first interaction
  if (!ctx) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return; // Failsafe if browser doesn't support Web Audio
    ctx = new AudioCtx();
  }

  // 3. Browser Policy Check: Resume context if the browser suspended it
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const t = ctx.currentTime;

  if (type === 'alert') {
    // Discord / Slack hybrid: Warm two-tone melodic ping (D5 -> G5)
    [587.33, 783.99].forEach((freq, i) => {
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle'; // Warmer harmonic profile
      osc.frequency.setValueAtTime(freq, t + i * 0.08);
      gain.gain.setValueAtTime(0.3, t + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.26);
    });
  } 
  else if (type === 'focus') {
    /**
     * NEW FOCUS AUDIO SPECIFICATION:
     * - "Warm Water Droplet meets Singing Bowl"
     * - Uses a dual-frequency FM synthesis model to mimic a perfectly hollow, 
     *   deep bamboo resonance with a warm, crystalline fluid transient.
     * - Highly satisfying, grounding, and completely free of jarring plastic/haptic clicks.
     */
    const primaryOsc = ctx.createOscillator();
    const modulatorOsc = ctx.createOscillator();
    const modulationGain = ctx.createGain();
    const mainGain = ctx.createGain();
    
    // Warm, calming baseline fundamental (F#3 - deep & grounding)
    primaryOsc.type = 'sine';
    primaryOsc.frequency.setValueAtTime(185.00, t); 
    // Pitch envelope: subtle slide down for organic fluid quality
    primaryOsc.frequency.exponentialRampToValueAtTime(174.61, t + 0.15); // Slide down to F3
    
    // Modulator creates the smooth wooden/liquid strike timbre (A#4)
    modulatorOsc.type = 'sine';
    modulatorOsc.frequency.setValueAtTime(466.16, t);
    
    // Modulation depth peaks instantly then drops to zero for clean body
    modulationGain.gain.setValueAtTime(200, t);
    modulationGain.gain.exponentialRampToValueAtTime(0.01, t + 0.04);
    
    // Soft, organic ADSR envelope to protect working focus
    mainGain.gain.setValueAtTime(0.45, t);
    mainGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25); // Gentle, warm decay
    
    // Connections
    modulatorOsc.connect(modulationGain);
    modulationGain.connect(primaryOsc.frequency);
    primaryOsc.connect(mainGain);
    mainGain.connect(ctx.destination);
    
    // Execution
    modulatorOsc.start(t);
    primaryOsc.start(t);
    modulatorOsc.stop(t + 0.25);
    primaryOsc.stop(t + 0.25);
  } 
  else if (type === 'success') {
    // Apple Pay Two-Tone Chime: F#5 (739.99 Hz) -> B5 (987.77 Hz)
    [739.99, 987.77].forEach((freq, i) => {
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + i * 0.12);
      gain.gain.setValueAtTime(0.35, t + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + i * 0.12);
      osc.stop(t + i * 0.12 + 0.5);
    });
  }
};
