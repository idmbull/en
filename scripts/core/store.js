// scripts/core/store.js

const INITIAL_STATE = {
    isActive: false,
    isAudioMode: false, // Tự động bật khi bài tập có audio
    blindMode: false,
    currentLessonPath: null, // [NEW] Lưu path của bài học hiện tại để share link
    source: {
        title: "",
        text: "",
        html: "",
        segments: [],
        charStarts:[],
        currentSegment: 0,
        audioUrl: null
    },
    textSpans: [],
    wordTokens: [],
    wordStarts:[],
    startTime: null,
    statTotalKeys: 0,
    statCorrectKeys: 0,
    statErrors: 0,
    prevInputLen: 0,
    prevIndex: 0
};

let state = JSON.parse(JSON.stringify(INITIAL_STATE));

export const Store = {
    getState: () => state,
    getSource: () => state.source,

    // Logic: Nếu có file audio hoặc có segments (timestamp) -> Là Audio Mode
    isAudio: () => state.isAudioMode,
    isBlind: () => state.blindMode,
    getCurrentLessonPath: () => state.currentLessonPath,

    setSourceUnified(data, hasAudio, audioUrl, lessonPath = null) {
        this.reset(); // Reset trước khi nạp mới
        state.isAudioMode = hasAudio || (data.segments && data.segments.length > 0);
        state.source = { ...data, audioUrl, currentSegment: 0 };
        state.currentLessonPath = lessonPath; // Gán path của file thư viện

        // Emit event để UI cập nhật (hiện/ẩn volume controller)
        document.dispatchEvent(new CustomEvent("store:source-changed", {
            detail: { hasAudio: state.isAudioMode }
        }));
    },

    setBlindMode(isEnabled) { state.blindMode = isEnabled; },

    reset() {
        state.isActive = false;
        state.startTime = null;

        // Bổ sung dòng này để xóa thời gian kết thúc cũ
        state.endTime = null;

        state.statTotalKeys = 0;
        state.statCorrectKeys = 0;
        state.statErrors = 0;
        state.prevInputLen = 0;
        state.prevIndex = 0;

        // Đảm bảo currentSegment reset về 0 (nếu cần thiết, tuỳ logic bài)
        state.source.currentSegment = 0;

        state.textSpans =[];
        state.wordTokens = [];
        state.wordStarts =[];
    },


    startExercise() {
        if (state.isActive) return;
        state.isActive = true;
        state.startTime = Date.now();
    },

    stopExercise() {
        state.isActive = false;
        if (!state.endTime) {
            state.endTime = Date.now();
        }
    },

    setSpans(spans) { state.textSpans = spans; },
    setWordMetadata(tokens, starts) {
        state.wordTokens = tokens;
        state.wordStarts = starts;
    },
    setCurrentSegment(index) { state.source.currentSegment = index; },
    setPrevIndex(index) { state.prevIndex = index; },
    setPrevInputLen(len) { state.prevInputLen = len; },

    addStats(isCorrect) {
        state.statTotalKeys++;
        if (isCorrect) state.statCorrectKeys++;
        else state.statErrors++;
    }
};