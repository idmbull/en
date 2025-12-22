export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => Array.from(document.querySelectorAll(sel));

export function wrapChars(text, className = "", dataNote = "") {
    const frag = document.createDocumentFragment();
    for (const ch of text) {
        if (ch === '\n') {
            const s = document.createElement('span');
            s.textContent = "↵";
            s.className = "newline-char";
            if (className) s.classList.add(className);
            frag.appendChild(s);
            const br = document.createElement('br');
            br.className = "visual-break";
            frag.appendChild(br);
        } else {
            const s = document.createElement('span');
            s.textContent = ch;
            if (className) s.classList.add(className);
            if (dataNote) s.dataset.note = dataNote;
            frag.appendChild(s);
        }
    }
    return frag;
}

export function convertMarkdownToPlain(md) {
    return md.replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/_(.*?)_/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/~~(.*?)~~/g, '$1')
        .replace(/#+\s*/g, '')
        .replace(/>\s*/g, '')
        .replace(/\r?\n/g, ' ')
        .replace(/\s+/g, ' ').trim();
}

function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function convertInlineFootnotes(md) {
    if (!md) return "";
    return md.replace(/\[([^\]]+)\]\^\[([^\]]+)\]/g, (match, target, note) => {
        return `<span class="tooltip-word" data-note="${note}">${target}</span>`;
    });
}