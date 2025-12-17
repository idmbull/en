// scripts/typing-engine.js
import { Store } from "./core/store.js";

// Reset state nếu cần (dành cho hàm reset bên controller gọi)
export function resetTypingEngine() {
    // Không cần biến lastSpokenWord nữa vì ta so sánh trực tiếp độ lệch
}

export function runTypingEngine(currentText) {
    const state = Store.getState();
    const expected = state.source.text;
    const spans = state.textSpans;
    const prevIndex = state.prevIndex || 0; // Vị trí con trỏ trước đó
    const caret = currentText.length;       // Vị trí con trỏ hiện tại

    const changed = [];
    let newWord = null;
    let isComplete = false;

    // 1. Tính toán vùng thay đổi để tô màu (Giữ nguyên)
    const start = Math.min(prevIndex, caret) - 2;
    const end = Math.max(prevIndex, caret) + 2;
    const lo = Math.max(0, start);
    const hi = Math.min(spans.length - 1, end);

    for (let i = lo; i <= hi; i++) {
        changed.push(i);
    }

    // 2. Kiểm tra hoàn thành bài (Giữ nguyên)
    if (caret === expected.length && currentText === expected) {
        isComplete = true;
    }

    // 3. [LOGIC MỚI] PHÁT HIỆN TỪ VỪA GÕ
    // Thay vì tra từ điển, ta xem người dùng vừa nhập thêm cái gì
    if (caret > prevIndex) {
        // Lấy đoạn văn bản vừa nhập thêm
        // Ví dụ: prev=0, caret=2 -> slice(0, 2) = "你好"
        const newlyAdded = currentText.slice(prevIndex, caret);
        const expectedSlice = expected.slice(prevIndex, caret);

        // Chỉ phát âm nếu:
        // a. Người dùng gõ ĐÚNG
        // b. Ký tự đó KHÔNG phải là khoảng trắng hoặc dấu câu
        if (newlyAdded === expectedSlice) {
            // Regex kiểm tra: \s là khoảng trắng, \p{P} là dấu câu (bao gồm cả dấu câu tiếng Trung 。，)
            // Cờ 'u' để hỗ trợ Unicode
            const isContent = /[^\s\p{P}]/u.test(newlyAdded);

            if (isContent) {
                newWord = newlyAdded;
            }
        }
    }

    return { caret, changed, newWord, isComplete };
}