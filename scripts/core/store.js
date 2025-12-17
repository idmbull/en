// scripts/core/store.js

const INITIAL_STATE = {
    mode: "reading", // 'reading' | 'dictation'
    isActive: false,
    blindMode: false,
    
    // Dữ liệu bài tập (Source Code)
    source: {
        text: "",          // Logic text
        html: "",          // HTML hiển thị
        segments: [],      // Cho Dictation
        charStarts: [],    // Mapping vị trí
        currentSegment: 0, 
        audioUrl: null,
        hasAudio: false
    },

    // Metadata hiển thị (Do Renderer tính toán)
    textSpans: [],     
    wordTokens: [],
    wordStarts: [],
    
    // Runtime Stats
    startTime: null,
    statTotalKeys: 0,
    statCorrectKeys: 0,
    statErrors: 0,
    prevInputLen: 0,
    prevIndex: 0
};

// State Container (Private)
let state = JSON.parse(JSON.stringify(INITIAL_STATE));

export const Store = {
    // --- GETTERS ---
    getState: () => state,
    getSource: () => state.source,
    
    // [FIX] Thêm 2 hàm này
    getMode: () => state.mode,
    isBlind: () => state.blindMode,
    
    // --- ACTIONS ---

    setMode(mode) {
        state.mode = mode;
    },

    setBlindMode(isEnabled) {
        state.blindMode = isEnabled;
    },

    /**
     * Set dữ liệu bài tập mới
     */
    setSource(data) {
        state.source = {
            ...state.source,
            ...data,
            currentSegment: 0 
        };
        // Clear metadata cũ
        state.textSpans = [];
        state.wordTokens = [];
        state.wordStarts = [];
    },

    /**
     * Reset trạng thái runtime (Timer, Stats, Input Pointer)
     * KHÔNG XÓA source text.
     */
    reset() {
        state.isActive = false;
        state.startTime = null;
        
        state.statTotalKeys = 0;
        state.statCorrectKeys = 0;
        state.statErrors = 0;
        state.prevInputLen = 0;
        state.prevIndex = 0;
        
        // Reset pointer dictation về đầu
        state.source.currentSegment = 0;
    },

    startExercise() {
        state.isActive = true;
        state.startTime = Date.now();
    },

    stopExercise() {
        state.isActive = false;
    },

    // --- Metadata Setters ---
    setSpans(spans) {
        state.textSpans = spans;
    },
    
    setWordMetadata(tokens, starts) {
        state.wordTokens = tokens;
        state.wordStarts = starts;
    },

    // --- Updates ---
    setCurrentSegment(index) {
        state.source.currentSegment = index;
    },

    setPrevIndex(index) {
        state.prevIndex = index;
    },
    
    setPrevInputLen(len) {
        state.prevInputLen = len;
    },

    addStats(isCorrect) {
        state.statTotalKeys++;
        if (isCorrect) state.statCorrectKeys++;
        else state.statErrors++;
    }
};