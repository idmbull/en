// superAudioPlayer.js — sample-accurate + volume control

export class SuperAudioPlayer {
    constructor() {
        this.ctx = null;
        this.buffer = null;
        this.currentSource = null;

        this.gainNode = null;
        this.volume = 1;
    }

    async load(arrayBuffer) {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();

            this.gainNode = this.ctx.createGain();
            this.gainNode.gain.value = this.volume;
            this.gainNode.connect(this.ctx.destination);
        }

        try {
            this.buffer = await this.ctx.decodeAudioData(arrayBuffer);
        } catch (err) {
            console.error("Audio decode error:", err);
        }
    }

    setVolume(v) {
        this.volume = v;
        if (this.gainNode) {
            this.gainNode.gain.value = v;
        }
    }

    stop() {
        if (this.currentSource) {
            try { this.currentSource.stop(); } catch {}
            this.currentSource.disconnect();
            this.currentSource = null;
        }
    }

    playSegment(startSec, endSec) {
        if (!this.buffer) return;

        const duration = endSec - startSec;
        if (duration <= 0) return;

        this.stop();

        const src = this.ctx.createBufferSource();
        src.buffer = this.buffer;

        src.connect(this.gainNode);

        const now = this.ctx.currentTime;
        src.start(now, startSec, duration);
        src.stop(now + duration + 0.003); // tránh click

        this.currentSource = src;
    }
}
