// scripts/typing-engine.js
import { Store } from "./core/store.js";

// Biến lưu chỉ mục từ xa nhất đã đọc
let furthestSpokenIndex = -1;

// Hàm tìm index của từ dựa trên vị trí con trỏ
function getWordIndexAtCaret(caret, state) {
    const { wordStarts, wordTokens } = state;
    if (!wordTokens.length) return -1;

    // Tìm từ mà con trỏ đang nằm trong hoặc nằm ngay sau
    for (let i = 0; i < wordStarts.length; i++) {
        const start = wordStarts[i];
        const end = start + wordTokens[i].length;
        // Cho phép caret nằm ngay sau từ (vừa gõ xong) cũng tính là từ đó
        if (caret >= start && caret <= end) {
            return i;
        }
    }

    // Nếu chưa tìm thấy, kiểm tra xem có đang ở khoảng trắng giữa các từ không
    // Logic: Lấy từ gần nhất phía trước
    for (let i = wordStarts.length - 1; i >= 0; i--) {
        if (caret >= wordStarts[i]) return i;
    }

    return -1;
}

export function resetTypingEngine() {
    furthestSpokenIndex = -1;
}

export function runTypingEngine(currentText) {
    const state = Store.getState();
    const expected = state.source.text;
    const caret = currentText.length;
    const prev = state.prevIndex;
    const spans = state.textSpans;
    const prevInputLen = state.prevInputLen;

    // --- LOGIC XỬ LÝ KHI XÓA (DELETION LOGIC) ---
    // Nếu độ dài văn bản giảm, tức là người dùng đang xóa
    if (currentText.length < prevInputLen) {
        if (currentText.length === 0) {
            furthestSpokenIndex = -1; // Reset hoàn toàn nếu xóa hết
        } else {
            // Tính toán từ hiện tại đang đứng
            const currentWordIdx = getWordIndexAtCaret(caret, state);

            // CÔNG THỨC QUAN TRỌNG:
            // Kéo mốc xa nhất lùi về, nhưng giữ lại 1 từ phía trước làm "bộ đệm".
            // Điều này giúp: 
            // 1. Không phát lại từ đang sửa (current).
            // 2. Không phát lại từ ngay kế tiếp (current + 1).
            // 3. NHƯNG sẽ phát lại các từ sau đó nữa.
            if (currentWordIdx !== -1) {
                furthestSpokenIndex = Math.min(furthestSpokenIndex, currentWordIdx + 1);
            }
        }
    }
    // ---------------------------------------------

    const changed = [];
    const start = Math.max(0, Math.min(prev, caret) - 5);
    const end = Math.min(spans.length - 1, Math.max(prev, caret) + 5);

    for (let i = start; i <= end; i++) changed.push(i);

    const isComplete = (caret === expected.length && currentText === expected);
    const newWord = detectNewWord(caret, state);

    return { caret, changed, newWord, isComplete };
}

function detectNewWord(caret, state) {
    const { wordStarts, wordTokens } = state;
    if (!wordTokens.length) return null;

    for (let i = 0; i < wordStarts.length; i++) {
        const start = wordStarts[i];
        const end = start + wordTokens[i].length;

        if (caret >= start && caret <= end) {
            const token = wordTokens[i];
            const isPunc = /^[.,!?;:'"(){}[\]\u3000-\u303F\uFF00-\uFFEF]+$/.test(token);

            if (isPunc) return null;

            const isJustStarted = (caret === start + 1);
            const isJustFinished = (caret === end);

            // LOGIC PHÁT ÂM:
            // Chỉ phát khi index của từ hiện tại LỚN HƠN mốc xa nhất
            if ((isJustStarted || isJustFinished) && i > furthestSpokenIndex) {
                furthestSpokenIndex = i; // Cập nhật mốc mới
                return token;
            }
        }
    }
    return null;
}