// scripts/utils/content-parser.js
import { convertMarkdownToPlain } from "../utils.js";

const TIMESTAMP_REGEX = /^([\d.]+)\s+([\d.]+)/;

function cleanText(text) {
    if (!text) return "";
    return text
        .replace(/&nbsp;/gi, " ")
        .replace(/\u00A0/g, " ")
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, "\"")
        .replace(/[—–]/g, "-")
        .replace(/ …/g, "...")
        .replace(/…/g, "...")
        .replace(/\u200B/g, "");
}

function cleanForTyping(text) {
    // Chuyển markdown sang text thuần
    let plain = convertMarkdownToPlain(text);
    // [FIX] Chuẩn hóa khoảng trắng: thay thế chuỗi whitespace bằng 1 space duy nhất
    // Điều này quan trọng vì Browser render HTML cũng sẽ collapse whitespace.
    return plain.replace(/\s+/g, ' ').trim();
}
// Hàm mã hóa an toàn cho HTML Attribute (tránh lỗi khi note chứa dấu ngoặc kép)
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
    // Helper để tạo HTML span
    const makeSpan = (word, note) => {
        // [QUAN TRỌNG] Clean text bên trong span để đồng bộ tuyệt đối với Typing Logic
        // Tránh việc marked parse lại nội dung bên trong span gây lệch DOM
        const cleanWord = convertMarkdownToPlain(word);
        return `<span class="tooltip-word" data-note="${escapeAttr(note)}">${cleanWord}</span>`;
    };

    return text
        // 0. Case: `text` -> Skipped Text
        .replace(/`([^`]+)`/g, '<span class="skipped-text">$1</span>')

        // 1. Case: **text**^[note] -> Tooltip
        .replace(/\*\*(.+?)\*\*\^\[([^\]]+)\]/g, (match, word, note) => makeSpan(word, note))

        // 2. Case: Dấu câu^[note]
        .replace(/([.,;!?])\^\[([^\]]+)\]/g, (match, char, note) => makeSpan(char, note))

        // 3. Case: Từ đơn^[note]
        .replace(/([^\s.,;!?\[\]\^]+)\^\[([^\]]+)\]/g, (match, word, note) => makeSpan(word, note))

        // 4. Clean Markdown còn sót lại
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/__(.+?)__/g, "$1")
        .replace(/_(.+?)_/g, "$1");
}

function assembleData(blocks, result) {
    let currentParagraphHtml = "";

    const flushParagraph = () => {
        if (currentParagraphHtml) {
            result.html += `<p>${currentParagraphHtml}</p>`;
            result.html += '<span class="newline-char">↵</span>';
            currentParagraphHtml = "";
        }
    };

    blocks.forEach((block, idx) => {
        if (block.type === 'header' || block.type === 'break') {
            flushParagraph();
            if (block.type === 'header') {
                result.html += `<h3 class="visual-header">${block.content}</h3>`;
            }
            return;
        }

        const rawContent = block.content
            .replace(/`([^`]+)`/g, "")
            .replace(/\*\*(.+?)\*\*\^\[([^\]]+)\]/g, "$1")
            .replace(/([.,;!?])\^\[([^\]]+)\]/g, "$1")
            .replace(/([^\s.,;!?\[\]\^]+)\^\[([^\]]+)\]/g, "$1")
            .replace(/\*\*(.+?)\*\*/g, "$1")
            .replace(/\*(.+?)\*/g, "$1");

        const cleanTypingText = cleanForTyping(rawContent);

        if (cleanTypingText.length > 0) {
            const prefixSpace = (result.text.length > 0 && !result.text.endsWith(" ")) ? " " : "";
            result.charStarts.push(result.text.length + prefixSpace.length);
            result.text += prefixSpace + cleanTypingText;

            if (block.type === 'audio') {
                result.segments.push({
                    audioStart: block.start,
                    audioEnd: block.end,
                    text: cleanTypingText
                });
            }
        }

        const speakerHtml = block.speaker ? `<span class="speaker-label">${block.speaker}: </span>` : "";
        const contentHtml = formatHtmlContent(block.content);

        const htmlPrefix = currentParagraphHtml ? " " : "";
        currentParagraphHtml += `${htmlPrefix}${speakerHtml}${contentHtml}`;
    });

    flushParagraph();

    if (result.html.endsWith('<span class="newline-char">↵</span>')) {
        result.html = result.html.slice(0, -'<span class="newline-char">↵</span>'.length);
    }

}
