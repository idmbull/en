import { DOM } from "./state.js";
import { Store } from "./core/store.js";
import { loadLibrary, loadUserContent } from "./loader.js";
import { displayText } from "./renderer.js";
import { initController } from "./input-controller.js";
import { ExerciseController } from "./core/exercise-controller.js";
import { SuperAudioPlayer } from "./superAudioPlayer.js";
import { replayLastWord } from "./audio.js";
import { EventBus, EVENTS } from "./core/events.js";
import { setupDragDrop } from "./utils/drag-drop.js";

const superPlayer = new SuperAudioPlayer();
let mainController;

async function setupAudioForContent() {
    const source = Store.getSource();
    const isAudio = Store.isAudio();

    if (isAudio) {
        DOM.volumeControl.classList.remove("hidden");
        DOM.headerSubtitle.textContent = "Nghe kỹ - Gõ chính xác";
        if (source.audioUrl) {
            try {
                const resp = await fetch(source.audioUrl);
                if (resp.ok) await superPlayer.load(await resp.arrayBuffer());
                else superPlayer.clear(); // [FIX] Link lỗi -> Clear
            } catch (e) {
                console.error(e);
                superPlayer.clear(); // [FIX] Lỗi mạng -> Clear
            }
        } else {
            // Trường hợp user upload (đã xử lý ở trên) hoặc lỗi logic
            // Nếu không có URL và buffer chưa được nạp thủ công -> nên clear?
            // (Đoạn này giữ nguyên vì logic user upload đã nạp buffer rồi)
        }
    } else {
        DOM.volumeControl.classList.add("hidden");
        if (DOM.dictationReplayBtn) DOM.dictationReplayBtn.classList.add("hidden");
        DOM.headerSubtitle.textContent = "Tập trung - Thư giãn - Phát triển";

        // [FIX] Bài đọc hiểu (không audio) -> Xóa bộ nhớ audio
        superPlayer.clear();
    }
}

function playNextLesson() {
    const currentActive = document.querySelector('.tree-label.active');
    if (currentActive && currentActive.parentElement) {
        let nextLi = currentActive.parentElement.nextElementSibling;
        // Tìm file tiếp theo (bỏ qua folder nếu cần - logic đơn giản)
        while (nextLi) {
            const label = nextLi.querySelector('.selectable-file');
            if (label) {
                label.click(); // Trigger load bài mới
                return;
            }
            nextLi = nextLi.nextElementSibling;
        }
    }
    alert("Đã hết bài tập trong danh sách này!");
}

function playCurrentSegment() {
    if (!Store.isAudio()) return;
    const s = Store.getSource();
    const seg = s.segments[s.currentSegment];
    if (seg) {
        superPlayer.stop();
        superPlayer.playSegment(seg.audioStart, seg.audioEnd);
    }
}

export async function initApp() {
    initController();

    if (DOM.volumeInput) {
        superPlayer.setVolume(parseFloat(DOM.volumeInput.value));
        DOM.volumeInput.oninput = (e) => superPlayer.setVolume(parseFloat(e.target.value));
    }

    EventBus.on(EVENTS.EXERCISE_COMPLETE, () => {
        // Dừng mọi âm thanh đang phát hoặc sắp phát
        superPlayer.stop();

        // Nếu cần thiết, có thể suspend context để chắc chắn im lặng
        // if (superPlayer.ctx) superPlayer.ctx.suspend();
    });

    EventBus.on(EVENTS.EXERCISE_START, () => {
        // 1. Đánh thức AudioContext (Bắt buộc bởi trình duyệt)
        if (superPlayer.ctx?.state === 'suspended') {
            superPlayer.ctx.resume();
        }

        // 2. Nếu là bài tập Audio -> Phát segment hiện tại
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

    // Đóng modal khi click ra ngoài (tùy chọn)
    DOM.resultModal.onclick = (e) => {
        if (e.target === DOM.resultModal) DOM.resultModal.classList.add("hidden");
    };


    DOM.textDisplay.addEventListener("dblclick", (e) => {
        if (!Store.isAudio() || e.target.tagName !== "SPAN" || e.target.classList.contains("newline-char")) return;

        const charIndex = Store.getState().textSpans.indexOf(e.target);
        if (charIndex === -1) return;

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
    });

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

    if (DOM.dictationReplayBtn) {
        DOM.dictationReplayBtn.onclick = () => playCurrentSegment();
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
                // 1. Load nội dung Text
                await loadUserContent(e.target.result, subFile.name);
                let hasAudio = false;

                // 2. Xử lý Audio
                if (audioFile) {
                    try {
                        await superPlayer.load(await audioFile.arrayBuffer());
                        hasAudio = true;
                    } catch {
                        alert("File audio lỗi.");
                        superPlayer.clear(); // Lỗi thì cũng clear luôn cho an toàn
                    }
                } else {
                    // [FIX] Nếu không có file audio -> Xóa sạch bộ nhớ cũ
                    superPlayer.clear();
                    hasAudio = false;
                }

                // 3. Cập nhật Store
                // Lưu ý: Dù hasAudio = false, nhưng nếu file text có timestamps (segments),
                // Store vẫn có thể coi là AudioMode. Nhưng nhờ superPlayer.buffer = null
                // nên nó sẽ im lặng thay vì phát bài cũ.
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

        // Tạo 2 container chứa file riêng biệt
        const dtSub = new DataTransfer();
        const dtAudio = new DataTransfer();

        let hasSub = false;
        let hasAudio = false;

        files.forEach(f => {
            const name = f.name.toLowerCase();

            // 1. Kiểm tra file nội dung (Text)
            if (/\.(txt|tsv|md)$/.test(name)) {
                dtSub.items.add(f);
                hasSub = true;
            }
            // 2. Kiểm tra file âm thanh (Audio) - [BỔ SUNG PHẦN NÀY]
            else if (/\.(mp3|wav|ogg|m4a)$/.test(name)) {
                dtAudio.items.add(f);
                hasAudio = true;
            }
        });

        // Gán file vào input tương ứng
        if (hasSub) {
            dictationSubInput.files = dtSub.files;
        }

        // [BỔ SUNG] Gán file audio vào input audio
        if (hasAudio) {
            dictationAudioInput.files = dtAudio.files;
        }

        // Kiểm tra điều kiện để bật nút Start
        checkReady();

    }, "Drop files here!");
}

document.addEventListener("DOMContentLoaded", initApp);