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

        // --- 1. KHÔI PHỤC CÀI ĐẶT NGƯỜI DÙNG (NEW) ---
        this.restoreUserPreferences();

        // --- QUAN TRỌNG: Gắn sự kiện gõ phím ---
        if (DOM.textInput) {
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

        if (DOM.actionToggle) {
            DOM.actionToggle.onchange = (e) => this.handleAction(e.target.checked);
        }

        this.setupGlobalEvents();

        // Log để biết Controller đã chạy
        console.log("ExerciseController initialized");
    }

    // --- HÀM MỚI: QUẢN LÝ LOCAL STORAGE ---
    restoreUserPreferences() {
        // Helper: Lấy bool từ storage (mặc định true hoặc false)
        const getStoredBool = (key, defaultValue) => {
            const val = localStorage.getItem(key);
            return val === null ? defaultValue : val === 'true';
        };

        // 1. Sound (Default: ON)
        if (DOM.soundToggle) {
            const isSoundOn = getStoredBool('pref_sound', true);
            DOM.soundToggle.checked = isSoundOn;
            DOM.soundToggle.addEventListener('change', (e) => {
                localStorage.setItem('pref_sound', e.target.checked);
            });
        }

        // 2. Speak / Auto Pronounce (Default: ON)
        if (DOM.autoPronounceToggle) {
            const isSpeakOn = getStoredBool('pref_speak', true);
            DOM.autoPronounceToggle.checked = isSpeakOn;
            DOM.autoPronounceToggle.addEventListener('change', (e) => {
                localStorage.setItem('pref_speak', e.target.checked);
            });
        }

        // 3. Tooltip (Default: ON)
        if (DOM.autoTooltipToggle) {
            const isTooltipOn = getStoredBool('pref_tooltip', true);
            DOM.autoTooltipToggle.checked = isTooltipOn;
            DOM.autoTooltipToggle.addEventListener('change', (e) => {
                localStorage.setItem('pref_tooltip', e.target.checked);
            });
        }

        // 4. Blind Mode (Default: OFF) - Cần xử lý logic Store và UI
        if (DOM.blindModeToggle) {
            const isBlindOn = getStoredBool('pref_blind', false);
            DOM.blindModeToggle.checked = isBlindOn;

            // Apply ngay lập tức
            Store.setBlindMode(isBlindOn);
            if (isBlindOn) document.body.classList.add("blind-mode");

            DOM.blindModeToggle.addEventListener("change", (e) => {
                const checked = e.target.checked;
                Store.setBlindMode(checked);
                this.toggleBlindMode(checked);
                localStorage.setItem('pref_blind', checked);
            });
        }
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

                // Cập nhật UI Toggle
                if (DOM.blindModeToggle) DOM.blindModeToggle.checked = newState;

                // Cập nhật Logic & Storage
                Store.setBlindMode(newState);
                this.toggleBlindMode(newState);
                localStorage.setItem('pref_blind', newState);
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

        // Kiểm tra xem textInput có tồn tại và có giá trị không trước khi apply
        const caretPos = DOM.textInput ? DOM.textInput.value.length : 0;
        applyBlindMode(caretPos);

        this.refocus();
    }

    refocus() {
        if (DOM.textInput && !DOM.textInput.disabled) {
            DOM.textInput.focus();
        }
    }
}