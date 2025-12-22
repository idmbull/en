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

// Check if word contains Chinese characters
const isChinese = (word) => /[\u4e00-\u9fa5]/.test(word);
const isKorean = (word) => /[\uAC00-\uD7AF]/.test(word);

// 1. Fetch from Google Sheet (Giữ nguyên)
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
    // [MODIFIED] Nếu là tiếng Trung:
    if (isChinese(raw)) {
        const encoded = encodeURIComponent(raw);
        return [
            `https://dict.youdao.com/dictvoice?audio=${encoded}&le=zh`,
            `https://autumn-sound-09e5.idmbull.workers.dev/?lang=zh&text=${encoded}`
        ];
    }
    if (isKorean(raw)) {
        const encoded = encodeURIComponent(raw);
        return [
            // Google TTS (API công khai không chính thức nhưng ổn định cho app nhỏ)
            `https://autumn-sound-09e5.idmbull.workers.dev/?lang=ko&text=${encoded}`
            // Naver Dictionary (thường khó lấy direct link hơn, nên dùng Google làm chính)
        ];
    }
    // Logic cũ cho tiếng Anh/Latin
    const { AUDIO_SOURCES } = CONFIG;
    const f1 = key[0] || "_";
    const f3 = key.slice(0, 3).padEnd(3, "_");
    const f5 = key.slice(0, 5).padEnd(5, "_");

    const oxfUrl = key.includes("_")
        ? `${AUDIO_SOURCES.OXFORD}${f1}/${f3}/${f5}/${key}_1_us_1.mp3`
        : `${AUDIO_SOURCES.OXFORD}${f1}/${f3}/${f5}/${key}__us_1.mp3`;

    return [
        oxfUrl,
        `${AUDIO_SOURCES.CAMBRIDGE}${f1}/${f3}/${f5}/${key}.mp3`,
        `${AUDIO_SOURCES.YOUDAO}${key}`,
        `${AUDIO_SOURCES.TTS}${encodeURIComponent(raw || key)}`
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