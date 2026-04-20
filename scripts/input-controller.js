// scripts/input-controller.js
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
let cachedSpanRect = null; // Cache lưu tọa độ để chống giật tooltip

function isPunctuation(str) {
    // Regex bao gồm dấu ASCII cơ bản và dấu CJK
    return /^[.,!?;:'"(){}[\]\u3000-\u303F\uFF00-\uFFEF]+$/.test(str);
}

function isKoreanText(text) {
    return /[\uAC00-\uD7AF]/.test(text);
}

// Xử lý nắn dấu đồng bộ
function applySmartQuotes(incomingText, currentVirtualLen) {
    const state = Store.getState();
    const expectedText = state.source.text;
    if (!expectedText) return incomingText;

    const DOUBLE_QUOTES =['"', '“', '”', '«', '»', '「', '」', '『', '』'];
    const SINGLE_QUOTES = ["'", '‘', '’'];

    let result = "";
    for (let i = 0; i < incomingText.length; i++) {
        const char = incomingText[i];
        const expectedChar = expectedText[currentVirtualLen + i];

        if (expectedChar) {
            if (DOUBLE_QUOTES.includes(char) && DOUBLE_QUOTES.includes(expectedChar)) {
                result += expectedChar;
            } else if (SINGLE_QUOTES.includes(char) && SINGLE_QUOTES.includes(expectedChar)) {
                result += expectedChar;
            } else {
                result += char;
            }
        } else {
            result += char;
        }
    }
    return result;
}

// --- TOOLTIP IME ---
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
    if (!text) {
        tooltip.classList.remove('visible');
        return;
    }
    
    tooltip.textContent = text;
    
    // Dùng bottom thay vì top để tooltip tự dãn lên trên không cần JS đo lại chiều cao
    if (cachedSpanRect) {
        const bottomPos = window.innerHeight - cachedSpanRect.top + 5;
        tooltip.style.bottom = `${bottomPos}px`;
        tooltip.style.left = `${cachedSpanRect.left}px`;
        tooltip.style.top = 'auto'; // Reset top
    }

    tooltip.classList.add('visible');
}

function hideImeTooltip() {
    if (imeTooltipEl) imeTooltipEl.classList.remove('visible');
}

function syncInputPosition() {
    const state = Store.getState();
    const currentSpan = state.textSpans[state.prevIndex || 0];
    const inputArea = document.querySelector('.input-area');
    const textarea = DOM.textInput;

    if (currentSpan && inputArea && textarea) {
        const rect = currentSpan.getBoundingClientRect();
        cachedSpanRect = rect; 

        // [TỐI ƯU CỰC MẠNH] Fix triệt để lỗi Window IME bị nhảy (Jitter/Blinking)
        // Mở rộng textarea cực lớn để Pinyin không bao giờ bị rớt dòng (wrap)
        // Khi caret bị tràn ra ngoài, Chromium sẽ báo lỗi tọa độ (0,0) làm IME nhảy lên góc màn hình.
        inputArea.style.top = `${rect.top}px`;
        inputArea.style.left = `${rect.left}px`;
        inputArea.style.width = `1000px`;
        inputArea.style.height = `200px`;

        textarea.style.whiteSpace = 'nowrap';
        textarea.style.overflow = 'hidden';
        textarea.style.width = '1000px';
        textarea.style.height = '200px';

        const style = window.getComputedStyle(currentSpan);
        textarea.style.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        textarea.style.lineHeight = style.lineHeight;

        if (isComposing && imeTooltipEl && imeTooltipEl.classList.contains('visible')) {
            const bottomPos = window.innerHeight - rect.top + 5;
            imeTooltipEl.style.bottom = `${bottomPos}px`;
            imeTooltipEl.style.left = `${rect.left}px`;
        }
    }
}

export function initController() {
    if (!scroller && DOM.textContainer) {
        scroller = new AutoScroller(DOM.textContainer);
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

        DOM.textInput.addEventListener('compositionstart', () => { 
            isComposing = true; 
            syncInputPosition(); // Chốt vị trí ngay khi bắt đầu gõ IME
        });

        DOM.textInput.addEventListener('compositionupdate', (e) => {
            isComposing = true;
            updateImeTooltip(e.data);
            // Cố tình bỏ qua syncInputPosition() ở đây để tránh Layout Thrashing gây giật lag
        });

        DOM.textInput.addEventListener('compositionend', (e) => {
            isComposing = false;
            hideImeTooltip();

            let committedText = e.data;
            let isKo = false; 

            if (committedText) {
                // Xử lý đồng bộ dấu nháy kép/đơn 
                committedText = applySmartQuotes(committedText, virtualValue.length);

                virtualValue += committedText;
                isKo = isKoreanText(committedText);

                if (!isKo && !isPunctuation(committedText)) {
                    EventBus.emit(EVENTS.INPUT_NEW_WORD, { word: committedText });
                }
            }

            DOM.textInput.value = "";
            handleGlobalInput(virtualValue, !isKo);
            requestAnimationFrame(syncInputPosition);
        });

        DOM.textInput.addEventListener('input', (e) => {
            if (isComposing) return;

            if (e.inputType === 'insertText' || e.inputType === 'insertFromPaste') {
                let char = e.data || DOM.textInput.value;
                if (char) {
                    char = applySmartQuotes(char, virtualValue.length);
                    virtualValue += char;
                    handleGlobalInput(virtualValue);
                }
                DOM.textInput.value = "";
            }
        });

        DOM.textContainer.addEventListener('click', () => {
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

    if (newWord && !isDeleting && !suppressEngineAudio) {
        EventBus.emit(EVENTS.INPUT_NEW_WORD, { word: newWord });
        const nextIdx = findSegmentIndex(caret, state.wordStarts) + 1;
        const tokens = state.wordTokens;
        if (nextIdx < tokens.length) EventBus.emit(EVENTS.AUDIO_PRELOAD, tokens.slice(nextIdx, nextIdx + PRELOAD_WINDOW));
    } else if (suppressEngineAudio) {
        const nextIdx = findSegmentIndex(caret, state.wordStarts) + 1;
        const tokens = state.wordTokens;
        if (nextIdx < tokens.length) EventBus.emit(EVENTS.AUDIO_PRELOAD, tokens.slice(nextIdx, nextIdx + PRELOAD_WINDOW));
    }

    if (isComplete) {
        if (DOM.textInput) DOM.textInput.disabled = true;

        EventBus.emit(EVENTS.EXERCISE_COMPLETE);
        document.dispatchEvent(new CustomEvent("timer:stop"));

        setTimeout(() => {
            const results = getFinalResults(finalText.length);

            if (DOM.wpmEl) DOM.wpmEl.textContent = results.wpm;
            if (DOM.timeEl) DOM.timeEl.textContent = results.time;
            if (DOM.accuracyEl) DOM.accuracyEl.textContent = results.accuracy;
            if (DOM.errorsEl) DOM.errorsEl.textContent = results.errors;

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