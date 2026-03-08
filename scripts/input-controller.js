import { DOM } from "./state.js";
import { Store } from "./core/store.js";
import { runTypingEngine, resetTypingEngine } from "./typing-engine.js";
import { updateActiveSpans, applyBlindMode } from "./renderer.js";
import { showTooltipForSpan } from "./tooltip.js";
import { AutoScroller } from "./utils/scroller.js";
import { EventBus, EVENTS } from "./core/events.js";
import { getFinalResults } from "./stats.js";

const PRELOAD_WINDOW = 5;
let scroller;

// --- STATE MỚI ---
let isComposing = false;
let imeTooltipEl = null;
let virtualValue = "";

function isPunctuation(str) {
    // Regex này bao gồm:
    // 1. Dấu câu ASCII cơ bản: [.,!?;:'"(){}[\]]
    // 2. Dấu câu CJK (Trung/Nhật/Hàn) và Fullwidth: [\u3000-\u303F\uFF00-\uFFEF]
    return /^[.,!?;:'"(){}[\]\u3000-\u303F\uFF00-\uFFEF]+$/.test(str);
}

function isKoreanText(text) {
    return /[\uAC00-\uD7AF]/.test(text);
}

// --- TOOLTIP IME (Giữ nguyên) ---
function getOrCreateImeTooltip() {
    if (!imeTooltipEl) {
        imeTooltipEl = document.createElement('div');
        imeTooltipEl.className = 'ime-tooltip';
        document.body.appendChild(imeTooltipEl);
    }
    return imeTooltipEl;
}

function updateImeTooltip(text) {
    const tooltip = getOrCreateImeTooltip();
    const state = Store.getState();
    if (!text) {
        tooltip.classList.remove('visible');
        return;
    }
    tooltip.textContent = text;
    tooltip.classList.add('visible');
    const currentSpan = state.textSpans[state.prevIndex || 0];
    if (currentSpan) {
        const rect = currentSpan.getBoundingClientRect();
        const topPos = rect.top - tooltip.offsetHeight - 5;
        const leftPos = rect.left;
        tooltip.style.top = `${topPos}px`;
        tooltip.style.left = `${leftPos}px`;
    }
}

function hideImeTooltip() {
    if (imeTooltipEl) imeTooltipEl.classList.remove('visible');
}

function syncInputPosition() {
    const state = Store.getState();
    const currentSpan = state.textSpans[state.prevIndex || 0];
    const inputArea = document.querySelector('.input-area');
    const textarea = DOM.textInput;

    if (currentSpan && inputArea) {
        const rect = currentSpan.getBoundingClientRect();
        inputArea.style.top = `${rect.top}px`;
        inputArea.style.left = `${rect.left}px`;
        inputArea.style.height = `${rect.height}px`;

        const style = window.getComputedStyle(currentSpan);
        textarea.style.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        textarea.style.lineHeight = style.lineHeight;
    }
}

export function initController() {
    if (!scroller && DOM.textContainer) {
        scroller = new AutoScroller(DOM.textContainer, () => {
            syncInputPosition();
        });
    }

    if (DOM.textInput) {
        DOM.textInput.addEventListener('keydown', (e) => {
            if (isComposing) return;

            if (e.key === 'Backspace') {
                if (virtualValue.length > 0) {
                    virtualValue = virtualValue.slice(0, -1);
                    handleGlobalInput(virtualValue);
                }
            }
            else if (e.key === 'Enter') {
                e.preventDefault();
                virtualValue += " ";
                handleGlobalInput(virtualValue);
            }
        });

        DOM.textInput.addEventListener('compositionstart', () => { isComposing = true; });

        DOM.textInput.addEventListener('compositionupdate', (e) => {
            isComposing = true;
            updateImeTooltip(e.data);
            syncInputPosition();
        });

        // --- [SỬA ĐỔI QUAN TRỌNG] ---
        DOM.textInput.addEventListener('compositionend', (e) => {
            isComposing = false;
            hideImeTooltip();

            const committedText = e.data;
            let isKo = false; // Cờ đánh dấu tiếng Hàn

            if (committedText) {
                virtualValue += committedText;
                isKo = isKoreanText(committedText);

                // LOGIC PHÂN LUỒNG:
                // 1. Nếu là Tiếng Hàn: KHÔNG phát âm ở đây (để Engine lo giống tiếng Anh)
                // 2. Nếu là Tiếng Trung: Phát âm ngay lập tức
                // 3. Check dấu câu
                if (!isKo && !isPunctuation(committedText)) {
                    EventBus.emit(EVENTS.INPUT_NEW_WORD, { word: committedText });
                }
            }

            DOM.textInput.value = "";

            // Tham số thứ 2 của handleGlobalInput là 'suppressEngineAudio' (Chặn Engine)
            // - Nếu là Tiếng Hàn (isKo = true) -> Truyền FALSE -> Để Engine tự phát âm.
            // - Nếu là Tiếng Trung (isKo = false) -> Truyền TRUE -> Chặn Engine (vì đã phát ở trên rồi).
            handleGlobalInput(virtualValue, !isKo);

            requestAnimationFrame(syncInputPosition);
        });

        DOM.textInput.addEventListener('input', (e) => {
            if (isComposing) return;

            if (e.inputType === 'insertText' || e.inputType === 'insertFromPaste') {
                const char = e.data || DOM.textInput.value;
                if (char) {
                    virtualValue += char;
                    handleGlobalInput(virtualValue);
                }
                DOM.textInput.value = "";
            }
        });

        DOM.textContainer.addEventListener('click', () => {
            // [FIX] Nếu người dùng đang bôi đen văn bản thì KHÔNG focus vào input
            if (window.getSelection().toString().length > 0) return;

            DOM.textInput.focus();
            setTimeout(syncInputPosition, 0);
        });

        DOM.textContainer.addEventListener('scroll', () => {
            requestAnimationFrame(syncInputPosition);
        });

        window.addEventListener('resize', syncInputPosition);
    }
}

export function getScroller() { return scroller; }

export function resetController() {
    scroller?.reset();
    isComposing = false;
    hideImeTooltip();
    resetTypingEngine();

    virtualValue = "";
    if (DOM.textInput) DOM.textInput.value = "";

    setTimeout(syncInputPosition, 50);
}

function findSegmentIndex(caret, charStarts) {
    if (!charStarts || !charStarts.length) return 0;
    for (let i = charStarts.length - 1; i >= 0; i--) {
        if (caret >= charStarts[i]) return i;
    }
    return 0;
}

// --- [SỬA ĐỔI SIGNATURE HÀM] ---
// Thêm tham số suppressEngineAudio (mặc định false)
export function handleGlobalInput(overrideText = null, suppressEngineAudio = false) {
    let rawInput = (overrideText !== null) ? overrideText : virtualValue;
    const currentText = rawInput.replace(/\n/g, " ");

    const state = Store.getState();
    const source = Store.getSource();
    const originalText = source.text;

    let finalText = currentText;
    if (finalText.length > originalText.length) {
        finalText = finalText.slice(0, originalText.length);
        if (overrideText === null) virtualValue = finalText;
    }

    const isDeleting = finalText.length < state.prevInputLen;
    const isJustFinished = (finalText.length === originalText.length && finalText === originalText);

    if (!state.isActive && finalText.length > 0 && (!isJustFinished || !state.startTime)) {
        EventBus.emit(EVENTS.EXERCISE_START);
        document.dispatchEvent(new CustomEvent("timer:start"));
        Store.startExercise();
        Store.setPrevInputLen(0);
        if (DOM.actionToggle) DOM.actionToggle.checked = true;
        const tokens = state.wordTokens;
        if (tokens.length) EventBus.emit(EVENTS.AUDIO_PRELOAD, tokens.slice(0, PRELOAD_WINDOW));
    }

    const { caret, changed, newWord, isComplete } = runTypingEngine(finalText);

    const oldSegIdx = source.currentSegment;
    const newSegIdx = findSegmentIndex(caret, source.charStarts);
    if (newSegIdx !== oldSegIdx) {
        Store.setCurrentSegment(newSegIdx);
        if (Store.isAudio() && !isDeleting && newSegIdx > oldSegIdx) {
            EventBus.emit(EVENTS.DICTATION_SEGMENT_CHANGE, newSegIdx);
        }
    }

    updateActiveSpans(changed, finalText, originalText, caret);
    if (state.blindMode) applyBlindMode(caret);

    const currentSpan = state.textSpans[caret];
    if (currentSpan && DOM.autoTooltipToggle?.checked) {
        showTooltipForSpan(currentSpan);
    }

    Store.setPrevIndex(caret);
    scroller?.scrollTo(currentSpan);

    syncInputPosition();

    const currentLen = finalText.length;
    const isCorrect = currentLen > 0 &&
        currentLen <= originalText.length &&
        finalText[currentLen - 1] === originalText[currentLen - 1];

    EventBus.emit(EVENTS.INPUT_CHANGE, {
        currentText: finalText,
        originalText,
        caret,
        currentLen,
        prevInputLen: state.prevInputLen,
        isCorrect
    });

    Store.setPrevInputLen(currentLen);

    // --- [LOGIC PHÁT ÂM ENGINE] ---
    // Chỉ phát âm từ Engine tìm thấy nếu KHÔNG bị chặn bởi IME
    if (newWord && !isDeleting && !suppressEngineAudio) {
        EventBus.emit(EVENTS.INPUT_NEW_WORD, { word: newWord });
        const nextIdx = findSegmentIndex(caret, state.wordStarts) + 1;
        const tokens = state.wordTokens;
        if (nextIdx < tokens.length) EventBus.emit(EVENTS.AUDIO_PRELOAD, tokens.slice(nextIdx, nextIdx + PRELOAD_WINDOW));
    }
    // Nếu bị chặn (suppressEngineAudio = true) thì ta vẫn preload audio tiếp theo cho mượt
    else if (suppressEngineAudio) {
        const nextIdx = findSegmentIndex(caret, state.wordStarts) + 1;
        const tokens = state.wordTokens;
        if (nextIdx < tokens.length) EventBus.emit(EVENTS.AUDIO_PRELOAD, tokens.slice(nextIdx, nextIdx + PRELOAD_WINDOW));
    }

    if (isComplete) {
        if (DOM.textInput) DOM.textInput.disabled = true;

        EventBus.emit(EVENTS.EXERCISE_COMPLETE);
        document.dispatchEvent(new CustomEvent("timer:stop"));

        setTimeout(() => {
            // 1. Tính toán số liệu chính xác lần cuối cùng (dựa trên endTime)
            // Lưu ý: finalLength ở đây là độ dài thực tế của văn bản (finalText.length)
            const results = getFinalResults(finalText.length);

            // 2. [QUAN TRỌNG] Cập nhật ngược lại thanh stat-item cho khớp
            // Để người dùng thấy con số trên thanh nhảy về đúng giá trị chốt hạ
            if (DOM.wpmEl) DOM.wpmEl.textContent = results.wpm;
            if (DOM.timeEl) DOM.timeEl.textContent = results.time;
            if (DOM.accuracyEl) DOM.accuracyEl.textContent = results.accuracy;
            if (DOM.errorsEl) DOM.errorsEl.textContent = results.errors;

            // 3. Hiển thị Modal với cùng bộ số liệu đó
            if (DOM.resultModal) {
                if (DOM.resAcc) DOM.resAcc.textContent = results.accuracy;
                if (DOM.resWpm) DOM.resWpm.textContent = results.wpm;
                if (DOM.resTime) DOM.resTime.textContent = results.time;
                if (DOM.resErr) DOM.resErr.textContent = results.errors;

                DOM.resultModal.classList.remove("hidden");
            } else {
                alert(`🎉 Hoàn thành!\nAcc: ${results.accuracy} | WPM: ${results.wpm}`);
            }
        }, 100);
    }
}