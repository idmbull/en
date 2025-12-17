// scripts/input-controller.js
import { DOM } from "./state.js";
import { Store } from "./core/store.js";
import { runTypingEngine } from "./typing-engine.js";
import { runDictationEngine } from "./dictation-engine.js";
import { updateActiveSpans, applyBlindMode } from "./renderer.js";
import { showTooltipForSpan } from "./tooltip.js";
import { AutoScroller } from "./utils/scroller.js";
import { EventBus, EVENTS } from "./core/events.js";

let scroller;
let isComposing = false;

export function initController() {
    if (!scroller && DOM.textContainer) {
        scroller = new AutoScroller(DOM.textContainer);
    }

    const el = DOM.textInput;

    // 1. BẮT ĐẦU GÕ IME
    el.addEventListener('compositionstart', () => {
        isComposing = true;
        updateIMEPosition(); // Cập nhật vị trí ngay khi bắt đầu
    });

    // 2. CẬP NHẬT PINYIN (Khi gõ n, ni, nih...)
    el.addEventListener('compositionupdate', (e) => {
        isComposing = true;
        // e.data chứa chuỗi Pinyin (ví dụ: "nihao")
        showIMEPreview(e.data);
    });

    // 3. KẾT THÚC IME
    el.addEventListener('compositionend', (e) => {
        isComposing = false;
        hideIMEPreview(); // Ẩn hộp Pinyin
        handleGlobalInput(Store.getMode());
    });

    // 4. INPUT EVENT
    el.addEventListener('input', (e) => {
        if (isComposing || e.isComposing) return;
        handleGlobalInput(Store.getMode());
    });
}

// --- CÁC HÀM HỖ TRỢ VISUAL IME ---

function getCaretCoordinates() {
    // 1. Tìm span hiện tại (con trỏ màu xanh/đỏ) hoặc span đầu tiên
    let currentSpan = DOM.textDisplay.querySelector('.current');

    // Fallback: Nếu chưa bắt đầu gõ, lấy span đầu tiên
    if (!currentSpan) {
        currentSpan = DOM.textDisplay.querySelector('span');
    }

    if (currentSpan) {
        const spanRect = currentSpan.getBoundingClientRect();
        const containerRect = DOM.textContainer.getBoundingClientRect();

        // Tính toán tọa độ tương đối trong container
        // scrollLeft/Top cần được cộng vào để tính đúng khi cuộn
        return {
            left: spanRect.left - containerRect.left + DOM.textContainer.scrollLeft,
            top: spanRect.top - containerRect.top + DOM.textContainer.scrollTop,
            bottom: spanRect.bottom - containerRect.top + DOM.textContainer.scrollTop,
            height: spanRect.height,
            width: spanRect.width,
            // Trả về rect gốc để dùng tính toán va chạm
            rect: spanRect,
            containerRect: containerRect
        };
    }

    // Default fallback
    return { left: 0, top: 0, bottom: 20, height: 20, width: 0 };
}

// Di chuyển Input ẩn (để Candidate Window của OS hiện đúng chỗ)
function updateIMEPosition() {
    const coords = getCaretCoordinates();
    const el = DOM.textInput;

    // Đặt input ẩn đè lên ngay chữ đang gõ
    el.style.top = `${coords.top}px`;
    el.style.left = `${coords.left}px`;
    el.style.height = `${coords.height}px`; // Khớp chiều cao dòng

    return coords;
}

function showIMEPreview(text) {
    const preview = DOM.imePreview;
    if (!preview || !text) return;

    // 1. Hiển thị trước để trình duyệt tính toán kích thước (width/height)
    preview.textContent = text;
    preview.classList.remove('hidden');

    // 2. Lấy tọa độ
    const coords = updateIMEPosition();
    const previewWidth = preview.offsetWidth;
    const previewHeight = preview.offsetHeight;
    const containerWidth = DOM.textContainer.clientWidth;

    // --- TÍNH TOÁN VỊ TRÍ --- //

    // Mặc định: Nằm TRÊN con trỏ (cách 10px)
    let top = coords.top - previewHeight - 12;
    let left = coords.left;
    let isFlipped = false;

    // CHECK 1: TRÀN TRÊN (Top Overflow)
    // Nếu gõ dòng đầu, hộp bị khuất -> Đẩy xuống DƯỚI con trỏ
    // (Kiểm tra so với scrollTop của container)
    if (top < DOM.textContainer.scrollTop) {
        top = coords.bottom + 12; // Nằm dưới dòng chữ
        isFlipped = true;
    }

    // CHECK 2: TRÀN PHẢI (Right Overflow)
    // Nếu gõ sát lề phải, hộp bị khuất -> Đẩy lùi sang trái
    if (left + previewWidth > containerWidth + DOM.textContainer.scrollLeft) {
        left = (containerWidth + DOM.textContainer.scrollLeft) - previewWidth - 10;

        // (Tùy chọn) Nếu muốn mũi tên chỉ đúng chữ, ta cần chỉnh CSS mũi tên động.
        // Nhưng ở mức đơn giản, chỉ cần hộp không bị che là được.
    }

    // --- ÁP DỤNG --- //
    preview.style.top = `${top}px`;
    preview.style.left = `${left}px`;

    // Đảo chiều mũi tên nếu hộp nằm dưới
    if (isFlipped) {
        preview.classList.add('flipped');
    } else {
        preview.classList.remove('flipped');
    }
}

function hideIMEPreview() {
    const preview = DOM.imePreview;
    if (preview) {
        preview.classList.add('hidden');
        preview.textContent = "";
    }
}

// ------------------------------------

export function getScroller() { return scroller; }
export function resetController() {
    if (scroller) scroller.reset();
    isComposing = false;
    if (DOM.textInput) DOM.textInput.value = "";
    hideIMEPreview();
}

// ... (Giữ nguyên các hàm helper khác: triggerPreload, getCurrentWordIndex...) ...
function triggerPreload(currentIndex) { /* ...giữ nguyên... */ }
function getCurrentWordIndex(caret, wordStarts, wordTokens) { /* ...giữ nguyên... */ }
function forceCaretToEnd(el) { /* ...giữ nguyên... */ }


export function handleGlobalInput(mode) {
    if (isComposing) return;

    const el = DOM.textInput;

    // Cập nhật vị trí Input ẩn mỗi khi gõ xong 1 từ để chuẩn bị cho từ tiếp theo
    // Điều này đảm bảo khi bắt đầu gõ từ mới, IME hiện đúng chỗ ngay lập tức
    requestAnimationFrame(updateIMEPosition);

    let val = el.value;
    const state = Store.getState();
    const originalText = state.source.text;

    // 1. Enter -> Space
    if (val.includes("\n")) {
        val = val.replace(/\n/g, " ");
        el.value = val;
    }

    // 2. Cắt độ dài
    if (val.length > originalText.length) {
        val = val.slice(0, originalText.length);
        el.value = val;
    }

    const currentText = val;
    forceCaretToEnd(el);

    // Auto Start
    if (!state.isActive) {
        if (mode === "typing") {
            EventBus.emit(EVENTS.EXERCISE_START);
            document.dispatchEvent(new CustomEvent("timer:start"));
            Store.startExercise();
            Store.setPrevInputLen(0);
            if (DOM.actionToggle) DOM.actionToggle.checked = true;
        } else {
            el.value = ""; return;
        }
    }

    // ... (Phần logic Engine, UI Updates, Stats giữ nguyên như cũ) ...
    const isDeleting = val.length < state.prevInputLen;
    const oldSegIdx = Store.getSource().currentSegment;

    const engineResult = mode === "dictation"
        ? runDictationEngine(currentText)
        : runTypingEngine(currentText);

    const { caret, changed, newWord, isComplete } = engineResult;

    updateActiveSpans(changed, currentText, originalText, caret);
    if (state.blindMode) applyBlindMode(caret);

    const currentSpan = state.textSpans[caret];
    if (currentSpan && DOM.autoTooltipToggle?.checked) showTooltipForSpan(currentSpan);

    Store.setPrevIndex(caret);
    if (scroller && currentSpan) scroller.scrollTo(currentSpan);

    if (mode === "dictation") {
        const newSegIdx = engineResult.segmentIndex;
        if (newSegIdx !== oldSegIdx) {
            Store.setCurrentSegment(newSegIdx);
            if (!isDeleting && newSegIdx > oldSegIdx) {
                EventBus.emit(EVENTS.DICTATION_SEGMENT_CHANGE, newSegIdx);
            }
        }
        if (engineResult.segmentDone) {
            document.dispatchEvent(new CustomEvent("dictation:segmentDone", { detail: engineResult.segmentIndex }));
            EventBus.emit(EVENTS.DICTATION_SEGMENT_DONE, engineResult.segmentIndex);
        }
    }

    const currentLen = currentText.length;
    let isCorrect = currentLen > 0 ? currentText[currentLen - 1] === originalText[currentLen - 1] : false;

    EventBus.emit(EVENTS.INPUT_CHANGE, {
        currentText, originalText, caret, currentLen,
        prevInputLen: state.prevInputLen, isCorrect
    });
    Store.setPrevInputLen(currentLen);

    if (newWord && !isDeleting) {
        EventBus.emit(EVENTS.INPUT_NEW_WORD, { word: newWord, currentText, originalText });
        const currentIdx = getCurrentWordIndex(caret, state.wordStarts, state.wordTokens);
        triggerPreload(currentIdx);
    }

    if (isComplete) {
        el.disabled = true;
        EventBus.emit(EVENTS.EXERCISE_COMPLETE);
        document.dispatchEvent(new CustomEvent("timer:stop"));
        setTimeout(() => {
            alert(`🎉 Hoàn thành!\nAcc: ${DOM.accuracyEl.textContent}`);
        }, 100);
    }
}