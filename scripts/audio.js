// scripts/audio.js
import { DOM } from "./state.js";
import { CONFIG } from "./core/config.js";
import { EventBus, EVENTS } from "./core/events.js";
import { resolveAudioUrl } from "./utils/audio-resolver.js";

// --- STATE ---
const audioCache = {}; // Lưu trữ: { "hello": AudioObj | "loading" }
let lastEnqueuedWord = "";

// --- CLICK SOUNDS ---
let clickCtx = null;
let clickBuffer = null;

async function loadClickSound() {
    if (clickBuffer) return;
    try {
        clickCtx = new (window.AudioContext || window.webkitAudioContext)();
        const resp = await fetch(CONFIG.CLICK_SOUNDS.cream);
        clickBuffer = await clickCtx.decodeAudioData(await resp.arrayBuffer());
    } catch (e) { console.warn("Click sound failed:", e); }
}

function playClick() {
    if (!clickBuffer || !clickCtx) { loadClickSound(); return; }
    // Tạo source mới mỗi lần click để âm thanh chồng lên nhau tự nhiên
    const src = clickCtx.createBufferSource();
    src.buffer = clickBuffer;
    const gain = clickCtx.createGain();
    gain.gain.value = 4.0;
    src.connect(gain).connect(clickCtx.destination);
    src.start(0);
}

// --- PRELOAD LOGIC (Giữ nguyên để đảm bảo tốc độ) ---
async function preloadWord(word) {
    const clean = (word || "").toLowerCase().trim();
    if (!clean) return;

    if (audioCache[clean]) return;

    audioCache[clean] = "loading"; // Đánh dấu đang tải

    const url = await resolveAudioUrl(clean);
    
    if (url) {
        const audio = new Audio();
        audio.preload = "auto"; 
        audio.src = url;
        audio.load();
        audioCache[clean] = audio;
    } else {
        delete audioCache[clean];
    }
}

// --- IMMEDIATE PLAY LOGIC (MỚI) ---
// Hàm này sẽ tìm và phát ngay lập tức, không đợi hàng đợi
async function playImmediate(word) {
    let audio = audioCache[word];

    // Case 1: Đang tải dở (Preload chưa xong) -> Chờ resolve
    if (audio === "loading") {
        const url = await resolveAudioUrl(word);
        if (url) {
            audio = new Audio(url);
            // Cập nhật lại cache để lần sau dùng luôn
            audioCache[word] = audio; 
        }
    } 
    // Case 2: Chưa có trong cache -> Tải mới
    else if (!audio) {
        const url = await resolveAudioUrl(word);
        if (url) {
            audio = new Audio(url);
            audioCache[word] = audio;
        }
    }

    // Play Logic
    if (audio && typeof audio.play === 'function') {
        // [QUAN TRỌNG] Clone node để phát song song
        // Nếu dùng lại object cũ, nó sẽ bị ngắt quãng nếu gõ từ đó liên tiếp
        const soundClone = audio.cloneNode(); 
        soundClone.currentTime = 0;
        
        // Fire and forget - không cần lắng nghe sự kiện ended
        soundClone.play().catch(e => {
            // Lỗi này thường do user chưa tương tác với trang web
            // hoặc file lỗi, ta ignore để không chặn luồng
            // console.warn("Audio play blocked", e);
        });
    }
}

/**
 * Hàm này được gọi từ Controller.
 * Bây giờ nó sẽ gọi playImmediate thay vì đẩy vào queue.
 */
export function enqueueSpeak(word, force = false) {
    const clean = (word || "").toLowerCase().trim();
    if (!clean) return;

    lastEnqueuedWord = clean;

    // Kiểm tra toggle (nếu không phải force/replay)
    if (!force && !DOM.autoPronounceToggle?.checked) return;

    // PHÁT NGAY LẬP TỨC
    playImmediate(clean);
}

export function replayLastWord() {
    if (lastEnqueuedWord) enqueueSpeak(lastEnqueuedWord, true);
}

// --- INIT SERVICE ---
export function initAudioService() {
    EventBus.on(EVENTS.INPUT_CHANGE, () => {
        if (DOM.soundToggle?.checked) playClick();
    });

    EventBus.on(EVENTS.INPUT_NEW_WORD, (data) => {
        if (data && data.word) enqueueSpeak(data.word, false);
    });

    EventBus.on(EVENTS.AUDIO_PRELOAD, (wordList) => {
        if (Array.isArray(wordList)) {
            wordList.forEach(w => preloadWord(w));
        }
    });
}