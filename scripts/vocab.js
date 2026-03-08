import { DOM } from "./state.js";
import { enqueueSpeak } from "./audio.js";
import { Store } from "./core/store.js";
import { getScroller } from "./input-controller.js";

// 1. Quản lý dữ liệu trên RAM (Tự động reset khi F5 trang)
let sessionVocabList = [];

export function clearVocabList() {
    sessionVocabList = [];
    if (DOM.vocabList) DOM.vocabList.innerHTML = "";
}

function saveWordToMemory(word, startIndex) {
    const cleanWord = word.trim();
    if (!cleanWord) return false;

    // Không lưu trùng lặp
    if (sessionVocabList.some(item => item.word.toLowerCase() === cleanWord.toLowerCase())) {
        return false;
    }

    // Lưu thành object chứa cả chữ và vị trí (index)
    sessionVocabList.unshift({ word: cleanWord, index: startIndex });
    return true;
}

function removeWord(word) {
    sessionVocabList = sessionVocabList.filter(item => item.word !== word);
    renderVocabList();
}

// 2. Nhảy đến vị trí từ vựng
function jumpToWord(startIndex, wordLength) {
    // Đóng Modal
    DOM.vocabModal.classList.add("hidden");

    const spans = Store.getState().textSpans;
    if (startIndex >= 0 && startIndex < spans.length) {
        const targetSpan = spans[startIndex];

        // Dùng Scroller có sẵn của app để cuộn mượt đến dòng đó
        const scroller = getScroller();
        if (scroller) {
            scroller.scrollTo(targetSpan);
        } else {
            targetSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // Tạo hiệu ứng nhấp nháy (highlight) cho toàn bộ các chữ cái của từ đó
        for (let i = 0; i < wordLength; i++) {
            const currentSpan = spans[startIndex + i];
            if (currentSpan) {
                currentSpan.classList.add('vocab-flash');
                // Xóa hiệu ứng sau 2 giây
                setTimeout(() => currentSpan.classList.remove('vocab-flash'), 2000);
            }
        }
    }
}

// 3. Xử lý UI
export function saveHighlightedWord(word, startIndex) {
    const success = saveWordToMemory(word, startIndex);
    if (success) {
        DOM.floatingHighlightBtn.textContent = "✔️ Đã lưu";
        setTimeout(() => {
            DOM.floatingHighlightBtn.textContent = "✨ Lưu từ";
            DOM.floatingHighlightBtn.classList.add("hidden");
            window.getSelection().removeAllRanges();
        }, 1000);
    } else {
        DOM.floatingHighlightBtn.textContent = "Đã có trong list!";
        setTimeout(() => {
            DOM.floatingHighlightBtn.textContent = "✨ Lưu từ";
            DOM.floatingHighlightBtn.classList.add("hidden");
        }, 1000);
    }
}

export function renderVocabList() {
    DOM.vocabList.innerHTML = "";

    if (sessionVocabList.length === 0) {
        DOM.vocabList.innerHTML = `<li class="vocab-empty">Chưa có từ vựng nào được lưu trong bài này.</li>`;
        return;
    }

    sessionVocabList.forEach(item => {
        const li = document.createElement("li");
        li.className = "vocab-item";

        // Chữ từ vựng (Có thể click để nhảy)
        const wordSpan = document.createElement("span");
        wordSpan.className = "vocab-word jump-link";
        wordSpan.title = "Đến vị trí trong đoạn văn";
        wordSpan.textContent = item.word;
        // Bắt sự kiện click
        wordSpan.onclick = () => jumpToWord(item.index, item.word.length);

        const actionDiv = document.createElement("div");
        actionDiv.className = "vocab-actions";

        const speakBtn = document.createElement("button");
        speakBtn.textContent = "🔊";
        speakBtn.title = "Phát âm";
        speakBtn.onclick = () => enqueueSpeak(item.word, true);

        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "🗑️";
        deleteBtn.title = "Xóa từ này";
        deleteBtn.onclick = () => removeWord(item.word);

        actionDiv.appendChild(speakBtn);
        actionDiv.appendChild(deleteBtn);

        li.appendChild(wordSpan);
        li.appendChild(actionDiv);
        DOM.vocabList.appendChild(li);
    });
}

export function exportVocab() {
    if (sessionVocabList.length === 0) {
        alert("Danh sách trống!");
        return;
    }
    const textData = sessionVocabList.map(i => i.word).join("\n");
    const blob = new Blob([textData], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Tu_vung_IDM.txt";
    a.click();
    URL.revokeObjectURL(url);
}

export function initVocabUI() {
    if (DOM.vocabBtn) {
        DOM.vocabBtn.onclick = () => {
            renderVocabList();
            DOM.vocabModal.classList.remove("hidden");
        };
    }
    if (DOM.vocabCloseBtn) DOM.vocabCloseBtn.onclick = () => DOM.vocabModal.classList.add("hidden");
    if (DOM.vocabExportBtn) DOM.vocabExportBtn.onclick = exportVocab;
}