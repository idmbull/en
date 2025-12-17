// scripts/typing-engine.js
import { Store } from "./core/store.js"; // Import Store

let lastSpokenWord = ""; // Local state is fine here

export function runTypingEngine(currentText) {
    const state = Store.getState();
    const expected = state.source.text;
    const spans = state.textSpans;
    const prev = state.prevIndex;
    const caret = currentText.length;

    const changed = [];
    let newWord = null;
    let isComplete = false;

    const start = Math.min(prev, caret) - 2;
    const end   = Math.max(prev, caret) + 2;
    const lo = Math.max(0, start);
    const hi = Math.min(spans.length - 1, end);

    for (let i = lo; i <= hi; i++) {
        changed.push(i);
    }

    if (caret === expected.length && currentText === expected) {
        isComplete = true;
    }

    newWord = detectNewWord(caret, state);

    return { caret, changed, newWord, isComplete };
}

function detectNewWord(caret, state) {
    const starts = state.wordStarts;
    const tokens = state.wordTokens;

    if (!tokens.length || !starts.length) return null;

    for (let i = 0; i < starts.length; i++) {
        const start = starts[i];
        const end   = start + tokens[i].length;

        if (caret > start && caret <= end) {
            if (caret === start + 1 && lastSpokenWord !== tokens[i]) {
                lastSpokenWord = tokens[i];
                return tokens[i];
            }
            return null;
        }
    }
    return null;
}