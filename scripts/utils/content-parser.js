// scripts/utils/content-parser.js
import { convertMarkdownToPlain } from "../utils.js";

const TIMESTAMP_REGEX = /^([\d.]+)\s+([\d.]+)/;

// Hàm làm sạch cơ bản cho metadata
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

// [REFACTOR] Hàm làm sạch dành riêng cho nội dung gõ (Typing Engine)
function cleanForTyping(text) {
    if (!text) return "";

    let s = text;

    // 1. Loại bỏ Footnote: ^[note] trước để tránh xử lý nhầm bên trong
    s = s.replace(/\^\[[^\]]+\]/g, '');

    // 2. Loại bỏ Skipped Text: `content`
    // Thay thế bằng chuỗi rỗng, giữ nguyên khoảng trắng xung quanh nó
    s = s.replace(/`[^`]+`/g, '');

    // 3. Loại bỏ định dạng Markdown
    s = s.replace(/[*_~]+/g, '');

    // 4. Thay thế các ký tự xuống dòng/tab bằng dấu cách
    s = s.replace(/[\r\n\t]+/g, ' ');

    // 5. Gộp nhiều dấu cách liên tiếp thành 1 
    // QUAN TRỌNG: Không dùng trim() ở đây để bảo toàn khoảng trắng dẫn đầu/cuối của fragment
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

    // BƯỚC 1: Phân tách Blocks
    lines.forEach(line => {
        const trimmed = line.trim();
        // Giữ lại dòng trống để tạo paragraph break
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

    // BƯỚC 2: Lắp ráp dữ liệu (Assemble)
    assembleData(blocks, result);

    // BƯỚC 3: Chuẩn hóa lần cuối
    // [FIX QUAN TRỌNG] Chỉ trimEnd(). 
    // Nếu trimStart(), ta sẽ xóa mất khoảng trắng mà người dùng nhìn thấy trên màn hình (do skipped text để lại).
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

    const flushParagraph = () => {
        if (currentParagraphHtml) {
            result.html += `<p>${currentParagraphHtml}</p>`;
            result.html += '<span class="newline-char">↵</span>';
            currentParagraphHtml = "";
        }
    };

    blocks.forEach((block) => {
        if (block.type === 'header' || block.type === 'break') {
            flushParagraph();
            if (block.type === 'header') {
                result.html += `<h3 class="visual-header">${block.content}</h3>`;
            }
            return;
        }

        // Xử lý Text cho Engine
        const cleanFragment = cleanForTyping(block.content);

        // Kiểm tra xem sau khi lọc, block này có còn nội dung gõ không
        // (Lưu ý: " " vẫn tính là có nội dung để nối từ)
        const hasTypingContent = cleanFragment.length > 0 && cleanFragment.trim().length > 0;

        // Trường hợp đặc biệt: Dòng chỉ chứa Skipped Text (ví dụ: `Hidden`)
        // cleanFragment sẽ là "" hoặc " ".
        // Ta cần đảm bảo nó đóng vai trò như một separator (dấu cách) để không dính chữ.
        const isSkippedLine = !hasTypingContent && block.content.trim().length > 0;

        if (hasTypingContent) {
            // Logic nối chuỗi thông minh:
            // Thêm dấu cách nếu text cũ chưa có và text mới không bắt đầu bằng dấu cách
            let prefix = "";
            if (result.text.length > 0) {
                const endsWithSpace = result.text.endsWith(" ");
                const startsWithSpace = cleanFragment.startsWith(" ");

                if (!endsWithSpace && !startsWithSpace) {
                    prefix = " ";
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
        }
        else if (isSkippedLine) {
            // Nếu là dòng Skipped, chỉ thêm dấu cách vào result.text nếu chưa có.
            // Điều này giúp tách dòng trước và dòng sau.
            if (result.text.length > 0 && !result.text.endsWith(" ")) {
                result.text += " ";
            }
        }

        // Xử lý HTML
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