import { DOM } from "./state.js";
import { Store } from "./core/store.js";
import { loadLibrary, loadUserContent } from "./loader.js";
import { displayText } from "./renderer.js";
import { initController } from "./input-controller.js";
import { ExerciseController } from "./core/exercise-controller.js";
import { SuperAudioPlayer } from "./superAudioPlayer.js";
import { replayLastWord, enqueueSpeak } from "./audio.js";
import { EventBus, EVENTS } from "./core/events.js";
import { setupDragDrop } from "./utils/drag-drop.js";
import { initVocabUI, saveHighlightedWord, clearVocabList } from "./vocab.js";

const superPlayer = new SuperAudioPlayer();
let mainController;
// [NEW] Biến lưu timer để xử lý phân biệt Click vs Double Click
let clickTimer = null;
let isGlobalPlaying = false;

async function setupAudioForContent() {
    const source = Store.getSource();
    const isAudio = Store.isAudio();

    if (isAudio) {
        DOM.volumeControl.classList.remove("hidden");
        if (DOM.mediaControls) DOM.mediaControls.classList.remove("hidden");
        DOM.headerSubtitle.textContent = "Nghe kỹ - Gõ chính xác";
        if (source.audioUrl) {
            try {
                const resp = await fetch(source.audioUrl);
                if (resp.ok) await superPlayer.load(await resp.arrayBuffer());
                else superPlayer.clear();
            } catch (e) {
                console.error(e);
                superPlayer.clear();
            }
        }
    } else {
        DOM.volumeControl.classList.add("hidden");
        if (DOM.mediaControls) DOM.mediaControls.classList.add("hidden");
        DOM.headerSubtitle.textContent = "Tập trung - Thư giãn - Phát triển";
        superPlayer.clear();
    }
}

function playNextLesson() {
    const currentActive = document.querySelector('.tree-label.active');
    if (currentActive && currentActive.parentElement) {
        let nextLi = currentActive.parentElement.nextElementSibling;
        while (nextLi) {
            const label = nextLi.querySelector('.selectable-file');
            if (label) {
                label.click();
                return;
            }
            nextLi = nextLi.nextElementSibling;
        }
    }
    alert("Đã hết bài tập trong danh sách này!");
}

function playCurrentSegment() {
    // [NEW] Khi phát segment lẻ, phải tắt chế độ Global Play để tránh xung đột
    updatePlayAllIcon(false);

    if (!Store.isAudio()) return;
    const s = Store.getSource();
    const seg = s.segments[s.currentSegment];
    if (seg) {
        superPlayer.stop();
        superPlayer.playSegment(seg.audioStart, seg.audioEnd);
    }
}

function updatePlayAllIcon(isPlaying) {
    isGlobalPlaying = isPlaying;
    if (DOM.dictationPlayAllBtn) {
        DOM.dictationPlayAllBtn.textContent = isPlaying ? "⏸" : "▶";
        // Highlight nút khi đang active
        DOM.dictationPlayAllBtn.style.color = isPlaying ? "var(--correct-color)" : "inherit";
        DOM.dictationPlayAllBtn.style.borderColor = isPlaying ? "var(--correct-color)" : "var(--border-color)";
    }
}

export async function initApp() {
    initController();

    if (DOM.volumeInput) {
        superPlayer.setVolume(parseFloat(DOM.volumeInput.value));
        DOM.volumeInput.oninput = (e) => superPlayer.setVolume(parseFloat(e.target.value));
    }

    EventBus.on(EVENTS.EXERCISE_COMPLETE, () => {
        superPlayer.stop();
        updatePlayAllIcon(false);
    });

    EventBus.on(EVENTS.EXERCISE_START, () => {
        if (superPlayer.ctx?.state === 'suspended') {
            superPlayer.ctx.resume();
        }
        if (Store.isAudio()) {
            playCurrentSegment();
        }
    });

    document.addEventListener("app:content-loaded", async () => {
        const source = Store.getSource();
        displayText(source.html);
        if (DOM.headerTitle) DOM.headerTitle.textContent = source.title || "Reading Practice";
        document.title = source.title ? `Idm - ${source.title}` : "Idm Typing Master";
        await setupAudioForContent();
        mainController.reset();
    });

    let maxReachedSegment = 0;
    EventBus.on(EVENTS.DICTATION_SEGMENT_CHANGE, (newIdx) => {
        if (isGlobalPlaying) return;
        if (Store.isAudio() && newIdx > maxReachedSegment) {
            maxReachedSegment = newIdx;
            const seg = Store.getSource().segments[newIdx];
            if (seg) superPlayer.playSegment(seg.audioStart, seg.audioEnd);
        }
    });

    if (DOM.btnReplay) {
        DOM.btnReplay.onclick = () => {
            DOM.resultModal.classList.add("hidden");
            mainController.reset();
        };
    }

    if (DOM.btnNext) {
        DOM.btnNext.onclick = () => {
            DOM.resultModal.classList.add("hidden");
            playNextLesson();
        };
    }

    DOM.resultModal.onclick = (e) => {
        if (e.target === DOM.resultModal) DOM.resultModal.classList.add("hidden");
    };

    // =========================================================
    // XỬ LÝ CLICK (PHÁT ÂM TỪ) & DOUBLE CLICK (PHÁT SEGMENT)
    // =========================================================

    // 1. Single Click: Phát âm từ vựng (Có độ trễ để chờ Double Click)
    DOM.textDisplay.addEventListener("click", (e) => {
        if (e.target.tagName !== "SPAN" || e.target.classList.contains("newline-char")) return;
        if (window.getSelection().toString().length > 0) return; // Đang bôi đen thì không click

        // Reset timer cũ nếu có (dù ít khi xảy ra)
        if (clickTimer) clearTimeout(clickTimer);

        // Thiết lập Timer chờ 250ms
        clickTimer = setTimeout(() => {
            const charIndex = Store.getState().textSpans.indexOf(e.target);
            if (charIndex === -1) return;

            if (Store.isAudio()) {
                const s = Store.getSource();
                let targetSegIdx = 0;
                for (let i = s.charStarts.length - 1; i >= 0; i--) {
                    if (charIndex >= s.charStarts[i]) {
                        targetSegIdx = i;
                        break;
                    }
                }
                Store.setCurrentSegment(targetSegIdx);
                maxReachedSegment = targetSegIdx;
                playCurrentSegment();
            }
            else {
                // Logic tìm từ và phát âm (TTS/Dictionary)
                const { wordStarts, wordTokens } = Store.getState();
                for (let i = 0; i < wordStarts.length; i++) {
                    const start = wordStarts[i];
                    const end = start + wordTokens[i].length;

                    if (charIndex >= start && charIndex < end) {
                        const word = wordTokens[i];
                        enqueueSpeak(word, true); // Phát âm
                        break;
                    }
                }
            }

            clickTimer = null; // Reset timer sau khi chạy xong
        }, 250); // 250ms là độ trễ tiêu chuẩn cho double click
    });

    // 2. Double Click: Phát Audio Segment (Nếu có)
    DOM.textDisplay.addEventListener("dblclick", (e) => {
        if (e.target.tagName !== "SPAN" || e.target.classList.contains("newline-char")) return;

        // [QUAN TRỌNG] Hủy sự kiện Single Click đang chờ
        if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
        }

        const charIndex = Store.getState().textSpans.indexOf(e.target);
        if (charIndex === -1) return;


        // Logic tìm từ và phát âm (TTS/Dictionary)
        const { wordStarts, wordTokens } = Store.getState();
        for (let i = 0; i < wordStarts.length; i++) {
            const start = wordStarts[i];
            const end = start + wordTokens[i].length;

            if (charIndex >= start && charIndex < end) {
                const word = wordTokens[i];
                enqueueSpeak(word, true); // Phát âm
                break;
            }

        }
    });

    // =========================================================
    // KHỞI TẠO TÍNH NĂNG TỪ VỰNG & BẮT SỰ KIỆN BÔI ĐEN
    // =========================================================
    initVocabUI();

    let selectedWordData = null; // Lưu trữ cả chữ và vị trí index

    DOM.textDisplay.addEventListener("mouseup", (e) => {
        setTimeout(() => {
            const selection = window.getSelection();
            const text = selection.toString().trim();

            if (text.length > 0 && text.length < 50) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();

                // Lấy thẻ <span> bắt đầu của vùng bôi đen
                let startNode = range.startContainer;
                // Nếu browser trả về TextNode (loại 3), ta lấy phần tử cha là thẻ <span>
                if (startNode.nodeType === 3) startNode = startNode.parentElement;

                // Tìm vị trí của thẻ <span> này trong mảng dữ liệu
                const spans = Store.getState().textSpans;
                const startIndex = spans.indexOf(startNode);

                // Lưu tạm dữ liệu chờ bấm nút
                selectedWordData = { word: text, index: startIndex };

                DOM.floatingHighlightBtn.style.top = `${rect.top - 40}px`;
                DOM.floatingHighlightBtn.style.left = `${rect.left + (rect.width / 2) - 45}px`;
                DOM.floatingHighlightBtn.classList.remove("hidden");
            } else {
                DOM.floatingHighlightBtn.classList.add("hidden");
                selectedWordData = null;
            }
        }, 50);
    });

    document.addEventListener("mousedown", (e) => {
        if (e.target !== DOM.floatingHighlightBtn) {
            DOM.floatingHighlightBtn.classList.add("hidden");
        }
    });

    DOM.floatingHighlightBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        // Gọi hàm lưu từ vựng kèm theo vị trí Index
        if (selectedWordData && selectedWordData.index !== -1) {
            saveHighlightedWord(selectedWordData.word, selectedWordData.index);
        }
    });

    // Reset danh sách từ vựng khi load bài tập mới
    document.addEventListener("app:content-loaded", () => {
        clearVocabList();
    });
    // =========================================================

    // =========================================================

    mainController = new ExerciseController("unified", {
        onReset: () => {
            const src = Store.getSource();
            displayText(src.html);
            superPlayer.stop();
            maxReachedSegment = 0;
        },
        onActionStart: () => {
            if (superPlayer.ctx?.state === 'suspended') superPlayer.ctx.resume();
        },
        onCtrlSpaceSingle: () => Store.isAudio() ? playCurrentSegment() : replayLastWord(),
        onCtrlSpaceDouble: () => replayLastWord()
    });

    await loadLibrary();
    setupDictationModal();

    if (DOM.dictationPlayAllBtn) {
        superPlayer.onEnded = () => {
            // Khi hết bài thì reset icon về Play
            updatePlayAllIcon(false);
            // Có thể reset pausedAt về 0 nếu muốn lần sau bấm là nghe lại từ đầu
            superPlayer.pausedAt = 0;
        };

        DOM.dictationPlayAllBtn.onclick = () => {
            if (!Store.isAudio()) return;

            // Kiểm tra trạng thái thực tế từ Player
            if (superPlayer.isPlaying) {
                // Đang Play -> Bấm vào thì Pause
                superPlayer.pause();
                updatePlayAllIcon(false); // Hiện icon Play
            } else {
                // Đang Pause -> Bấm vào thì Resume

                // Logic thông minh: 
                // 1. Nếu chưa phát bao giờ (pausedAt == 0), có thể lấy vị trí con trỏ hiện tại làm mốc
                if (superPlayer.pausedAt === 0) {
                    const s = Store.getSource();
                    if (s.segments && s.segments[s.currentSegment]) {
                        superPlayer.pausedAt = s.segments[s.currentSegment].audioStart;
                    }
                }

                superPlayer.resume();
                updatePlayAllIcon(true); // Hiện icon Pause
            }

            if (DOM.textInput && !DOM.textInput.disabled) DOM.textInput.focus();
        };
    }
}

function setupDictationModal() {
    const {
        dictationModal, dictationBtn, dictationStartBtn, dictationCancelBtn,
        dictationSubInput, dictationAudioInput, dictationBlindMode, blindModeToggle
    } = DOM;

    if (dictationBtn) dictationBtn.onclick = (e) => { e.preventDefault(); dictationModal.classList.remove("hidden"); };
    if (dictationCancelBtn) dictationCancelBtn.onclick = () => dictationModal.classList.add("hidden");

    const checkReady = () => { dictationStartBtn.disabled = !dictationSubInput.files.length; };
    if (dictationSubInput) dictationSubInput.onchange = checkReady;

    if (dictationStartBtn) {
        dictationStartBtn.onclick = async () => {
            const subFile = dictationSubInput.files[0];
            const audioFile = dictationAudioInput.files[0];
            if (!subFile) return;

            const isBlind = dictationBlindMode.checked;
            Store.setBlindMode(isBlind);
            if (blindModeToggle) blindModeToggle.checked = isBlind;

            const reader = new FileReader();
            reader.onload = async (e) => {
                await loadUserContent(e.target.result, subFile.name);
                let hasAudio = false;

                if (audioFile) {
                    try {
                        await superPlayer.load(await audioFile.arrayBuffer());
                        hasAudio = true;
                    } catch {
                        alert("File audio lỗi.");
                        superPlayer.clear();
                    }
                } else {
                    superPlayer.clear();
                    hasAudio = false;
                }

                Store.setSourceUnified(Store.getSource(), hasAudio, null);
                document.dispatchEvent(new CustomEvent("app:content-loaded"));
                dictationBtn.innerHTML = `${hasAudio ? "🎧" : "📄"} ${subFile.name}`;
                dictationModal.classList.add("hidden");
            };
            reader.readAsText(subFile, "utf-8");
        };
    }

    setupDragDrop(dictationBtn, (files) => {
        dictationModal.classList.remove("hidden");
        const dtSub = new DataTransfer();
        const dtAudio = new DataTransfer();
        let hasSub = false;
        let hasAudio = false;

        files.forEach(f => {
            const name = f.name.toLowerCase();
            if (/\.(txt|tsv|md)$/.test(name)) {
                dtSub.items.add(f);
                hasSub = true;
            }
            else if (/\.(mp3|wav|ogg|m4a)$/.test(name)) {
                dtAudio.items.add(f);
                hasAudio = true;
            }
        });

        if (hasSub) dictationSubInput.files = dtSub.files;
        if (hasAudio) dictationAudioInput.files = dtAudio.files;
        checkReady();

    }, "Drop files here!");
}

document.addEventListener("DOMContentLoaded", initApp);