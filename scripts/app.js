// scripts/app.js
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
import { setTheme } from "./theme.js"; // <--- Import setTheme

const superPlayer = new SuperAudioPlayer();
let mainController;
// Biến lưu timer để xử lý phân biệt Click vs Double Click
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
        DOM.dictationPlayAllBtn.style.color = isPlaying ? "var(--correct-color)" : "inherit";
        DOM.dictationPlayAllBtn.style.borderColor = isPlaying ? "var(--correct-color)" : "var(--border-color)";
    }
}

// =========================================================
// HÀM TỰ ĐỘNG ẨN CON TRỎ CHUỘT
// =========================================================
function initCursorHider() {
    let cursorTimer = null;

    const showCursor = () => {
        document.body.classList.remove('hide-cursor');

        if (cursorTimer) {
            clearTimeout(cursorTimer);
        }

        cursorTimer = setTimeout(() => {
            document.body.classList.add('hide-cursor');
        }, 2500);
    };

    document.addEventListener('mousemove', showCursor);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') return;

        document.body.classList.add('hide-cursor');
        if (cursorTimer) {
            clearTimeout(cursorTimer);
        }
    });
}

export async function initApp() {
    initController();
    initCursorHider();

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

        // --- [MỚI] Tự động đổi giao diện theo ngôn ngữ ---
        if (source.language === "zh") {
            setTheme("mandarin");
        } else if (source.language === "ko") {
            setTheme("korean");
        } else {
            setTheme("idm"); // Tiếng Anh
        }

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

    DOM.textDisplay.addEventListener("click", (e) => {
        if (e.target.tagName !== "SPAN" || e.target.classList.contains("newline-char")) return;
        if (window.getSelection().toString().length > 0) return;

        if (clickTimer) clearTimeout(clickTimer);

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
                const { wordStarts, wordTokens } = Store.getState();
                for (let i = 0; i < wordStarts.length; i++) {
                    const start = wordStarts[i];
                    const end = start + wordTokens[i].length;

                    if (charIndex >= start && charIndex < end) {
                        const word = wordTokens[i];
                        enqueueSpeak(word, true);
                        break;
                    }
                }
            }

            clickTimer = null;
        }, 250);
    });

    DOM.textDisplay.addEventListener("dblclick", (e) => {
        if (e.target.tagName !== "SPAN" || e.target.classList.contains("newline-char")) return;

        if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
        }

        const charIndex = Store.getState().textSpans.indexOf(e.target);
        if (charIndex === -1) return;

        const { wordStarts, wordTokens } = Store.getState();
        for (let i = 0; i < wordStarts.length; i++) {
            const start = wordStarts[i];
            const end = start + wordTokens[i].length;

            if (charIndex >= start && charIndex < end) {
                const word = wordTokens[i];
                enqueueSpeak(word, true);
                break;
            }
        }
    });

    // =========================================================
    // KHỞI TẠO TÍNH NĂNG TỪ VỰNG, CHIA SẺ & EDIT
    // =========================================================
    initVocabUI();

    if (DOM.editBtn) {
        DOM.editBtn.onclick = () => {
            const path = Store.getCurrentLessonPath();
            if (!path) {
                alert("Bạn chỉ có thể chỉnh sửa các bài tập có sẵn từ thư viện.");
                return;
            }
            const githubUrl = `https://github.com/idmbull/en/edit/main/library/${encodeURI(path)}`;
            window.open(githubUrl, '_blank');
        };
    }

    if (DOM.shareBtn) {
        DOM.shareBtn.onclick = async () => {
            const path = Store.getCurrentLessonPath();
            if (!path) {
                alert("Bạn chỉ có thể chia sẻ các bài tập được chọn từ thư viện có sẵn.");
                return;
            }
            try {
                await navigator.clipboard.writeText(window.location.href);
                const originalText = DOM.shareBtn.innerHTML;

                // Đổi thành icon tích thay vì text dài để giữ nút luôn tròn
                DOM.shareBtn.innerHTML = "✔️";
                DOM.shareBtn.style.color = "var(--correct-color)";
                DOM.shareBtn.style.borderColor = "var(--correct-color)";

                setTimeout(() => {
                    DOM.shareBtn.innerHTML = originalText;
                    DOM.shareBtn.style.color = "";
                    DOM.shareBtn.style.borderColor = "";
                }, 2000);
            } catch (err) {
                alert("Không thể copy link, trình duyệt từ chối quyền truy cập clipboard.");
            }
        };
    }

    let selectedWordData = null;

    DOM.textDisplay.addEventListener("mouseup", (e) => {
        setTimeout(() => {
            const selection = window.getSelection();
            const text = selection.toString().trim();

            if (text.length > 0 && text.length < 50) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();

                let startNode = range.startContainer;
                if (startNode.nodeType === 3) startNode = startNode.parentElement;

                const spans = Store.getState().textSpans;
                const startIndex = spans.indexOf(startNode);

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
        if (selectedWordData && selectedWordData.index !== -1) {
            saveHighlightedWord(selectedWordData.word, selectedWordData.index);
        }
    });

    document.addEventListener("app:content-loaded", () => {
        clearVocabList();
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

    if (DOM.dictationPlayAllBtn) {
        superPlayer.onEnded = () => {
            updatePlayAllIcon(false);
            superPlayer.pausedAt = 0;
        };

        DOM.dictationPlayAllBtn.onclick = () => {
            if (!Store.isAudio()) return;

            if (superPlayer.isPlaying) {
                superPlayer.pause();
                updatePlayAllIcon(false);
            } else {
                if (superPlayer.pausedAt === 0) {
                    const s = Store.getSource();
                    if (s.segments && s.segments[s.currentSegment]) {
                        superPlayer.pausedAt = s.segments[s.currentSegment].audioStart;
                    }
                }

                superPlayer.resume();
                updatePlayAllIcon(true);
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

                Store.setSourceUnified(Store.getSource(), hasAudio, null, null);
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