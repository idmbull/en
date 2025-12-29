// scripts/state.js
export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => Array.from(document.querySelectorAll(sel));

export const DOM = {
    // Layout & Header
    get container() { return $('.container'); },
    get headerTitle() { return $('header h1'); },
    get headerSubtitle() { return $('header .subtitle'); },

    // Main Areas
    get textDisplay() { return $('#textDisplay'); },
    get textContainer() { return $('#textContainer'); },
    get textInput() { return $('#textInput'); },

    // Controls
    get actionToggle() { return $('#actionToggle'); },
    get actionLabel() { return $('#actionLabel'); },
    get settingsGroup() { return $('.settings-group'); },

    // Toggles
    get soundToggle() { return $('#soundToggle'); },
    get autoPronounceToggle() { return $('#autoPronounceToggle'); },
    get autoTooltipToggle() { return $('#autoTooltipToggle'); },
    get blindModeToggle() { return $('#blindModeToggle'); },
    get themeSelect() { return $('#themeSelect'); },

    // Volume
    get volumeControl() { return $('.mini-volume-control'); },
    get volumeInput() { return $('#dictationVolume'); },

    // Footer / Loader
    get fileLoader() { return $('#fileLoader'); },
    get fileLoaderBtn() { return $('#fileLoaderBtn'); },
    get playlistSelect() { return $('#playlist'); },
    get playlistTrigger() { return $('#playlistTrigger'); },
    get modeSwitchBtn() { return $('#modeSwitchBtn'); },

    // Stats
    get accuracyEl() { return $('#accuracy'); },
    get wpmEl() { return $('#wpm'); },
    get timeEl() { return $('#time'); },
    get errorsEl() { return $('#errors'); },

    // Components
    get globalTooltip() { return $('#globalTooltip'); },
    get audioPlayer() { return $('#player'); },

    // Dictation Modal & Specifics
    get dictationModal() { return $('#dictationModal'); },
    get dictationBtn() { return $('#fileLoaderBtn'); }, // Reusing fileLoaderBtn logic
    get dictationSubInput() { return $('#dictationSubInput'); },
    get dictationAudioInput() { return $('#dictationAudioInput'); },
    get dictationBlindMode() { return $('#dictationBlindMode'); },
    get dictationStartBtn() { return $('#dictationStartBtn'); },
    get dictationCancelBtn() { return $('#dictationCancelBtn'); },
    get mediaControls() { return $('#mediaControls'); },
    get dictationPlayAllBtn() { return $('#dictationPlayAllBtn'); },
    get resultModal() { return $('#resultModal'); },
    get resAcc() { return $('#resAcc'); },
    get resWpm() { return $('#resWpm'); },
    get resTime() { return $('#resTime'); },
    get resErr() { return $('#resErr'); },
    get btnReplay() { return $('#btnReplay'); },
    get btnNext() { return $('#btnNext'); },
};