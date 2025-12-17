import { CONFIG } from "../core/config.js";

// Helper check url tồn tại
const checkUrl = (url) => new Promise(resolve => {
    const audio = new Audio();
    audio.onloadedmetadata = () => resolve(true);
    audio.onerror = () => resolve(false);
    audio.src = url;
    // Timeout để tránh treo
    setTimeout(() => resolve(false), CONFIG.TIMEOUTS.AUDIO_CHECK);
});

// Normalize input
const normalize = (word) => (word || "").trim().toLowerCase().replace(/['-]/g, "_");

// 1. Fetch from Google Sheet
async function getSheetUrls(key) {
    try {
        const q = encodeURIComponent(`select A,B where A = '${key}'`);
        const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET.ID}/gviz/tq?tq=${q}&gid=${CONFIG.SHEET.GID}`;
        const resp = await fetch(url);
        const text = await resp.text();
        const json = JSON.parse(text.substr(47).slice(0, -2));

        if (json.table.rows?.length > 0) {
            const val = json.table.rows[0].c[1]?.v;
            return val ? val.split(/[,]\s*/).filter(Boolean) : [];
        }
    } catch { return []; }
    return [];
}

// 2. Generate Dictionary URLs
function getDictUrls(key, raw) {
    const { AUDIO_SOURCES } = CONFIG;
    const encoded = encodeURIComponent(key);

    return [
        // Ưu tiên Youdao (Phát âm chuẩn bản ngữ hơn Google)
        `${AUDIO_SOURCES.YOUDAO}${encoded}`,

        // Sau đó đến Google TTS
        `${AUDIO_SOURCES.TTS}${encoded}`
    ];
}

// MAIN RESOLVER
export async function resolveAudioUrl(rawWord) {
    const key = normalize(rawWord);
    if (!key) return null;

    // Ưu tiên Sheet -> Dictionary -> TTS
    const sheetUrls = await getSheetUrls(key);
    const dictUrls = getDictUrls(key, rawWord);
    const candidates = [...sheetUrls, ...dictUrls];

    for (const url of candidates) {
        if (await checkUrl(url)) return url;
    }
    return null;
}