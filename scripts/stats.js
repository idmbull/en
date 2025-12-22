// scripts/stats.js
import { DOM } from "./state.js";
import { Store } from "./core/store.js"; // Import Store
import { EventBus, EVENTS } from "./core/events.js";

export function initStatsService() {
    EventBus.on(EVENTS.INPUT_CHANGE, (data) => {
        const { currentLen, isCorrect, prevInputLen } = data;
        
        if (currentLen > prevInputLen) {
            // Update Stats in Store
            Store.addStats(isCorrect);
            scheduleStatsUpdate();
        }
    });

    EventBus.on(EVENTS.EXERCISE_START, startTimer);
    EventBus.on(EVENTS.EXERCISE_STOP, stopTimer);
    EventBus.on(EVENTS.EXERCISE_COMPLETE, stopTimer);
}

let scheduledStatUpdate = false; // Local var

export function scheduleStatsUpdate() {
    if (scheduledStatUpdate) return;
    scheduledStatUpdate = true;

    requestAnimationFrame(() => {
        scheduledStatUpdate = false;
        const s = Store.getState(); // Get stats from store
        
        const accuracy = s.statTotalKeys > 0
            ? Math.floor((s.statCorrectKeys / s.statTotalKeys) * 100)
            : 100;

        DOM.accuracyEl.textContent = `${accuracy}%`;
        DOM.errorsEl.textContent = s.statErrors;
    });
}

export function updateStatsDOMImmediate(accuracy, wpm, timeText, errs) {
    DOM.accuracyEl.textContent = `${accuracy}%`;
    DOM.wpmEl.textContent = `${wpm}`;
    DOM.timeEl.textContent = `${timeText}`;
    DOM.errorsEl.textContent = `${errs}`;
}

// Timer Logic
let timerInterval = null;

export function startTimer() {
    if (timerInterval) return;
    Store.startExercise(); // Mark active in Store
    
    const startTime = Store.getState().startTime; // Get start time

    timerInterval = setInterval(() => {
        const now = Date.now();
        const elapsedSeconds = (now - startTime) / 1000; 

        if (elapsedSeconds < 60) {
            DOM.timeEl.textContent = `${Math.floor(elapsedSeconds)}s`;
        } else {
            const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, "0");
            const seconds = Math.floor(elapsedSeconds % 60).toString().padStart(2, "0");
            DOM.timeEl.textContent = `${minutes}:${seconds}`;
        }

        const charCount = DOM.textInput.value.length;
        const wpm = elapsedSeconds > 0 
            ? Math.floor((charCount / 5) / (elapsedSeconds / 60)) 
            : 0;

        DOM.wpmEl.textContent = wpm;
    }, 1000);
}

export function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    Store.stopExercise();
}