// /scripts/tooltip.js
import { DOM } from "./state.js";

/* ---------------------------------------------------------
    GLOBAL OPTIONS
   --------------------------------------------------------- */

// Vị trí tooltip khi đang gõ (neo theo ký tự)
export let TOOLTIP_POSITION = "bottom"; 
// Hỗ trợ: "top", "bottom", "left", "right"

// Lưu vị trí chuột để chọn đúng rect khi hover
let lastMousePos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
document.addEventListener("mousemove", e => {
    lastMousePos.x = e.clientX;
    lastMousePos.y = e.clientY;
}, { passive: true });

let tooltipTimer = null;


/* ---------------------------------------------------------
    TOOLTIP UTILITIES
   --------------------------------------------------------- */

function positionTooltipByDirection(rect, tooltip, direction) {
    const ttWidth = tooltip.offsetWidth;
    const ttHeight = tooltip.offsetHeight;

    let left, top;
    tooltip.classList.remove("pos-top", "pos-bottom", "pos-left", "pos-right");

    switch (direction) {
        case "bottom":
            left = rect.left + rect.width / 2 - ttWidth / 2;
            top = rect.bottom + 12;
            tooltip.classList.add("pos-bottom");
            break;

        case "left":
            left = rect.left - ttWidth - 12;
            top = rect.top + rect.height / 2 - ttHeight / 2;
            tooltip.classList.add("pos-left");
            break;

        case "right":
            left = rect.right + 12;
            top = rect.top + rect.height / 2 - ttHeight / 2;
            tooltip.classList.add("pos-right");
            break;

        default:    // top
            left = rect.left + rect.width / 2 - ttWidth / 2;
            top = rect.top - ttHeight - 12;
            tooltip.classList.add("pos-top");
            break;
    }

    if (left < 8) left = 8;
    if (left + ttWidth > window.innerWidth - 8)
        left = window.innerWidth - ttWidth - 8;

    if (top < 8) top = 8;
    if (top + ttHeight > window.innerHeight - 8)
        top = window.innerHeight - ttHeight - 8;

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;

    const arrowLeft = Math.round(rect.left + rect.width / 2 - left - 8);
    tooltip.style.setProperty("--arrow-left", `${arrowLeft}px`);

    const arrowTop = Math.round(rect.top + rect.height / 2 - top);
    tooltip.style.setProperty("--arrow-top", `${arrowTop}px`);
}


/* ---------------------------------------------------------
    SHOW TOOLTIP (HOVER MODE)
   --------------------------------------------------------- */

export function showTooltipHover(wrapper) {
    clearTimeout(tooltipTimer);

    tooltipTimer = setTimeout(() => {
        const note = wrapper.dataset.note || "";
        DOM.globalTooltip.innerHTML = marked.parseInline(note);
        const tooltip = DOM.globalTooltip;

        tooltip.classList.add("visible");

        // chọn rect đúng theo vị trí chuột
        const rects = Array.from(wrapper.getClientRects());
        let selected = wrapper.getBoundingClientRect();

        if (rects.length > 0) {
            const byMouse = rects.find(r =>
                lastMousePos.y >= r.top &&
                lastMousePos.y <= r.bottom &&
                lastMousePos.x >= r.left &&
                lastMousePos.x <= r.right
            );
            selected = byMouse || rects[0];
        }

        const topSpace = selected.top - 8 - tooltip.offsetHeight;
        if (topSpace >= 8)
            positionTooltipByDirection(selected, tooltip, "top");
        else
            positionTooltipByDirection(selected, tooltip, "bottom");

    }, 80);
}

export function hideTooltip() {
    clearTimeout(tooltipTimer);
    DOM.globalTooltip.classList.remove("visible");
}


/* ---------------------------------------------------------
    SHOW TOOLTIP WHILE TYPING (NEO THEO KÝ TỰ)
   --------------------------------------------------------- */

export function showTooltipForSpan(span) {
    const wrapper = span.closest(".tooltip-word");
    if (!wrapper) return hideTooltip();

    const note = wrapper.dataset.note || "";
    const tooltip = DOM.globalTooltip;

    tooltip.innerHTML = marked.parseInline(note);
    tooltip.classList.add("visible");

    tooltip.classList.remove("spring");
    void tooltip.offsetWidth;
    tooltip.classList.add("spring");

    const rect = span.getBoundingClientRect();
    positionTooltipByDirection(rect, tooltip, TOOLTIP_POSITION);
}


/* ---------------------------------------------------------
    EVENT LISTENERS (Global Event Bus)
   --------------------------------------------------------- */

// Hover tooltip
document.addEventListener("tooltip:show", e => {
    showTooltipHover(e.detail);
});
document.addEventListener("tooltip:hide", () => {
    hideTooltip();
});
