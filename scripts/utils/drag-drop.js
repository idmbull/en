// scripts/utils/drag-drop.js

/**
 * Thiết lập kéo thả cho một phần tử
 * @param {HTMLElement} element - Nút hoặc vùng nhận kéo thả
 * @param {Function} onDropCallback - Hàm gọi lại khi thả file (nhận vào mảng files)
 * @param {String} dragText - Chữ hiển thị khi đang kéo file vào (Mặc định: "Drop here!")
 */
export function setupDragDrop(element, onDropCallback, dragText = "Drop here!") {
    if (!element) return;

    // Lưu text gốc để trả lại khi kéo ra ngoài
    let originalText = element.textContent;

    // Cập nhật text gốc nếu nút bị đổi text bên ngoài (ví dụ sau khi load file xong)
    const updateOriginalText = () => {
        if (!element.classList.contains("dragging")) {
            originalText = element.textContent;
        }
    };
    // Observer để theo dõi thay đổi text (đề phòng)
    const observer = new MutationObserver(updateOriginalText);
    observer.observe(element, { childList: true });

    element.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!element.classList.contains("dragging")) {
            originalText = element.textContent; // Cập nhật lại lần cuối trước khi đổi
            element.classList.add("dragging");
            element.textContent = dragText;
        }
    });

    element.addEventListener("dragleave", (e) => {
        e.preventDefault();
        e.stopPropagation();
        element.classList.remove("dragging");
        element.textContent = originalText;
    });

    element.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        element.classList.remove("dragging");
        element.textContent = originalText;

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            onDropCallback(Array.from(files));
        }
    });
}