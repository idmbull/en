// scripts/dictation-engine.js
import { Store } from "./core/store.js";
import { runTypingEngine } from "./typing-engine.js";

export function runDictationEngine(currentText) {
    const base = runTypingEngine(currentText);
    const source = Store.getSource();
    
    const idx = findCurrentSegment(base.caret, source.charStarts);
    
    if (idx !== source.currentSegment) {
        Store.setCurrentSegment(idx);
    }

    // Check segment completion
    const seg = source.segments[idx];
    let segmentDone = false;
    let dictationDone = base.isComplete;

    if (seg) {
        const segStart = source.charStarts[idx];
        const segEnd = segStart + seg.text.length;

        if (base.caret >= segEnd) {
            segmentDone = true;
        }
    }

    return {
        ...base,
        segmentIndex: idx,
        segmentDone,
        dictationDone
    };
}

function findCurrentSegment(caret, charStarts) {
    if (!charStarts || charStarts.length === 0) return 0;
    for (let i = charStarts.length - 1; i >= 0; i--) {
        if (caret >= charStarts[i]) return i;
    }
    return 0;
}