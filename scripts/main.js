// scripts/main.js
import { DOM } from "./state.js";
import { initTheme } from "./theme.js";
import { Store } from "./core/store.js"; // <-- Import Store

// Lấy tham số mode từ URL
const urlParams = new URLSearchParams(window.location.search);
const currentMode = urlParams.get('mode') || 'reading'; 

// Cập nhật Store
Store.setMode(currentMode);

function setupUIForMode(mode) {
    if (mode === 'dictation') {
        document.title = "Idm Dictation";
        DOM.headerTitle.textContent = "Dictation Practice";
        DOM.headerSubtitle.textContent = "Nghe kỹ - Gõ chính xác";
        DOM.volumeControl.classList.remove('hidden');   
        DOM.modeSwitchBtn.textContent = "📖 Go to Reading";
        DOM.modeSwitchBtn.onclick = () => {
            window.location.search = '?mode=reading';
        };

        import('./dictation-app.js').then(module => {
            module.initDictationMode();
        });

    } else {
        document.title = "Idm Typing";
        DOM.volumeControl.classList.add('hidden');
        DOM.difficultySelect.classList.remove('hidden');
        DOM.modeSwitchBtn.textContent = "🎧 Go to Dictation";
        DOM.modeSwitchBtn.onclick = () => {
            window.location.search = '?mode=dictation';
        };

        import('./app.js').then(module => {
            module.initReadingMode();
        });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    setupUIForMode(currentMode);
});