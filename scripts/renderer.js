// scripts/renderer.js
import { DOM } from "./state.js";
import { Store } from "./core/store.js";
import { wrapChars, convertInlineFootnotes } from "./utils.js";
import { EventBus, EVENTS } from "./core/events.js";

function computeWordMetadata(text) {
    const tokens = [];
    const starts = [];

    // Sử dụng Intl.Segmenter cho tiếng Trung
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
        const segments = segmenter.segment(text);
        for (const seg of segments) {
            // Chỉ lấy các phần tử là từ ngữ (loại bỏ dấu câu nếu cần, nhưng ở đây ta lấy hết để map)
            if (seg.isWordLike) {
                tokens.push(seg.segment);
                starts.push(seg.index);
            }
        }
    } else {
        // Fallback: Tách từng ký tự
        for (let i = 0; i < text.length; i++) {
            tokens.push(text[i]);
            starts.push(i);
        }
    }
    Store.setWordMetadata(tokens, starts);
}

export function displayText(rawHtmlOrMarkdown) {
    const withFootnotes = convertInlineFootnotes(rawHtmlOrMarkdown);
    DOM.textDisplay.innerHTML = marked.parse(withFootnotes);

    const sourceText = Store.getSource().text || "";
    computeWordMetadata(sourceText);

    // Initial Preload
    const tokens = Store.getState().wordTokens;
    if (tokens && tokens.length > 0) {
        EventBus.emit(EVENTS.AUDIO_PRELOAD, tokens.slice(0, 5));
    }

    // Wrap chars logic
    const walker = document.createTreeWalker(DOM.textDisplay, NodeFilter.SHOW_TEXT);
    const nodesToReplace = [];

    while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent && !node.parentNode.classList.contains("tooltip-word")) continue;
        nodesToReplace.push(node);
    }

    nodesToReplace.forEach(node => {
        const parent = node.parentNode;
        const text = node.textContent;
        if (!text && parent === DOM.textDisplay) return;

        if (parent.classList?.contains("tooltip-word")) {
            parent.innerHTML = "";
            const note = parent.dataset.note || "";
            parent.appendChild(wrapChars(text, "tooltip-char", note));
        } else {
            const frag = wrapChars(text);
            parent.replaceChild(frag, node);
        }
    });

    // Fix Layout Orphan Newlines
    const orphans = DOM.textDisplay.querySelectorAll(':scope > .newline-char');
    orphans.forEach(span => {
        const prev = span.previousElementSibling;
        if (prev && /^(P|DIV|H[1-6]|LI|BLOCKQUOTE)$/.test(prev.tagName)) {
            prev.appendChild(span);
            if (span.nextElementSibling?.classList.contains('visual-break')) {
                prev.appendChild(span.nextElementSibling);
            }
        }
    });

    // Update State Spans
    const allCandidates = Array.from(DOM.textDisplay.querySelectorAll("span"));
    const textSpans = allCandidates.filter(s =>
        !s.children.length &&
        !s.classList.contains('tooltip-word') &&
        !s.closest('.speaker-label')
    );

    Store.setSpans(textSpans);
    Store.setPrevIndex(0);

    allCandidates.forEach(s => s.classList.remove("current", "correct", "incorrect"));
    if (textSpans[0]) textSpans[0].classList.add("current");

    applyBlindMode(0);

    // Tooltip Events
    DOM.textDisplay.querySelectorAll(".tooltip-word").forEach(el => {
        el.addEventListener("mouseenter", () => document.dispatchEvent(new CustomEvent("tooltip:show", { detail: el })));
        el.addEventListener("mouseleave", () => document.dispatchEvent(new Event("tooltip:hide")));
    });
}

export function applyBlindMode(currentIndex) {
    const isBlind = Store.isBlind();
    const spans = Store.getState().textSpans;
    if (!isBlind) {
        spans.forEach(s => s.classList.remove("blind-hidden"));
        return;
    }
    for (let i = 0; i < spans.length; i++) {
        if (i <= currentIndex) spans[i].classList.remove("blind-hidden");
        else spans[i].classList.add("blind-hidden");
    }
}

export function updateActiveSpans(changedIndices, currentText, originalText, caret) {
    const spans = Store.getState().textSpans;
    for (const i of changedIndices) {
        const span = spans[i];
        if (!span) continue;
        span.classList.remove("current", "correct", "incorrect", "blind-hidden");
        if (i < caret) {
            if (currentText[i] === originalText[i]) span.classList.add("correct");
            else span.classList.add("incorrect");
        }
    }
    if (spans[caret]) spans[caret].classList.add("current");
}