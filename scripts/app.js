// scripts/app.js
import { DOM } from "./state.js";
import { initTheme } from "./theme.js";
import { Store } from "./core/store.js";
import { loadPlaylist, loadContent, loadSection, loadUserContent } from "./loader.js";
import { displayText } from "./renderer.js";
import { initController } from "./input-controller.js";
import { ExerciseController } from "./core/exercise-controller.js";
import { setupDragDrop } from "./utils/drag-drop.js";
import { replayLastWord } from "./audio.js"; // Import từ audio mới

let controller;

function handleReadingReset() {
    displayText(Store.getSource().html);
    DOM.textInput.disabled = true;
}

export async function initReadingMode() {
    await loadPlaylist("reading");
    if (DOM.playlistSelect.value) {
        await loadContent(DOM.playlistSelect.value, "reading");
    }

    initController();
    setupFileLoader();

    controller = new ExerciseController("reading", {
        onReset: handleReadingReset,
        onLoadContent: async (filename) => {
            await loadContent(filename, "reading");
        },
        onSectionChange: (val) => loadSection(val),
        onActionStart: () => { },

        // Reading Mode: Ctrl+Space (Double/Single) đều đọc từ vựng
        onCtrlSpaceSingle: () => replayLastWord(),
        onCtrlSpaceDouble: () => replayLastWord()
    });
    window.currentController = controller;
    controller.reset();
}

function setupFileLoader() {
    if (!DOM.fileLoaderBtn) return;

    DOM.fileLoaderBtn.onclick = () => DOM.fileLoader.click();

    DOM.fileLoader.onchange = (e) => {
        const file = e.target.files[0];
        processFile(file);
    };

    setupDragDrop(DOM.fileLoaderBtn, (files) => {
        const file = files.find(f => /\.(txt|md|json)$/i.test(f.name));
        if (file) processFile(file);
    }, "Drop Text File!");
}

function processFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        await loadUserContent(ev.target.result, file.name, "reading");
        controller.reset();
    };
    reader.readAsText(file);
}