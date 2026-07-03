/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

class AudioEngine {
  private ctx: AudioContext | null = null;
  private isInitialized = false;

  // Background ambient nodes
  private masterGainNode: GainNode | null = null;
  private droneOscillators: { osc: OscillatorNode; gain: GainNode }[] = [];
  private lfoNodes: { osc: OscillatorNode; gain: GainNode }[] = [];
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private lowpassFilter: BiquadFilterNode | null = null;

  // Melody sequence interval
  private melodyIntervalId: any = null;
  private currentStep = 0;

  // Track state
  private isMuted = false;

  constructor() {
    // Initialized on first user interaction to satisfy browser security policies
  }

  public init() {
    if (this.isInitialized) return;

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtxClass();
      this.isInitialized = true;
      this.setupAmbientBGM();
      this.startMelodyLoop();
    } catch (e) {
      console.error("Web Audio API is not supported in this browser", e);
    }
  }

  public resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(err => console.error("Could not resume AudioContext:", err));
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGainNode && this.ctx) {
      // Fade nicely over 1.2 seconds rather than sudden cuts
      const targetVol = this.isMuted ? 0.0 : 0.45;
      this.masterGainNode.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.4);
    }
    return this.isMuted;
  }

  public getMuteState(): boolean {
    return this.isMuted;
  }

  /**
   * Builds a rich, warm, and highly audible ambient pad drone
   */
  private setupAmbientBGM() {
    if (!this.ctx) return;
    const ctx = this.ctx;

    // 1. Master Output Gain - Set to 0.45 for a clear, present but peaceful sound level
    this.masterGainNode = ctx.createGain();
    this.masterGainNode.gain.setValueAtTime(this.isMuted ? 0.0 : 0.45, ctx.currentTime);
    this.masterGainNode.connect(ctx.destination);

    // 2. Warm lowpass filter to remove harshness and create a dreamy, romantic, vintage feeling
    this.lowpassFilter = ctx.createBiquadFilter();
    this.lowpassFilter.type = 'lowpass';
    this.lowpassFilter.frequency.setValueAtTime(350, ctx.currentTime); // Cozy low cutoff
    this.lowpassFilter.Q.setValueAtTime(1.0, ctx.currentTime);
    this.lowpassFilter.connect(this.masterGainNode);

    // 3. Ambient Stereo Delay / Echo loop
    this.delayNode = ctx.createDelay(3.0);
    this.delayFeedback = ctx.createGain();
    
    this.delayNode.delayTime.setValueAtTime(1.2, ctx.currentTime); // 1.2-second spacey delay
    this.delayFeedback.gain.setValueAtTime(0.5, ctx.currentTime); // Rich lingering echo

    // Connect filter to delay, then delay into feedback and master gain
    this.lowpassFilter.connect(this.delayNode);
    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.masterGainNode);

    // 4. Low-tempo Romantic Drone Pad (Warm chord: A major 9th/11th voicing)
    // Frequencies: A1 (55Hz), A2 (110Hz), E3 (164.81Hz), C#4 (277.18Hz)
    const padFrequencies = [55.00, 110.00, 164.81, 277.18];

    padFrequencies.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      // Mix triangle (woodwind organ warmth) and sine (pure fundamental)
      osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      const oscGain = ctx.createGain();
      // Noticeable but balanced volumes for each harmonic drone
      const baseGain = idx === 0 ? 0.08 : 0.05; // Extra weight on low A1 drone
      oscGain.gain.setValueAtTime(baseGain, ctx.currentTime);

      osc.connect(oscGain);
      oscGain.connect(this.lowpassFilter!);
      osc.start();

      this.droneOscillators.push({ osc, gain: oscGain });

      // Slow-pulsing LFO to keep the pad alive, swelling like breathing
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(0.02 + idx * 0.008, ctx.currentTime); // 30-50 second wave cycle

      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(baseGain * 0.4, ctx.currentTime); // Gentle 40% volume swell

      lfo.connect(lfoGain);
      lfoGain.connect(oscGain.gain);
      lfo.start();

      this.lfoNodes.push({ osc: lfo, gain: lfoGain });
    });

    // Slow filter cutoff sweep LFO (makes sound shift colors over time)
    const filterSweep = ctx.createOscillator();
    filterSweep.type = 'sine';
    filterSweep.frequency.setValueAtTime(0.015, ctx.currentTime); // Very slow sweep

    const filterSweepGain = ctx.createGain();
    filterSweepGain.gain.setValueAtTime(100, ctx.currentTime); // sweeps filter between 250Hz and 450Hz

    filterSweep.connect(filterSweepGain);
    filterSweepGain.connect(this.lowpassFilter.frequency);
    filterSweep.start();

    this.lfoNodes.push({ osc: filterSweep, gain: filterSweepGain });
  }

  /**
   * Starts a continuous, slow romantic solo melody loop (peaceful Rhodes electric bell sound)
   */
  private startMelodyLoop() {
    if (this.melodyIntervalId) return;
    if (!this.ctx) return;

    // Peaceful, slow romantic melody note sequence (A Major Pentatonic scale)
    // Structured to sound completely cohesive and loving, like a gentle acoustic breeze
    const melodyScale = [
      220.00, // A3 (warm, low base)
      277.18, // C#4
      329.63, // E4
      440.00, // A4
      493.88, // B4
      554.37, // C#5
      659.25, // E5
      739.99, // F#5
      880.00  // A5 (high, clear bell)
    ];

    // Structured progression steps (romantic, flowing, simple)
    const progressionSteps = [
      [2, 5],    // E4 & C#5
      [3],       // A4
      [4, 6],    // B4 & E5
      [],        // Silence/rest
      [5, 8],    // C#5 & A5
      [6],       // E5
      [1, 3],    // C#4 & E4
      []         // Silence/rest
    ];

    const playStep = () => {
      if (this.isMuted || !this.ctx || this.ctx.state === 'suspended') return;

      const now = this.ctx.currentTime;
      const stepNotes = progressionSteps[this.currentStep % progressionSteps.length];
      this.currentStep++;

      // Play notes in this chord step
      stepNotes.forEach((scaleIdx, index) => {
        const freq = melodyScale[scaleIdx];
        // Stagger notes slightly inside the chord to sound like a natural, hand-picked arpeggio
        const stagger = index * (0.15 + Math.random() * 0.1);
        this.playMelodyNote(freq, now + stagger);
      });

      // 40% chance to play a tiny, highly responsive extra harmony note in the background
      if (stepNotes.length > 0 && Math.random() < 0.4) {
        const randomNote = melodyScale[Math.floor(Math.random() * melodyScale.length)];
        this.playMelodyNote(randomNote, now + 1.8);
      }
    };

    // Trigger a beautiful progression step every 5.5 seconds (slower, extra relaxing tempo)
    this.melodyIntervalId = setInterval(playStep, 5500);
  }

  /**
   * Synthesizes a beautiful, warm, organic piano bell/Rhodes keyboard key strike
   */
  private playMelodyNote(fundamentalFreq: number, startTime: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;

    // Single note master gain
    const noteGain = ctx.createGain();
    noteGain.connect(this.lowpassFilter || this.masterGainNode || ctx.destination);

    // Route a portion directly to the delay node for lingering space
    if (this.lowpassFilter) {
      const delaySend = ctx.createGain();
      delaySend.gain.setValueAtTime(0.35, startTime); // Rich echo level
      noteGain.connect(delaySend);
      delaySend.connect(this.lowpassFilter);
    }

    // 1. Warm woodwind keyboard body (Triangle wave with beautiful slow attack)
    const bodyOsc = ctx.createOscillator();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(fundamentalFreq, startTime);

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0, startTime);
    // Soft, elegant 50ms attack to avoid harshness
    bodyGain.gain.linearRampToValueAtTime(0.08, startTime + 0.05);
    // Very long, lingering romantic decay (4.5 seconds)
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 4.5);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(noteGain);

    // 2. High metallic chime resonance (Pure sine wave at 3rd harmonic)
    const chimeOsc = ctx.createOscillator();
    chimeOsc.type = 'sine';
    chimeOsc.frequency.setValueAtTime(fundamentalFreq * 3, startTime);

    const chimeGain = ctx.createGain();
    chimeGain.gain.setValueAtTime(0, startTime);
    chimeGain.gain.linearRampToValueAtTime(0.02, startTime + 0.004); // Instant mallet strike
    chimeGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.12); // Fast chime decay

    chimeOsc.connect(chimeGain);
    chimeGain.connect(noteGain);

    // Start & stop node sequences to prevent memory leaks
    bodyOsc.start(startTime);
    bodyOsc.stop(startTime + 4.6);
    chimeOsc.start(startTime);
    chimeOsc.stop(startTime + 0.2);
  }

  /**
   * Synthesizes high-quality windchimes on screen click.
   */
  public playWindchimeClick(xPercent: number, yPercent: number, zPercent: number = 0) {
    this.resume();
    if (!this.ctx) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Major Pentatonic notes spanning from warm, deep A3/C#4 up to airy A6
    const chimeScale = [
      220.00,  // A3 (deep, dark)
      277.18,  // C#4
      329.63,  // E4
      440.00,  // A4
      493.88,  // B4
      554.37,  // C#5
      659.25,  // E5
      739.99,  // F#5
      880.00,  // A5
      987.77,  // B5
      1108.73, // C#6
      1318.51, // E6
      1479.98, // F#6
      1760.00  // A6 (high, clear)
    ];

    // Map zPercent (0 = foreground, 1 = deep spatial background) to pitch.
    // As zPercent gets higher, we pick lower, deeper indexes in the chimeScale.
    const reversedZ = 1 - Math.max(0, Math.min(1, zPercent));
    const idx = Math.floor(reversedZ * chimeScale.length);
    const baseFreq = chimeScale[Math.max(0, Math.min(idx, chimeScale.length - 1))];

    // Play a sequence of 2 delicate metal clinks to mimic cluster chimes
    const clinks = 2;
    for (let i = 0; i < clinks; i++) {
      const delay = i * (0.05 + Math.random() * 0.06);
      const pitchVar = 1 + (Math.random() * 0.02 - 0.01);
      const chimeFreq = baseFreq * pitchVar;
      // Beautiful, delicate, soft volume level that is always lower and subordinate to the BGM
      const volume = (0.018 + Math.random() * 0.012) / clinks;

      this.triggerSingleChime(chimeFreq, volume, now + delay, zPercent);
    }
  }

  private triggerSingleChime(fundamentalFreq: number, baseVolume: number, startTime: number, zPercent: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;

    // zPercent directly controls decay duration (deeper Z = much longer, warmer resonance)
    const decayDuration = 1.8 + zPercent * 3.2; // 1.8s to 5.0s

    const chimeMasterGain = ctx.createGain();
    // Reduce direct volume slightly at deeper Z positions to simulate depth distance and spatial peace
    const depthVolumeMultiplier = 1.0 - (zPercent * 0.40); // down to 60% direct volume at max depth
    chimeMasterGain.gain.setValueAtTime(depthVolumeMultiplier, startTime);
    chimeMasterGain.connect(this.masterGainNode || ctx.destination);

    // Route windchimes to the lowpass filter & delay send for cozy echoes
    if (this.lowpassFilter) {
      const delaySend = ctx.createGain();
      // Deeper zoom level increases delay send level for spacious echoes
      const delayVolume = 0.25 + zPercent * 0.40; // 0.25 to 0.65
      delaySend.gain.setValueAtTime(delayVolume, startTime);
      chimeMasterGain.connect(delaySend);
      delaySend.connect(this.lowpassFilter);
    }

    // Metal rods overtones
    const overtoneRatios = [1.0, 2.756, 5.404, 8.93];
    const overtoneDecayMultipliers = [1.0, 0.45, 0.25, 0.12];
    const overtoneVolumeMultipliers = [0.65, 0.3, 0.15, 0.06];

    overtoneRatios.forEach((ratio, index) => {
      const freq = fundamentalFreq * ratio;
      if (freq > 22000) return;

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0, startTime);
      
      const attackTime = 0.002;
      oscGain.gain.linearRampToValueAtTime(baseVolume * overtoneVolumeMultipliers[index], startTime + attackTime);
      
      const overtoneDecay = decayDuration * overtoneDecayMultipliers[index];
      oscGain.gain.exponentialRampToValueAtTime(0.0001, startTime + attackTime + overtoneDecay);

      osc.connect(oscGain);
      oscGain.connect(chimeMasterGain);

      osc.start(startTime);
      osc.stop(startTime + attackTime + overtoneDecay + 0.15);
    });
  }

  public dispose() {
    if (this.melodyIntervalId) {
      clearInterval(this.melodyIntervalId);
      this.melodyIntervalId = null;
    }
    this.droneOscillators.forEach(d => {
      try { d.osc.stop(); } catch(e) {}
    });
    this.lfoNodes.forEach(l => {
      try { l.osc.stop(); } catch(e) {}
    });
    this.droneOscillators = [];
    this.lfoNodes = [];
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.isInitialized = false;
  }
}

export const audio = new AudioEngine();
