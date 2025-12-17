// scripts/core/events.js

const listeners = {};

export const EventBus = {
    on(eventName, callback) {
        if (!listeners[eventName]) {
            listeners[eventName] = [];
        }
        listeners[eventName].push(callback);
    },

    off(eventName, callback) {
        if (!listeners[eventName]) return;
        listeners[eventName] = listeners[eventName].filter(cb => cb !== callback);
    },

    emit(eventName, data) {
        if (!listeners[eventName]) return;
        listeners[eventName].forEach(callback => {
            try {
                callback(data);
            } catch (err) {
                console.error(`Error in event listener for "${eventName}":`, err);
            }
        });
    }
};

export const EVENTS = {
    EXERCISE_START: 'exercise:start',
    EXERCISE_STOP: 'exercise:stop',
    EXERCISE_COMPLETE: 'exercise:complete',

    INPUT_CHANGE: 'input:change',
    INPUT_NEW_WORD: 'input:new_word',
    
    // [MỚI] Sự kiện yêu cầu tải trước audio
    AUDIO_PRELOAD: 'audio:preload',

    DICTATION_SEGMENT_DONE: 'dictation:segment_done',
    DICTATION_SEGMENT_CHANGE: 'dictation:segment_change'
};