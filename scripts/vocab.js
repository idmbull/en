import { DOM } from "./state.js";
import { enqueueSpeak } from "./audio.js";
import { Store } from "./core/store.js";
import { getScroller } from "./input-controller.js";

// 1. Quản lý dữ liệu trên RAM (Tự động reset khi F5 trang)
let sessionVocabList =[];

export function clearVocabList() {
    sessionVocabList =[];
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
                setTimeout(() => currentSpan.classList.remove('vocab-flash'), 2000);
            }
        }
    }

    // [FIX] Tự động Focus lại ô nhập liệu sau khi nhảy đến từ để gõ tiếp
    setTimeout(() => {
        if (DOM.textInput && !DOM.textInput.disabled) {
            DOM.textInput.focus();
        }
    }, 0);
}

// 3. Xử lý UI
export function saveHighlightedWord(word, startIndex) {
    const success = saveWordToMemory(word, startIndex);

    // [FIX] Ngay lập tức xóa bôi đen và trả lại Focus để bạn có thể gõ chữ liền mà không cần đợi 1 giây
    window.getSelection().removeAllRanges();
    setTimeout(() => {
        if (DOM.textInput && !DOM.textInput.disabled) {
            DOM.textInput.focus();
        }
    }, 0);

    if (success) {
        DOM.floatingHighlightBtn.textContent = "✔️ Đã lưu";
        setTimeout(() => {
            DOM.floatingHighlightBtn.textContent = "✨ Lưu từ";
            DOM.floatingHighlightBtn.classList.add("hidden");
        }, 1000); // Popup chữ vẫn hiện 1s rồi mới tắt
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

    const source = Store.getSource();
    const hasAudio = Store.isAudio();
    const charStarts = source.charStarts || [];
    const segments = source.segments ||[];

    let textData = "";

    // Sắp xếp danh sách từ vựng theo thứ tự xuất hiện trong bài đọc
    const sortedList = [...sessionVocabList].sort((a, b) => a.index - b.index);

    sortedList.forEach(item => {
        let startTime = "";
        let endTime = "";

        if (hasAudio && segments.length > 0) {
            let segIdx = 0;
            // Tìm đoạn segment mà từ vựng thuộc về
            for (let i = charStarts.length - 1; i >= 0; i--) {
                if (item.index >= charStarts[i]) {
                    segIdx = i;
                    break;
                }
            }
            const seg = segments[segIdx];
            if (seg) {
                // Ép định dạng 6 số thập phân
                startTime = parseFloat(seg.audioStart).toFixed(6) + "\t";
                endTime = parseFloat(seg.audioEnd).toFixed(6) + "\t";
            }
        }

        textData += `${startTime}${endTime}${item.word}\n`;
    });

    // --- TẠO FILE TXT ---
    const blob = new Blob([textData], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = source.title ? `Tu_vung_${source.title}.txt` : "Tu_vung_IDM.txt";
    a.click();
    URL.revokeObjectURL(url);

    // --- TẢI THÊM AUDIO FILE (NẾU CÓ) ---
    if (hasAudio && source.audioUrl) {
        const originalBtnText = DOM.vocabExportBtn.textContent;
        DOM.vocabExportBtn.textContent = "⏳ Đang tải Audio...";
        DOM.vocabExportBtn.disabled = true;

        fetch(source.audioUrl)
            .then(res => res.blob())
            .then(audioBlob => {
                const audioBlobUrl = URL.createObjectURL(audioBlob);
                const audioA = document.createElement("a");
                audioA.href = audioBlobUrl;
                
                // Trích xuất đuôi file từ url (.mp3, .wav, ...)
                const extMatch = source.audioUrl.match(/\.[a-zA-Z0-9]+$/);
                const ext = extMatch ? extMatch[0] : ".mp3";
                
                audioA.download = source.title ? `${source.title}${ext}` : `audio${ext}`;
                audioA.click();
                URL.revokeObjectURL(audioBlobUrl);
            })
            .catch(err => {
                console.error("Lỗi khi tải file audio:", err);
                // Fallback nếu có lỗi CORS, mở tab mới cho browser xử lý
                window.open(source.audioUrl, '_blank');
            })
            .finally(() => {
                DOM.vocabExportBtn.textContent = originalBtnText;
                DOM.vocabExportBtn.disabled = false;
            });
    }
}

export function initVocabUI() {
    if (DOM.vocabBtn) {
        DOM.vocabBtn.onclick = () => {
            renderVocabList();
            DOM.vocabModal.classList.remove("hidden");
        };
    }

    // Hàm đóng Modal gộp chung Focus
    const closeModalAndFocus = () => {
        DOM.vocabModal.classList.add("hidden");
        setTimeout(() => {
            if (DOM.textInput && !DOM.textInput.disabled) {
                DOM.textInput.focus();
            }
        }, 0);
    };

    if (DOM.vocabCloseBtn) {
        DOM.vocabCloseBtn.onclick = closeModalAndFocus;
    }

    if (DOM.vocabExportBtn) {
        DOM.vocabExportBtn.onclick = exportVocab;
    }

    // Đóng khi bấm ra ngoài vùng xám của Modal
    if (DOM.vocabModal) {
        DOM.vocabModal.addEventListener('click', (e) => {
            if (e.target === DOM.vocabModal) {
                closeModalAndFocus();
            }
        });
    }
}