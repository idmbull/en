// /scripts/utils.js
export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => Array.from(document.querySelectorAll(sel));

export function safeCall(fn) {
    try { return fn(); } catch (e) { }
}

export function noop() { }

export function setClasses(el, add = [], remove = []) {
    if (!el) return;
    remove.forEach(c => el.classList.remove(c));
    add.forEach(c => el.classList.add(c));
}

// Tạo fragment gồm nhiều <span>
export function wrapChars(text, className = "", dataNote = "") {
    const frag = document.createDocumentFragment();
    const chars = Array.from(text);

    for (const ch of chars) {
        if (ch === '\n') {
            // --- XỬ LÝ KÝ TỰ ENTER ---
            
            // 1. Tạo Span đại diện cho logic gõ (Con trỏ)
            const s = document.createElement('span');
            s.textContent = "↵"; // Hiển thị biểu tượng
            s.className = "newline-char";
            
            if (className) s.classList.add(className);
            
            frag.appendChild(s);

            // 2. Tạo thẻ BR để xuống dòng hiển thị
            // Thay vì dùng \n (text node), ta dùng <br> để trình duyệt hiểu rõ:
            // "Hết chữ ↵ này là xuống dòng ngay lập tức"
            const br = document.createElement('br');
            // Thêm class để tránh bị CSS global ảnh hưởng (nếu có)
            br.className = "visual-break"; 
            frag.appendChild(br);

        } else {
            // --- KÝ TỰ THƯỜNG ---
            const s = document.createElement('span');
            s.textContent = ch;
            if (className) s.classList.add(className);
            if (dataNote) s.dataset.note = dataNote;
            frag.appendChild(s);
        }
    }
    return frag;
}

// Kiểm tra span có nằm ngoài vùng nhìn thấy không
export function isOutOfView(top, height, container, buffer) {
    return top < container.scrollTop + buffer ||
        top + height > container.scrollTop + container.clientHeight - buffer;
}

// Trả về text trong markdown nhưng loại bỏ markup
export function convertMarkdownToPlain(md) {
    return md
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/_(.*?)_/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/~~(.*?)~~/g, '$1')
        .replace(/#+\s*/g, '')
        .replace(/>\s*/g, '')
        .replace(/\r?\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Inline footnotes → <span data-note="">
export function convertInlineFootnotes(md) {
    let out = "";
    let i = 0;
    const L = md.length;

    while (i < L) {
        const footIndex = md.indexOf("^[", i);
        if (footIndex === -1) {
            out += md.slice(i);
            break;
        }

        // append text before footnote
        out += md.slice(i, footIndex);

        // find end of footnote
        const noteEnd = md.indexOf("]", footIndex + 2);
        if (noteEnd === -1) {
            // malformed - no closing ]
            out += md.slice(footIndex);
            break;
        }
        const note = md.slice(footIndex + 2, noteEnd).trim();

        // look backwards in the ORIGINAL md to decide anchor
        // j points to the character just before the '^' char
        let j = footIndex - 1;

        // skip any spaces/newlines BETWEEN anchor and ^[
        while (j >= 0 && /\s/.test(md[j])) j--;

        if (j < 0) {
            // nothing before footnote: just ignore and append raw
            out += md.slice(footIndex, noteEnd + 1);
            i = noteEnd + 1;
            continue;
        }

        // ---------- CASE 1: PHRASE if immediate preceding chars are "**" close ----------
        // Check whether there is a closing '**' ending at j (i.e. md[j-1] + md[j] === '**')
        const hasClosingBold = (j >= 1 && md[j - 1] === "*" && md[j] === "*");
        if (hasClosingBold) {
            // find the opening '**' before that closing '**'
            const closePos = j - 1; // index of first '*' of closing pair
            const openPos = md.lastIndexOf("**", closePos - 1);
            if (openPos !== -1) {
                // take the full markdown bold chunk from openPos to closePos+2
                const boldMarkdown = md.slice(openPos, closePos + 2); // includes **...**
                // remove that chunk from out's tail (we appended up to footIndex earlier)
                // But careful: out currently contains md.slice(i_before, footIndex) where footIndex was after the bold.
                // We must remove the part of out that corresponds to md[openPos .. footIndex-1]
                // Find how many chars of that chunk are at the end of `out`
                const chunkLen = footIndex - openPos; // number of chars between openPos and '^'
                // Remove last chunkLen characters from out (they are the bold markdown)
                out = out.slice(0, -chunkLen);
                // now append the protected tooltip-wrapped bold (keep original **..**)
                out += `<span class="tooltip-word type-phrase" data-note="${escapeHtml(note)}">${escapeHtml(boldMarkdown)}</span>`;
                i = noteEnd + 1;
                continue;
            }
            // if we couldn't find opening '**', fall through to other cases
        }

        // ---------- CASE 2: SENTENCE if the character at j is punctuation ----------
        // ---------- CASE 2: SENTENCE ----------
        let jj = j;

        // lùi qua quote/bracket trước ^[
        while (jj >= 0 && `)"'”’\u201D\u2019\]\}]`.includes(md[jj])) {
            jj--;
        }

        // nếu ký tự còn lại là dấu câu → sentence
        if (jj >= 0 && /[.!?;]/.test(md[jj])) {

            // lấy toàn bộ từ dấu câu đến ngay trước ^[
            const punctStart = jj;

            // ký tự đóng nằm giữa punctuation → ^[
            const punctChunk = md.slice(punctStart, footIndex);

            // xóa khỏi out phần tương ứng
            out = out.slice(0, -(footIndex - punctStart));

            // thêm tooltip
            out += `<span class="tooltip-word type-sentence" data-note="${escapeHtml(note)}">${escapeHtml(punctChunk)}</span>`;

            i = noteEnd + 1;
            continue;
        }

        // ---------- CASE 3: WORD (default) ----------
        // scan backwards to first whitespace (or start of string)
        // ---------- CASE 3: WORD ----------
        else {
            let k = j;

            // CHỈ lùi qua ký tự thuộc từ: chữ, số, dấu nháy
            while (
                k >= 0 &&
                /[A-Za-zÀ-ỹ0-9'’]/.test(md[k])
            ) {
                k--;
            }

            // từ là phần từ k+1 đến j
            const wordStart = k + 1;
            const word = md.slice(wordStart, j + 1);

            // xóa phần từ gốc đã append trước đó
            out = out.slice(0, -(footIndex - wordStart));

            // thêm tooltip
            out += `<span class="tooltip-word type-word" data-note="${escapeHtml(note)}">${escapeHtml(word)}</span>`;

            i = noteEnd + 1;
            continue;
        }

    }

    return out;
}

// small helper to avoid injecting raw brackets/quotes into attribute/content
function escapeHtml(s) {
    return s.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Thử nhiều nguồn phát âm (Oxford, Cambridge, Sheet…)
export async function trySources(items, tryFn) {
    for (const it of items) {
        try {
            const ok = await tryFn(it);
            if (ok) return true;
        } catch (e) { }
    }
    return false;
}