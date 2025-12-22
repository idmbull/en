// scripts/typing-engine.js
import { Store } from "./core/store.js";

let lastSpokenWord = "";

export function runTypingEngine(currentText) {
    const state = Store.getState();
    const expected = state.source.text;
    const caret = currentText.length;
    const prev = state.prevIndex;
    const spans = state.textSpans;

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

            // [FIX] Cập nhật Regex chặn dấu câu (Thêm dải \u3000-\u303F và \uFF00-\uFFEF)
            // \uFF0C chính là dấu phẩy ，
            // \u3002 chính là dấu chấm 。
            const isPunc = /^[.,!?;:'"(){}[\]\u3000-\u303F\uFF00-\uFFEF]+$/.test(token);

            if (isPunc) {
                return null;
            }

            const isJustStarted = (caret === start + 1);
            const isJustFinished = (caret === end);

            if ((isJustStarted || isJustFinished) && lastSpokenWord !== token) {
                lastSpokenWord = token;
                return token;
            }
        }
    }
    return null;
}