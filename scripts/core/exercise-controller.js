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
    constructor(mode, callbacks = {}) {
        this.mode = mode;
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

        DOM.textInput.oninput = () => handleGlobalInput(this.mode);
        this.setupGlobalEvents();
        this.setupDropdowns();
    }

    setupGlobalEvents() {
        document.onkeydown = (e) => {
            if (Store.getMode() !== this.mode) return;

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

        // [FIX] Click vào màn hình -> Focus Input và ĐẨY CON TRỎ VỀ CUỐI
        document.onclick = (e) => {
            if (Store.getMode() !== this.mode) return;
            const t = e.target.tagName;
            if (["BUTTON", "SELECT", "TEXTAREA", "INPUT", "LABEL"].includes(t)) return;

            if (!DOM.textInput.disabled) {
                DOM.textInput.focus();
                const len = DOM.textInput.value.length;
                DOM.textInput.setSelectionRange(len, len);
            }
        };

        EventBus.on(EVENTS.EXERCISE_STOP, () => { if (DOM.textInput.disabled) this.updateActionUI(); });
        document.addEventListener("timer:stop", () => { if (DOM.textInput.disabled) this.updateActionUI(); });
    }

    setupDropdowns() {
        DOM.playlistSelect.onchange = async (e) => {
            await this.callbacks.onLoadContent(e.target.value);
            this.reset();
        };
        DOM.difficultySelect.onchange = () => {
            this.callbacks.onSectionChange(DOM.difficultySelect.value);
            this.reset();
        };
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

        // Focus và set caret về cuối
        const len = DOM.textInput.value.length;
        DOM.textInput.setSelectionRange(len, len);

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
        DOM.textInput.value = "";
        const hasText = !!Store.getSource().text;
        DOM.textInput.disabled = !hasText;
        DOM.textContainer.scrollTop = 0;
        if (hasText) DOM.textInput.disabled = true;
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
        if (!DOM.textInput.disabled) {
            DOM.textInput.focus();
            const len = DOM.textInput.value.length;
            DOM.textInput.setSelectionRange(len, len);
        }
    }
}