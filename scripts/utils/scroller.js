// scripts/utils/scroller.js

export class AutoScroller {
    constructor(container) {
        this.container = container;
        this.targetScrollTop = 0;
        this.isAnimating = false;
        this.scrollFrameId = null;
        this.userIsScrolling = false;
        this.userScrollTimeout = null;

        // Binding
        this.onUserScroll = this.onUserScroll.bind(this);
        this.initEvents();
    }

    initEvents() {
        if (!this.container) return;
        // Phát hiện người dùng cuộn tay
        this.container.addEventListener("wheel", this.onUserScroll, { passive: true });
        this.container.addEventListener("touchstart", this.onUserScroll, { passive: true });
        this.container.addEventListener("mousedown", this.onUserScroll, { passive: true });
    }

    onUserScroll() {
        // Khi người dùng can thiệp, dừng auto-scroll ngay lập tức
        this.stop();
        this.userIsScrolling = true;

        // Reset cờ sau khi người dùng dừng tương tác 1 lúc
        clearTimeout(this.userScrollTimeout);
        this.userScrollTimeout = setTimeout(() => {
            this.userIsScrolling = false;
        }, 150);
    }

    stop() {
        if (this.isAnimating) {
            this.isAnimating = false;
            if (this.scrollFrameId) cancelAnimationFrame(this.scrollFrameId);
        }
    }

    /**
     * Cuộn đến phần tử mục tiêu (Con trỏ)
     * @param {HTMLElement} targetSpan 
     */
    scrollTo(targetSpan) {
        if (!targetSpan || !this.container) return;

        // Nếu người dùng đang giữ chuột/tay để cuộn, không can thiệp
        if (this.userIsScrolling) return;

        const containerRect = this.container.getBoundingClientRect();
        const spanRect = targetSpan.getBoundingClientRect();

        // Vị trí tương đối của span so với đỉnh container
        const relativeY = spanRect.top - containerRect.top;
        const containerHeight = containerRect.height;
        const spanHeight = spanRect.height || 20;

        // --- CẤU HÌNH VÙNG AN TOÀN (Safe Zone) ---
        // Giữ con trỏ ở khoảng 35% -> 55% màn hình
        const safeZoneTop = containerHeight * 0.35;
        const safeZoneBot = containerHeight * 0.55;

        // 1. KIỂM TRA: Con trỏ có đang bị khuất hẳn khỏi màn hình không?
        // (Nằm hoàn toàn bên trên hoặc bên dưới vùng nhìn thấy)
        const isOffScreenTop = relativeY < 0;
        const isOffScreenBottom = relativeY > containerHeight - spanHeight;

        let delta = 0;

        // Tính toán khoảng cách cần dịch chuyển để đưa về Safe Zone
        if (relativeY < safeZoneTop) {
            delta = relativeY - safeZoneTop;
        } else if (relativeY > safeZoneBot) {
            delta = relativeY - safeZoneBot;
        }

        if (delta !== 0) {
            const currentScroll = this.container.scrollTop;
            const maxScroll = this.container.scrollHeight - this.container.clientHeight;

            let target = currentScroll + delta;
            target = Math.max(0, Math.min(target, maxScroll));

            this.targetScrollTop = target;

            // --- GIẢI QUYẾT VẤN ĐỀ 1 & 2 ---
            // Nếu con trỏ đang nằm ngoài màn hình (OffScreen), thực hiện SNAP (Nhảy ngay lập tức)
            // Thay vì animation từ từ.
            if (isOffScreenTop || isOffScreenBottom) {
                this.stop(); // Dừng animation cũ nếu có
                this.container.scrollTop = this.targetScrollTop;
            } else {
                // Nếu vẫn nhìn thấy con trỏ nhưng nó đi ra khỏi vùng Safe Zone -> Cuộn mượt
                if (!this.isAnimating) {
                    this.isAnimating = true;
                    this.loop();
                }
            }
        }
    }

    loop() {
        if (!this.isAnimating) return;

        const current = this.container.scrollTop;
        const diff = this.targetScrollTop - current;

        // Nếu đã rất gần đích -> Dừng
        if (Math.abs(diff) < 0.5) {
            this.container.scrollTop = this.targetScrollTop;
            this.isAnimating = false;
            return;
        }

        // Lerp factor: 0.15 (Mượt mà)
        // Nếu muốn nhanh hơn khi ở xa, có thể tăng số này
        const speed = 0.15;
        this.container.scrollTop = current + (diff * speed);

        this.scrollFrameId = requestAnimationFrame(() => this.loop());
    }

    reset() {
        this.stop();
        if (this.container) this.container.scrollTop = 0;
        this.targetScrollTop = 0;
    }
}