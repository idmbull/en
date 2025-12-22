// scripts/core/exercise-controller.js
import { DOM } from "../state.js";
import { Store } from "./store.js";
import { initTheme, setTheme } from "../theme.js";
import { updateStatsDOMImmediate, initStatsService } from "../stats.js";
import { applyBlindMode } from "../renderer.js";
import { handleGlobalInput, resetController, getScroller } from "../input-controller.js";
import { initAudioService } from "../audio.js";
import { EventBus, EVENTS } from "./events.js";

export class ExerciseController {
    constructor(modeIgnored, callbacks = {}) {
        this.ctrlSpaceTimer = null;

        this.callbacks = {
            onReset: callbacks.onReset || (() => { }),
            onLoadContent: callbacks.onLoadContent || (async () => { }),
            onActionStart: callbacks.onActionStart || (() => { }),
            onSectionChange: callbacks.onSectionChange || (() => { }),
            onCtrlSpaceSingle: callbacks.onCtrlSpaceSingle || (() => { }),
            onCtrlSpaceDouble: callbacks.onCtrlSpaceDouble || (() => { })
        };

        initAudioService();
        initStatsService();
        this.init();
    }

    init() {
        initTheme();

        // --- QUAN TRỌNG: Gắn sự kiện gõ phím ---
        if (DOM.textInput) {
            // Loại bỏ tham số mode, handleGlobalInput tự xử lý qua Store
            DOM.textInput.oninput = () => handleGlobalInput();
        } else {
            console.error("Critical Error: #textInput not found in DOM");
        }

        if (DOM.themeSelect) {
            DOM.themeSelect.addEventListener("change", (e) => {
                setTheme(e.target.value);
                this.refocus();
            });
        }

        if (DOM.blindModeToggle) {
            DOM.blindModeToggle.addEventListener("change", (e) => {
                const checked = e.target.checked;
                Store.setBlindMode(checked);
                this.toggleBlindMode(checked);
            });
        }

        if (DOM.actionToggle) {
            DOM.actionToggle.onchange = (e) => this.handleAction(e.target.checked);
        }

        this.setupGlobalEvents();

        // Log để biết Controller đã chạy
        console.log("ExerciseController initialized");
    }

    setupGlobalEvents() {
        document.onkeydown = (e) => {
            // Cho phép gõ phím tắt ngay cả khi chưa Start, 
            // nhưng logic Ctrl+Space cần handle cẩn thận
            if (!Store.getState().isActive && e.code !== "Space") return;

            if (e.ctrlKey && e.code === "Space") {
                e.preventDefault();
                if (e.repeat) return;

                if (this.ctrlSpaceTimer) {
                    clearTimeout(this.ctrlSpaceTimer);
                    this.ctrlSpaceTimer = null;
                    this.callbacks.onCtrlSpaceDouble();
                } else {
                    this.ctrlSpaceTimer = setTimeout(() => {
                        this.callbacks.onCtrlSpaceSingle();
                        this.ctrlSpaceTimer = null;
                    }, 300);
                }
                return;
            }

            if (e.ctrlKey && e.code === "KeyB") {
                e.preventDefault();
                const newState = !Store.isBlind();
                Store.setBlindMode(newState);
                if (DOM.blindModeToggle) DOM.blindModeToggle.checked = newState;
                this.toggleBlindMode(newState);
            }
        };

        // Click bất kỳ đâu cũng focus vào ô input (trừ khi click vào nút/input khác)
        document.onclick = (e) => {
            const t = e.target.tagName;
            if (!["BUTTON", "SELECT", "TEXTAREA", "INPUT", "LABEL"].includes(t)) {
                this.refocus();
            }
        };

        EventBus.on(EVENTS.EXERCISE_STOP, () => {
            if (DOM.textInput.disabled) this.updateActionUI();
        });

        document.addEventListener("timer:stop", () => {
            if (DOM.textInput.disabled) this.updateActionUI();
        });
    }

    handleAction(isChecked) {
        if (isChecked) this.start();
        else this.reset();
    }

    start() {
        if (Store.getState().isActive) return;

        Store.startExercise();
        DOM.textInput.disabled = false;
        DOM.textInput.focus();

        EventBus.emit(EVENTS.EXERCISE_START);
        document.dispatchEvent(new CustomEvent("timer:start"));

        this.callbacks.onActionStart();
        this.updateActionUI();

        const scroller = getScroller();
        const state = Store.getState();
        const currentSpan = state.textSpans[state.prevIndex || 0];
        if (scroller && currentSpan) scroller.scrollTo(currentSpan);
    }

    reset() {
        EventBus.emit(EVENTS.EXERCISE_STOP);
        document.dispatchEvent(new CustomEvent("timer:stop"));

        resetController();
        Store.reset();
        this.callbacks.onReset();

        // --- QUAN TRỌNG: Reset Input ---
        if (DOM.textInput) {
            DOM.textInput.value = "";

            // Chỉ enable input nếu đã nạp Text vào Store
            const hasText = !!Store.getSource().text;

            // Ở trạng thái chờ (chưa bấm Start), ta Disable input hoặc để Enable tùy UX
            // Cách cũ: Disable và bắt user bấm Start hoặc gõ phím để Auto-Start.
            // Để Auto-Start hoạt động, Input phải KHÔNG ĐƯỢC DISABLED.

            // Logic mới: Luôn Enable nếu có Text, để gõ là tự chạy
            DOM.textInput.disabled = !hasText;

            if (hasText) {
                DOM.textInput.focus();
            }
        }

        if (DOM.textContainer) DOM.textContainer.scrollTop = 0;

        updateStatsDOMImmediate(100, 0, "0s", 0);
        applyBlindMode(0);
        this.updateActionUI();
    }

    updateActionUI() {
        if (!DOM.actionToggle) return;
        const isActive = Store.getState().isActive;
        const hasText = !!Store.getSource().text;

        DOM.actionToggle.checked = isActive;
        if (isActive) {
            DOM.actionLabel.textContent = "Stop";
            DOM.actionLabel.style.color = "var(--incorrect-text)";
        } else {
            DOM.actionLabel.textContent = "Start";
            DOM.actionLabel.style.color = "var(--correct-text)";
            DOM.actionToggle.disabled = !hasText;
        }
    }

    toggleBlindMode(isEnabled) {
        document.body.classList.toggle("blind-mode", isEnabled);
        applyBlindMode(DOM.textInput.value.length);
        this.refocus();
    }

    refocus() {
        if (DOM.textInput && !DOM.textInput.disabled) {
            DOM.textInput.focus();
        }
    }
}