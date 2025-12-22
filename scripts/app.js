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
            } catch (e) {
                alert(`Không tải được file âm thanh: ${source.audioUrl}`);
            }
        }
    } else {
        DOM.volumeControl.classList.add("hidden");
        if (DOM.dictationReplayBtn) DOM.dictationReplayBtn.classList.add("hidden");
        DOM.headerSubtitle.textContent = "Tập trung - Thư giãn - Phát triển";
        superPlayer.stop();
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
            if (Store.isAudio()) playCurrentSegment();
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
                await loadUserContent(e.target.result, subFile.name);
                let hasAudio = false;

                if (audioFile) {
                    try {
                        await superPlayer.load(await audioFile.arrayBuffer());
                        hasAudio = true;
                    } catch {
                        alert("File audio lỗi.");
                    }
                } else {
                    superPlayer.stop();
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
        let hasSub = false;
        files.forEach(f => {
            if (/\.(txt|tsv|md)$/.test(f.name.toLowerCase())) { dtSub.items.add(f); hasSub = true; }
        });
        if (hasSub) {
            dictationSubInput.files = dtSub.files;
            checkReady();
        }
    }, "Drop files here!");
}

document.addEventListener("DOMContentLoaded", initApp);