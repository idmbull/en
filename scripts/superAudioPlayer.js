// superAudioPlayer.js
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
            this.gainNode.connect(this.ctx.destination);
        }
        try {
            // Dừng âm thanh cũ nếu đang load bài mới
            this.stop();
            this.buffer = await this.ctx.decodeAudioData(arrayBuffer);
        } catch (err) {
            console.error("Audio decode error:", err);
        }
    }

    setVolume(v) {
        this.volume = v;
        // Nếu đang play thì không set trực tiếp để tránh nổ tiếng, chỉ set biến
        // Gain thực tế được điều khiển bởi playSegment
    }

    stop() {
        if (this.currentSource) {
            try { this.currentSource.stop(); } catch { }
            this.currentSource.disconnect();
            this.currentSource = null;
        }
    }

    clear() {
        this.stop();
        this.buffer = null; // Xóa dữ liệu âm thanh khỏi bộ nhớ
    }

    playSegment(startSec, endSec) {
        if (!this.buffer || !this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const duration = endSec - startSec;
        if (duration <= 0) return;

        this.stop();

        const src = this.ctx.createBufferSource();
        src.buffer = this.buffer;
        src.connect(this.gainNode);

        // --- FADE IN / FADE OUT LOGIC ---
        // Để tránh tiếng "bụp", ta fade in 0.01s đầu và fade out 0.01s cuối
        const now = this.ctx.currentTime;
        const fadeTime = 0.02;

        // Cancel các automation cũ
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(0, now);

        // Fade In
        this.gainNode.gain.linearRampToValueAtTime(this.volume, now + fadeTime);

        // Fade Out (trước khi kết thúc)
        this.gainNode.gain.setValueAtTime(this.volume, now + duration - fadeTime);
        this.gainNode.gain.linearRampToValueAtTime(0, now + duration);

        src.start(now, startSec, duration);
        // Stop dư ra một chút để đảm bảo fade out xong
        src.stop(now + duration + 0.05);

        this.currentSource = src;
    }
}