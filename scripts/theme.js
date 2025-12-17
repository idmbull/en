// scripts/theme.js
import { DOM } from "./state.js";

/* ---------------------------------------------------------
    APPLY THEME
   --------------------------------------------------------- */
export function setTheme(themeName) {
    // Set attribute data-theme cho html tag
    document.documentElement.setAttribute("data-theme", themeName);
    
    // Lưu vào LocalStorage
    localStorage.setItem("theme", themeName);
    
    // Đồng bộ UI Select (nếu thay đổi từ code)
    if (DOM.themeSelect) {
        DOM.themeSelect.value = themeName;
    }

    // Emit event nếu cần các component khác render lại
    const evt = new CustomEvent("theme:changed", { detail: themeName });
    document.dispatchEvent(evt);
}

/* ---------------------------------------------------------
    INIT THEME
   --------------------------------------------------------- */
export function initTheme() {
    // Mặc định là 'light' nếu chưa lưu
    const saved = localStorage.getItem("theme") || "light";
    
    setTheme(saved);
}