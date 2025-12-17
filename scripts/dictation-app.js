// scripts/dictation-app.js
import { DOM } from "./state.js";
import { Store } from "./core/store.js";
import { SuperAudioPlayer } from "./superAudioPlayer.js";
import { loadPlaylist, loadContent, loadSection, loadUserContent } from "./loader.js";
import { initController } from "./input-controller.js";
import { ExerciseController } from "./core/exercise-controller.js";
import { setupDragDrop } from "./utils/drag-drop.js";
import { replayLastWord } from "./audio.js";
import { EventBus, EVENTS } from "./core/events.js";
import { displayText } from "./renderer.js";

const superPlayer = new SuperAudioPlayer();
let controller;
let maxReachedSegment = 0;

function resetDictState() {
    Store.setCurrentSegment(0);
    displayText(Store.getSource().html);
    superPlayer.stop();
    maxReachedSegment = 0;
}

function playCurrentSegment() {
    const source = Store.getSource();
    const idx = source.currentSegment;
    const seg = source.segments[idx];
    if (seg) {
        superPlayer.stop();
        superPlayer.playSegment(seg.audioStart, seg.audioEnd);
    }
}

// [MỚI] Hàm tìm Segment dựa trên vị trí ký tự click
function findSegmentIndexByCharIndex(charIndex, charStarts) {
    if (!charStarts || charStarts.length === 0) return 0;

    // Tìm start index lớn nhất mà vẫn nhỏ hơn hoặc bằng charIndex
    let found = 0;
    for (let i = 0; i < charStarts.length; i++) {
        if (charIndex >= charStarts[i]) {
            found = i;
        } else {
            // Vì mảng đã sắp xếp, gặp số lớn hơn là dừng ngay
            break;
        }
    }
    return found;
}

export async function initDictationMode() {
    initController();

    // Setup Volume
    if (DOM.volumeInput) {
        superPlayer.setVolume(parseFloat(DOM.volumeInput.value));
        DOM.volumeInput.oninput = (e) => superPlayer.setVolume(parseFloat(e.target.value));
    }

    // --- [MỚI] SỰ KIỆN DOUBLE CLICK VÀO TỪ ---
    if (DOM.textDisplay) {
        DOM.textDisplay.addEventListener("dblclick", (e) => {
            // 1. Kiểm tra xem có click vào ký tự không
            if (e.target.tagName !== "SPAN" || e.target.classList.contains("newline-char")) return;

            // 2. Tìm index của span đó trong mảng textSpans của Store
            const spans = Store.getState().textSpans;
            const charIndex = spans.indexOf(e.target);

            if (charIndex === -1) return;

            // 3. Tìm Segment chứa ký tự này
            const source = Store.getSource();
            const segIdx = findSegmentIndexByCharIndex(charIndex, source.charStarts);
            const seg = source.segments[segIdx];

            // 4. Phát audio đoạn đó (nếu có)
            if (seg) {
                console.log(`Replaying segment ${segIdx}: "${seg.text}"`);
                superPlayer.stop();
                superPlayer.playSegment(seg.audioStart, seg.audioEnd);
            }
        });
    }
    // ------------------------------------------

    // Logic: Chỉ phát khi tiến tới câu mới
    EventBus.on(EVENTS.DICTATION_SEGMENT_CHANGE, (newIndex) => {
        if (newIndex > maxReachedSegment) {
            maxReachedSegment = newIndex;
            playCurrentSegment();
        }
    });

    // Load initial data
    await loadPlaylist("dictation");
    if (DOM.playlistSelect.value) {
        await loadContent(DOM.playlistSelect.value, "dictation");
        const audioUrl = Store.getSource().audioUrl;
        if (audioUrl) {
            try {
                const buf = await (await fetch(audioUrl)).arrayBuffer();
                await superPlayer.load(buf);
            } catch (e) { console.warn("Init audio failed", e); }
        }
    }

    setupLocalFileUpload();

    controller = new ExerciseController("dictation", {
        onReset: resetDictState,

        onLoadContent: async (filename) => {
            await loadContent(filename, "dictation");
            const audioUrl = Store.getSource().audioUrl;
            if (audioUrl) {
                try {
                    const buf = await (await fetch(audioUrl)).arrayBuffer();
                    await superPlayer.load(buf);
                } catch (e) { console.warn(e); }
            }
        },

        onSectionChange: (val) => {
            loadSection(val);
            Store.setCurrentSegment(0);
            maxReachedSegment = 0;
        },

        onActionStart: () => {
            const current = Store.getSource().currentSegment;
            maxReachedSegment = current;
            playCurrentSegment();
        },

        // --- Shortcuts ---
        onCtrlSpaceSingle: () => playCurrentSegment(),
        onCtrlSpaceDouble: () => replayLastWord()
    });
    window.currentController = controller;
    controller.reset();

    if (DOM.dictationReplayBtn) {
        DOM.dictationReplayBtn.onclick = () => playCurrentSegment();
    }
}

function setupLocalFileUpload() {
    const {
        dictationBtn, dictationModal, dictationStartBtn, dictationCancelBtn,
        dictationSubInput, dictationAudioInput, dictationBlindMode, blindModeToggle
    } = DOM;

    dictationBtn.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        dictationModal.classList.remove("hidden");
    };
    dictationCancelBtn.onclick = () => dictationModal.classList.add("hidden");

    const checkReady = () => {
        dictationStartBtn.disabled = !dictationSubInput.files.length || !dictationAudioInput.files.length;
    };
    dictationSubInput.onchange = checkReady;
    dictationAudioInput.onchange = checkReady;

    setupDragDrop(dictationBtn, (files) => {
        dictationModal.classList.remove("hidden");
        const dtSub = new DataTransfer();
        const dtAudio = new DataTransfer();
        let hasSub = false, hasAudio = false;

        files.forEach(f => {
            const n = f.name.toLowerCase();
            if (/\.(txt|tsv)$/.test(n)) {
                dtSub.items.add(f); hasSub = true;
            } else if (/\.(mp3|wav|ogg)$/.test(n)) {
                dtAudio.items.add(f); hasAudio = true;
            }
        });

        if (hasSub) dictationSubInput.files = dtSub.files;
        if (hasAudio) dictationAudioInput.files = dtAudio.files;
        checkReady();
    }, "Drop Text & Audio!");

    dictationStartBtn.onclick = async () => {
        const subFile = dictationSubInput.files[0];
        const audioFile = dictationAudioInput.files[0];
        if (!subFile || !audioFile) return;

        const isBlind = dictationBlindMode.checked;
        Store.setBlindMode(isBlind);
        if (blindModeToggle) blindModeToggle.checked = isBlind;

        const reader = new FileReader();
        reader.onload = async (e) => {
            await loadUserContent(e.target.result, subFile.name, "dictation");
            const audioBuf = await audioFile.arrayBuffer();
            await superPlayer.load(audioBuf);

            Store.setSource({ ...Store.getSource(), hasAudio: true, audioUrl: null });

            dictationBtn.textContent = subFile.name;
            dictationModal.classList.add("hidden");
            controller.reset();
        };
        reader.readAsText(subFile, "utf-8");
    };
}