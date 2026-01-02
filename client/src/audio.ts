
export class AudioEngine {
    ctx: AudioContext;
    isPlaying: boolean = false;
    nextNoteTime: number = 0;
    tempo: number = 110;
    timerID: number | undefined;

    // Bossa Nova pattern (Root, 5th, Octave...ish)
    // Simple chord progression
    bassLine = [
        { note: 36, dur: 1.5 }, { note: 43, dur: 0.5 }, // C
        { note: 36, dur: 1.5 }, { note: 43, dur: 0.5 },
        { note: 41, dur: 1.5 }, { note: 48, dur: 0.5 }, // F
        { note: 43, dur: 1.5 }, { note: 38, dur: 0.5 }, // G
    ];
    step = 0;

    constructor() {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    toggle() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.isPlaying = !this.isPlaying;
        if (this.isPlaying) {
            this.nextNoteTime = this.ctx.currentTime + 0.1;
            this.scheduler();
        } else {
            window.clearTimeout(this.timerID);
        }
        return this.isPlaying;
    }

    scheduler() {
        while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
            this.playStep(this.nextNoteTime);
            // Advance step
            const beatLen = 60.0 / this.tempo;
            // Pattern duration is handled in playStep logic strictly? 
            // Simplified: Just play 8th notes and mute some.
            // But let's stick to the bassLine array
            const item = this.bassLine[this.step % this.bassLine.length];
            this.nextNoteTime += item.dur * beatLen;
            this.step++;
        }
        this.timerID = window.setTimeout(this.scheduler.bind(this), 25);
    }

    playStep(time: number) {
        const item = this.bassLine[this.step % this.bassLine.length];
        this.playTone(item.note, time, item.dur * (60.0 / this.tempo) * 0.8);

        // Random hihat
        if (this.step % 2 === 0) this.playNoise(time, 0.05);
    }

    playTone(midi: number, time: number, dur: number) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        // Sine with a bit of "FM" for electric piano feel?
        osc.type = "sine";
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        osc.frequency.value = freq;

        gain.gain.setValueAtTime(0.05, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

        osc.start(time);
        osc.stop(time + dur);
    }

    playNoise(time: number, dur: number) {
        const bufferSize = this.ctx.sampleRate * dur;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();

        // Filter
        const filter = this.ctx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = 5000;

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        gain.gain.setValueAtTime(0.01, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
        noise.start(time);
    }
}
