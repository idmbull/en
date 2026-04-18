// scripts/renderer.js
import { DOM } from "./state.js";
import { Store } from "./core/store.js";
import { wrapChars, convertInlineFootnotes } from "./utils.js";
import { EventBus, EVENTS } from "./core/events.js";

const REGEX_KOREAN = /[\uAC00-\uD7AF]/;
const REGEX_CHINESE = /[\u4e00-\u9fa5]/;

function computeMetadata(text) {
    const tokens = [];
    const starts =[];

    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        let lang = 'en';
        if (REGEX_KOREAN.test(text)) {
            lang = 'ko'; 
        } else if (REGEX_CHINESE.test(text)) {
            lang = 'zh-CN'; 
        }

        const segmenter = new Intl.Segmenter(lang, { granularity: 'word' });
        const iterator = segmenter.segment(text);

        for (const segment of iterator) {
            if (segment.isWordLike) {
                tokens.push(segment.segment);
                starts.push(segment.index);
            }
        }
    } else {
        const re = /[a-z0-9\u4e00-\u9fa5\uAC00-\uD7AF]+(?:[,'./-][a-z0-9\u4e00-\u9fa5\uAC00-\uD7AF]+)*/gi;
        let m;
        while ((m = re.exec(text)) !== null) {
            tokens.push(m[0]);
            starts.push(m.index);
        }
    }

    Store.setWordMetadata(tokens, starts);
    return tokens;
}

export function displayText(rawHtmlOrMarkdown) {
    const withFootnotes = convertInlineFootnotes(rawHtmlOrMarkdown);
    DOM.textDisplay.innerHTML = marked.parse(withFootnotes);

    const tokens = computeMetadata(Store.getSource().text || "");

    if (tokens.length > 0) {
        EventBus.emit(EVENTS.AUDIO_PRELOAD, tokens.slice(0, 5));
    }

    const walker = document.createTreeWalker(DOM.textDisplay, NodeFilter.SHOW_TEXT);
    const nodesToReplace =[];

    while (walker.nextNode()) {
        const node = walker.currentNode;
        const p = node.parentElement;

        if (p.closest('.visual-header') || p.closest('.speaker-label') || p.closest('.skipped-text')) continue;
        if (!node.textContent && !p.classList.contains("tooltip-word")) continue;
        nodesToReplace.push(node);
    }

    nodesToReplace.forEach(node => {
        const parent = node.parentNode;
        const text = node.textContent;
        if (parent === DOM.textDisplay && !text.trim()) return;

        if (parent.classList?.contains("tooltip-word")) {
            parent.innerHTML = "";
            parent.appendChild(wrapChars(text, "tooltip-char", parent.dataset.note || ""));
        } else {
            parent.replaceChild(wrapChars(text), node);
        }
    });

    // Xử lý xuống dòng visual
    DOM.textDisplay.querySelectorAll(':scope > .newline-char').forEach(span => {
        let prev = span.previousElementSibling;
        while (prev && (prev.tagName === 'BR' || prev.classList.contains('visual-break'))) {
            prev = prev.previousElementSibling;
        }
        
        if (!prev || prev.classList.contains('visual-header')) {
            span.remove();
        } else if (/^(P|DIV|H[1-6]|LI|BLOCKQUOTE)$/.test(prev.tagName)) {
            
            // Lấy ký tự cuối cùng trước khi append ký tự Enter
            const lastCharNode = prev.lastElementChild;
            
            prev.appendChild(span);
            if (span.nextElementSibling?.classList.contains('visual-break')) {
                prev.appendChild(span.nextElementSibling);
            }

            // [MODIFIED] Gói ký tự cuối cùng và ký tự Enter vào một thẻ nowrap 
            // để đảm bảo 100% không bao giờ rớt dòng độc lập
            if (lastCharNode && lastCharNode.tagName === 'SPAN') {
                const wrapper = document.createElement('span');
                wrapper.className = 'nowrap-group';
                wrapper.style.whiteSpace = 'nowrap';
                
                prev.insertBefore(wrapper, lastCharNode);
                wrapper.appendChild(lastCharNode);
                wrapper.appendChild(span);
            }
        }
    });

    DOM.textDisplay.querySelectorAll(':scope > br').forEach(br => br.remove());

    const rawSpans = Array.from(DOM.textDisplay.querySelectorAll("span")).filter(s =>
        !s.children.length &&
        !s.classList.contains('tooltip-word') &&
        !s.closest('.speaker-label') &&
        !s.closest('.visual-header') &&
        !s.closest('.skipped-text')
    );

    const sourceText = Store.getSource().text;
    const verifiedSpans =[];
    let textIdx = 0;

    for (const span of rawSpans) {
        if (textIdx >= sourceText.length) break;

        const spanChar = span.textContent;
        const expectedChar = sourceText[textIdx];
        const isNewlineSpan = span.classList.contains('newline-char');
        const effectiveSpanChar = isNewlineSpan ? " " : spanChar;

        if (effectiveSpanChar === expectedChar) {
            verifiedSpans.push(span);
            textIdx++;
        } else if (effectiveSpanChar === ' ' && expectedChar !== ' ') {
            // Phantom space -> Ignore
        } else {
            verifiedSpans.push(span);
            textIdx++;
        }
    }

    Store.setSpans(verifiedSpans);
    Store.setPrevIndex(0);

    DOM.textDisplay.querySelectorAll(".current, .correct, .incorrect").forEach(s => s.classList.remove("current", "correct", "incorrect"));
    if (verifiedSpans[0]) verifiedSpans[0].classList.add("current");

    applyBlindMode(0);

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
    spans.forEach((s, i) => s.classList.toggle("blind-hidden", i > currentIndex));
}

export function updateActiveSpans(changedIndices, currentText, originalText, caret) {
    const spans = Store.getState().textSpans;
    changedIndices.forEach(i => {
        const span = spans[i];
        if (!span) return;
        span.classList.remove("current", "correct", "incorrect", "blind-hidden");
        if (i < caret) {
            span.classList.add(currentText[i] === originalText[i] ? "correct" : "incorrect");
        }
    });
    if (spans[caret]) spans[caret].classList.add("current");
}