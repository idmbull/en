// scripts/stats.js
import { DOM } from "./state.js";
import { Store } from "./core/store.js";
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

let scheduledStatUpdate = false;

export function scheduleStatsUpdate() {
    if (scheduledStatUpdate) return;
    scheduledStatUpdate = true;

    requestAnimationFrame(() => {
        scheduledStatUpdate = false;
        const s = Store.getState();

        const accuracy = s.statTotalKeys > 0
            ? Math.floor((s.statCorrectKeys / s.statTotalKeys) * 100)
            : 100;

        if (DOM.accuracyEl) DOM.accuracyEl.textContent = `${accuracy}%`;
        if (DOM.errorsEl) DOM.errorsEl.textContent = s.statErrors;
    });
}

export function updateStatsDOMImmediate(accuracy, wpm, timeText, errs) {
    if (DOM.accuracyEl) DOM.accuracyEl.textContent = `${accuracy}%`;
    if (DOM.wpmEl) DOM.wpmEl.textContent = `${wpm}`;
    if (DOM.timeEl) DOM.timeEl.textContent = `${timeText}`;
    if (DOM.errorsEl) DOM.errorsEl.textContent = `${errs}`;
}

// Timer Logic
let timerInterval = null;

export function startTimer() {
    if (timerInterval) return;

    if (!Store.getState().isActive) Store.startExercise();

    // [FIX] Không dùng let startTime = ... để tránh closure cũ
    // Chúng ta sẽ đọc trực tiếp từ Store trong setInterval

    timerInterval = setInterval(() => {
        const state = Store.getState();
        const startTime = state.startTime || Date.now(); // Luôn lấy thời gian mới nhất từ Store

        const now = Date.now();
        const elapsedSeconds = (now - startTime) / 1000;

        // Update Time DOM
        if (DOM.timeEl) {
            const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, "0");
            const seconds = Math.floor(elapsedSeconds % 60).toString().padStart(2, "0");
            DOM.timeEl.textContent = elapsedSeconds < 60 ? `${Math.floor(elapsedSeconds)}s` : `${minutes}:${seconds}`;
        }

        // Update WPM DOM
        const charCount = state.prevInputLen;
        const wpm = elapsedSeconds > 0
            ? Math.floor((charCount / 5) / (elapsedSeconds / 60))
            : 0;

        if (DOM.wpmEl) DOM.wpmEl.textContent = wpm;
    }, 1000);
}

export function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    Store.stopExercise();
}

// [THÊM MỚI] Hàm tính toán kết quả chốt hạ
export function getFinalResults(finalLength) {
    const state = Store.getState();

    // 1. Lấy thời gian bắt đầu và kết thúc từ Store
    const startTime = state.startTime || Date.now();
    // Nếu endTime đã chốt thì dùng, nếu chưa (đang chạy) thì dùng hiện tại
    const endTime = state.endTime || Date.now();

    // 2. Tính khoảng thời gian chính xác (đến từng mili-giây)
    const elapsedSeconds = Math.max(0.1, (endTime - startTime) / 1000);

    // 3. Tính Accuracy
    const accuracy = state.statTotalKeys > 0
        ? Math.floor((state.statCorrectKeys / state.statTotalKeys) * 100)
        : 100;

    // 4. Tính WPM
    // Công thức: (Số ký tự / 5) / (Số phút)
    const wpm = Math.floor((finalLength / 5) / (elapsedSeconds / 60));

    // 5. Format Time
    let timeStr = "";
    if (elapsedSeconds < 60) {
        timeStr = `${Math.floor(elapsedSeconds)}s`;
    } else {
        const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, "0");
        const seconds = Math.floor(elapsedSeconds % 60).toString().padStart(2, "0");
        timeStr = `${minutes}:${seconds}`;
    }

    // [MẸO UX] Cập nhật lại thanh stat-item lần cuối để khớp 100% với Modal
    if (DOM.wpmEl) DOM.wpmEl.textContent = wpm;
    if (DOM.timeEl) DOM.timeEl.textContent = timeStr;
    if (DOM.accuracyEl) DOM.accuracyEl.textContent = `${accuracy}%`;

    return {
        accuracy: `${accuracy}%`,
        wpm: wpm,
        time: timeStr,
        errors: state.statErrors
    };
}