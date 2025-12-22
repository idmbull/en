import { DOM } from "./state.js";
import { CONFIG } from "./core/config.js";
import { EventBus, EVENTS } from "./core/events.js";
import { resolveAudioUrl } from "./utils/audio-resolver.js";

const audioCache = {}; 
let lastEnqueuedWord = "";
let clickCtx = null, clickBuffer = null;

async function loadClickSound() {
    if (clickBuffer) return;
    try {
        clickCtx = new (window.AudioContext || window.webkitAudioContext)();
        const resp = await fetch(CONFIG.CLICK_SOUNDS.cream);
        clickBuffer = await clickCtx.decodeAudioData(await resp.arrayBuffer());
    } catch (e) { }
}

function playClick() {
    if (!clickBuffer) { loadClickSound(); return; }
    const src = clickCtx.createBufferSource();
    src.buffer = clickBuffer;
    const gain = clickCtx.createGain();
    gain.gain.value = 4.0;
    src.connect(gain).connect(clickCtx.destination);
    src.start(0);
}

async function preloadWord(word) {
    const clean = (word || "").toLowerCase().trim();
    if (!clean || audioCache[clean]) return;
    audioCache[clean] = "loading";
    const url = await resolveAudioUrl(clean);
    if (url) {
        const audio = new Audio(url);
        audio.preload = "auto";
        audioCache[clean] = audio;
    } else {
        delete audioCache[clean];
    }
}

async function playImmediate(word) {
    let audio = audioCache[word];
    if (audio === "loading") {
        const url = await resolveAudioUrl(word);
        if (url) audioCache[word] = audio = new Audio(url);
    } else if (!audio) {
        const url = await resolveAudioUrl(word);
        if (url) audioCache[word] = audio = new Audio(url);
    }
    
    if (audio && typeof audio.play === 'function') {
        const clone = audio.cloneNode();
        clone.currentTime = 0;
        clone.play().catch(() => {});
    }
}

export function enqueueSpeak(word, force = false) {
    const clean = (word || "").toLowerCase().trim();
    if (!clean) return;
    lastEnqueuedWord = clean;
    if (force || DOM.autoPronounceToggle?.checked) playImmediate(clean);
}

export function replayLastWord() {
    if (lastEnqueuedWord) enqueueSpeak(lastEnqueuedWord, true);
}

export function initAudioService() {
    EventBus.on(EVENTS.INPUT_CHANGE, () => { if (DOM.soundToggle?.checked) playClick(); });
    EventBus.on(EVENTS.INPUT_NEW_WORD, (data) => { if (data?.word) enqueueSpeak(data.word, false); });
    EventBus.on(EVENTS.AUDIO_PRELOAD, (list) => { if (Array.isArray(list)) list.forEach(preloadWord); });
}