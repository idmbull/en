import { convertMarkdownToPlain } from "../utils.js";

const TIMESTAMP_REGEX = /^([\d.]+)\s+([\d.]+)/;

// [CẬP NHẬT] Kiểm tra ký tự CJK mở rộng
// \u2000-\u206f: General Punctuation (QUAN TRỌNG: Chứa “ ” ‘ ’ … —)
// \u3000-\u303f: CJK Symbols and Punctuation (Dấu câu CJK 。 、 【 】)
// \uff00-\uffef: Fullwidth Forms (Dấu câu toàn khổ ： ！ ？ ，)
// \u4e00-\u9fa5: CJK Unified Ideographs (Chữ Hán)
// \uac00-\ud7af: Hangul (Tiếng Hàn)
function isCJK(char) {
    if (!char) return false;
    return /[\u2000-\u206f\u3000-\u303f\uff00-\uffef\u4e00-\u9fa5\uac00-\ud7af]/.test(char);
}

// Hàm làm sạch cơ bản cho metadata
function cleanText(text) {
    if (!text) return "";
    return text
        .replace(/&nbsp;/gi, " ")
        .replace(/\u00A0/g, " ")
        .replace(/[‘’]/g, "'")
        // .replace(/[“”]/g, "\"")
        .replace(/[—–]/g, "-")
        .replace(/ …/g, "...")
        .replace(/…/g, "...")
        .replace(/\u200B/g, "");
}

// [REFACTOR] Hàm làm sạch dành riêng cho nội dung gõ (Typing Engine)
function cleanForTyping(text) {
    if (!text) return "";

    let s = text;

    // 1. Loại bỏ Footnote: ^[note] trước để tránh xử lý nhầm bên trong
    s = s.replace(/\^\[[^\]]+\]/g, '');

    // 2. Loại bỏ Skipped Text: `content`
    s = s.replace(/`[^`]+`/g, '');

    // 3. Loại bỏ định dạng Markdown
    s = s.replace(/[*_~]+/g, '');

    // 4. Thay thế các ký tự xuống dòng/tab bằng dấu cách
    s = s.replace(/[\r\n\t]+/g, ' ');

    // 5. Gộp nhiều dấu cách liên tiếp thành 1 
    s = s.replace(/\s+/g, ' ');

    return s;
}

function escapeAttr(s) {
    if (!s) return "";
    return s.replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export function parseUnified(rawContent) {
    const lines = rawContent.split(/\r?\n/);
    const result = {
        title: "",
        text: "",
        html: "",
        segments: [],
        charStarts: [],
        rawLength: 0
    };

    let blocks = [];
    let isDictation = lines.some(line => TIMESTAMP_REGEX.test(line.trim()));

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) {
            if (blocks.length > 0 && blocks[blocks.length - 1].type !== 'break') {
                blocks.push({ type: 'break' });
            }
            return;
        }

        if (trimmed.startsWith("# ")) {
            result.title = cleanText(trimmed.replace("#", "").trim());
            return;
        }

        if (trimmed.startsWith("##")) {
            blocks.push({ type: 'header', content: cleanText(trimmed.replace(/^#+\s*/, "")) });
        } else if (isDictation && TIMESTAMP_REGEX.test(trimmed)) {
            blocks.push(parseDictationLine(trimmed));
        } else {
            blocks.push({ type: 'paragraph', content: cleanText(trimmed) });
        }
    });

    assembleData(blocks, result);

    if (result.text) {
        result.text = result.text.trimEnd();
    }

    return result;
}

function parseDictationLine(line) {
    const parts = line.split("\t");
    let start = 0, end = 0, speaker = null, textRaw = "";

    if (parts.length >= 4) {
        start = parseFloat(parts[0]); end = parseFloat(parts[1]);
        speaker = parts[2].trim(); textRaw = parts.slice(3).join(" ").trim();
    } else {
        const m = line.match(/^([\d.]+)\s+([\d.]+)\s+(.*)$/);
        if (m) { start = parseFloat(m[1]); end = parseFloat(m[2]); textRaw = m[3].trim(); }
        else textRaw = line;
    }
    return { type: 'audio', start, end, speaker: cleanText(speaker), content: cleanText(textRaw) };
}

function formatHtmlContent(text) {
    const makeSpan = (word, note) => {
        const cleanWord = convertMarkdownToPlain(word);
        return `<span class="tooltip-word" data-note="${escapeAttr(note)}">${cleanWord}</span>`;
    };

    return text
        .replace(/`([^`]+)`/g, '<span class="skipped-text">$1</span>')
        .replace(/\*\*(.+?)\*\*\^\[([^\]]+)\]/g, (m, w, n) => makeSpan(w, n))
        .replace(/([.,;!?])\^\[([^\]]+)\]/g, (m, c, n) => makeSpan(c, n))
        .replace(/([^\s.,;!?\[\]\^]+)\^\[([^\]]+)\]/g, (m, w, n) => makeSpan(w, n))
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/__(.+?)__/g, "$1")
        .replace(/_(.+?)_/g, "$1");
}

function assembleData(blocks, result) {
    let currentParagraphHtml = "";
    let lastBlockWasBreak = false;
    let lastRawChar = null;

    const flushParagraph = () => {
        if (currentParagraphHtml) {
            result.html += `<p>${currentParagraphHtml}</p>`;
            result.html += '<span class="newline-char">↵</span>';
            currentParagraphHtml = "";
            lastRawChar = null;
        }
    };

    blocks.forEach((block) => {
        if (block.type === 'header' || block.type === 'break') {
            flushParagraph();
            if (block.type === 'header') {
                result.html += `<h3 class="visual-header">${block.content}</h3>`;
            }
            lastBlockWasBreak = true;
            return;
        }

        // --- 1. XỬ LÝ TEXT CHO TYPING ENGINE (result.text) ---
        const cleanFragment = cleanForTyping(block.content);
        const hasTypingContent = cleanFragment.length > 0 && cleanFragment.trim().length > 0;
        const isSkippedLine = !hasTypingContent && block.content.trim().length > 0;

        if (hasTypingContent) {
            let prefix = "";
            if (result.text.length > 0) {
                const endsWithSpace = result.text.endsWith(" ");
                const startsWithSpace = cleanFragment.startsWith(" ");

                if (!endsWithSpace && !startsWithSpace) {
                    prefix = " ";
                    if (!lastBlockWasBreak) {
                        const lastChar = result.text[result.text.length - 1];
                        const firstChar = cleanFragment[0];
                        if (isCJK(lastChar) && isCJK(firstChar)) {
                            prefix = "";
                        }
                    }
                }
            }

            result.charStarts.push(result.text.length + prefix.length);
            result.text += prefix + cleanFragment;

            if (block.type === 'audio') {
                result.segments.push({
                    audioStart: block.start,
                    audioEnd: block.end,
                    text: cleanFragment.trim()
                });
            }
            lastBlockWasBreak = false;
        }
        else if (isSkippedLine) {
            if (result.text.length > 0 && !result.text.endsWith(" ")) {
                result.text += " ";
            }
            lastBlockWasBreak = false;
        }

        // --- 2. XỬ LÝ HIỂN THỊ HTML (result.html) ---
        const speakerHtml = block.speaker ? `<span class="speaker-label">${block.speaker}: </span>` : "";
        const contentHtml = formatHtmlContent(block.content);

        let htmlPrefix = "";

        if (currentParagraphHtml) {
            htmlPrefix = " ";

            if (lastRawChar && block.content) {
                const firstChar = block.content[0];
                // Cập nhật: Kiểm tra CJK với cả các dấu ngoặc kép, gạch ngang...
                if (!block.speaker && isCJK(lastRawChar) && isCJK(firstChar)) {
                    htmlPrefix = "";
                }
            }
        }

        currentParagraphHtml += `${htmlPrefix}${speakerHtml}${contentHtml}`;

        if (block.content && block.content.length > 0) {
            lastRawChar = block.content[block.content.length - 1];
        }
    });

    flushParagraph();

    if (result.html.endsWith('<span class="newline-char">↵</span>')) {
        result.html = result.html.slice(0, -'<span class="newline-char">↵</span>'.length);
    }
}