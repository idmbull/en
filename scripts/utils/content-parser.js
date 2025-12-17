// scripts/utils/content-parser.js

import { convertMarkdownToPlain, convertInlineFootnotes } from "../utils.js";

function cleanText(text) {
    return text
        .replace(/&nbsp;/gi, " ")
        .replace(/\u00A0/g, " ")
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, "\"")
        .replace(/[—–]/g, "-")
        .replace(/ …/g, "...")
        .replace(/\u200B/g, "");
}

function stripMarkup(raw) {
    return raw ? raw.replace(/\^\[[^\]]*]/g, "").replace(/\*\*(.+?)\*\*/g, "$1") : "";
}

// --- READING PARSER (Giữ nguyên) ---
export function parseReadingContent(rawContent) {
    const raw = cleanText(rawContent);
    const lines = raw.split(/\r?\n/);

    const sections = {};
    const order = [];

    let mainTitle = "Reading Practice";
    const titleLine = lines.find(l => l.startsWith("# "));
    if (titleLine) mainTitle = stripMarkup(titleLine.replace("#", "").trim());

    const fullContent = lines.filter(l => !l.startsWith("# ")).join("\n").trim();
    sections["Full"] = fullContent;
    order.push("Full");

    let currentTitle = null;
    lines.forEach(line => {
        if (line.startsWith("## ")) {
            currentTitle = stripMarkup(line.replace("##", "").trim());
            sections[currentTitle] = "";
            order.push(currentTitle);
        } else if (currentTitle) {
            sections[currentTitle] += line + "\n";
        }
    });

    return { mainTitle, sections, order };
}

// --- DICTATION PARSER (Cập nhật logic Speaker) ---
export function parseDictationContent(rawContent) {
    const cleanContent = cleanText(rawContent);
    const lines = cleanContent.split(/\r?\n/);

    let mainTitle = null;

    // sections['Full Text'] = { text: "...", html: "...", segments: [], charStarts: [] }
    const sectionsData = {
        "Full Text": { text: "", html: "", segments: [], charStarts: [], rawLength: 0 }
    };
    const order = ["Full Text"];

    let currentSectionName = null;
    let pendingParagraph = false;

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) {
            pendingParagraph = true;
            return;
        }

        // 1. Title
        if (trimmed.startsWith("# ")) {
            mainTitle = stripMarkup(trimmed.replace("#", "").trim());
            return;
        }

        // 2. Section
        if (trimmed.startsWith("## ")) {
            const secName = stripMarkup(trimmed.replace("##", "").trim());
            currentSectionName = secName;

            if (!sectionsData[secName]) {
                sectionsData[secName] = { text: "", html: "", segments: [], charStarts: [], rawLength: 0 };
                order.push(secName);
            }
            pendingParagraph = false;
            return;
        }

        // 3. Parse Segment (Start | End | [Speaker] | Text)
        const parts = trimmed.split("\t");
        let start = 0, end = 0, speaker = null, textRaw = "";

        // Logic check số lượng cột
        if (parts.length >= 4) {
            // Format: Start \t End \t Speaker \t Text
            start = parseFloat(parts[0]);
            end = parseFloat(parts[1]);
            speaker = parts[2].trim();
            textRaw = parts.slice(3).join("\t").trim();
        }
        else if (parts.length === 3) {
            // Format: Start \t End \t Text
            start = parseFloat(parts[0]);
            end = parseFloat(parts[1]);
            textRaw = parts[2].trim();
        }
        else {
            // Fallback regex cũ
            const m = trimmed.match(/^([\d.]+)\s+([\d.]+)\s+(.*)$/);
            if (m) {
                start = parseFloat(m[1]);
                end = parseFloat(m[2]);
                textRaw = m[3].trim();
            } else {
                textRaw = trimmed;
            }
        }

        const htmlContent = convertInlineFootnotes(textRaw);
        const cleanContentText = convertMarkdownToPlain(stripMarkup(textRaw));

        // --- Helper addToSection ---
        const addToSection = (secKey, isParagraphStart) => {
            const data = sectionsData[secKey];
            const isFirst = data.segments.length === 0;
            const logicSep = isFirst ? "" : " ";
            let htmlSep = isFirst ? "" : " ";

            if (!isFirst && isParagraphStart) {
                htmlSep = "\n\n";
            }

            // Xử lý HTML cho Speaker (nếu có)
            let speakerHtml = "";
            if (speaker) {
                // Thêm class 'speaker-label' để CSS và JS nhận diện
                speakerHtml = `<span class="speaker-label" contenteditable="false">${speaker}: </span>`;
            }

            // Mapping vị trí: Chỉ tính text nội dung, bỏ qua logicSep nếu muốn chính xác tuyệt đối
            // Nhưng logic hiện tại cần logicSep để khớp với text logic gõ
            data.charStarts.push(data.rawLength + logicSep.length);

            data.segments.push({
                audioStart: start,
                audioEnd: end,
                text: cleanContentText,
                raw: textRaw,
                speaker: speaker, // Lưu thêm info speaker
                isNewParagraph: isParagraphStart
            });

            // Logic Text: CHỈ chứa nội dung cần gõ (không có tên speaker)
            data.text += logicSep + cleanContentText;

            // Display HTML: Chứa cả tên speaker
            data.html += htmlSep + speakerHtml + htmlContent;

            data.rawLength = data.text.length;
        };

        addToSection("Full Text", pendingParagraph);
        if (currentSectionName) {
            addToSection(currentSectionName, pendingParagraph);
        }

        pendingParagraph = false;
    });

    return {
        mainTitle,
        sections: sectionsData,
        order
    };
}

export function processSectionText(rawSection) {
    const html = convertInlineFootnotes(rawSection);
    const clean = convertMarkdownToPlain(stripMarkup(rawSection));
    return { html, clean };

}
