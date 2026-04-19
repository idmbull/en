// scripts/utils/content-parser.js
import { convertMarkdownToPlain } from "../utils.js";

const TIMESTAMP_REGEX = /^([\d.]+)\s+([\d.]+)/;

// Kiểm tra ký tự CJK mở rộng
function isCJK(char) {
    if (!char) return false;
    return /[\u2000-\u206f\u3000-\u303f\uff00-\uffef\u4e00-\u9fa5\uac00-\ud7af]/.test(char);
}

// Hàm làm sạch dành riêng cho nội dung gõ (Typing Engine)
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
        charStarts:[],
        rawLength: 0,
        language: "en" // Mặc định là Tiếng Anh
    };

    let blocks =[];
    let isDictation = lines.some(line => TIMESTAMP_REGEX.test(line.trim()));

    // Xác định ngôn ngữ dựa vào nội dung file
    const isChineseDoc = /[\u4e00-\u9fa5]/.test(rawContent);
    const isKoreanDoc = /[\uAC00-\uD7AF]/.test(rawContent); 

    if (isChineseDoc) {
        result.language = "zh";
    } else if (isKoreanDoc) {
        result.language = "ko";
    }

    let openDouble = true; // Trạng thái đóng/mở nháy kép chạy xuyên suốt toàn bài

    // Hàm xử lý Text & Đồng bộ Dấu nháy hiển thị
    const cleanLine = (text) => {
        if (!text) return "";
        let s = text
            .replace(/&nbsp;/gi, " ")
            .replace(/\u00A0/g, " ")
            .replace(/[—–]/g, "-")
            .replace(/ …/g, "...")
            .replace(/…/g, "...");

        // Xử lý nắn dấu tự động theo ngôn ngữ
        if (isChineseDoc) {
            // Tiếng Trung: Thay nháy thẳng (") thành nháy cong (“ ”)
            s = s.replace(/"/g, () => {
                let repl = openDouble ? '“' : '”';
                openDouble = !openDouble;
                return repl;
            });
        } else {
            // Tiếng Anh: Thay nháy cong/đặc biệt về nháy thẳng chuẩn (")
            s = s.replace(/[“”「」『』«»]/g, '"');
            s = s.replace(/[‘’]/g, "'");
        }

        return s.replace(/\u200B/g, "");
    };

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) {
            if (blocks.length > 0 && blocks[blocks.length - 1].type !== 'break') {
                blocks.push({ type: 'break' });
            }
            return;
        }

        if (trimmed.startsWith("# ")) {
            result.title = cleanLine(trimmed.replace("#", "").trim());
            return;
        }

        if (trimmed.startsWith("##")) {
            blocks.push({ type: 'header', content: cleanLine(trimmed.replace(/^#+\s*/, "")) });
        } else if (isDictation && TIMESTAMP_REGEX.test(trimmed)) {
            // Truyền hàm cleanLine xuống cho phần tử audio
            blocks.push(parseDictationLine(trimmed, cleanLine));
        } else {
            blocks.push({ type: 'paragraph', content: cleanLine(trimmed) });
        }
    });

    assembleData(blocks, result);

    if (result.text) {
        result.text = result.text.trimEnd();
    }

    return result;
}

function parseDictationLine(line, cleanFunc) {
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
    return { type: 'audio', start, end, speaker: cleanFunc(speaker), content: cleanFunc(textRaw) };
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