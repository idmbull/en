Để thêm tính năng **Kéo & Thả (Drag & Drop)** file vào nút "Load", chúng ta cần:

1.  Thêm hiệu ứng CSS để người dùng biết khi nào họ đang kéo file vào đúng chỗ.
2.  Cập nhật logic trong `scripts/loader.js` để xử lý các sự kiện `dragover` (kéo qua) và `drop` (thả).

Dưới đây là các thay đổi chi tiết:

### 1. Cập nhật `styles.css`
Thêm class `.dragging` để tạo hiệu ứng thị giác khi người dùng giữ file bên trên nút Load.

```css
/* --- Thêm vào cuối file styles.css --- */

/* Hiệu ứng khi kéo file vào nút Load */
#fileLoaderBtn.dragging {
    transform: scale(1.1);
    box-shadow: 0 0 20px rgba(0, 198, 255, 0.8);
    background: linear-gradient(to right, #0072ff, #00c6ff);
    border: 2px dashed rgba(255, 255, 255, 0.8);
    z-index: 10000; /* Đảm bảo nổi lên trên */
}
```

### 2. Cập nhật `scripts/loader.js`
Chúng ta sẽ sửa hàm `setupFileLoader`. Thay vì chỉ lắng nghe `input change`, ta sẽ lắng nghe thêm `drop` trên cái nút (`#fileLoaderBtn`).

Bạn thay thế toàn bộ hàm `setupFileLoader` cũ bằng đoạn code mới này:

```javascript
// scripts/loader.js

// ... (các phần code cũ giữ nguyên) ...

export function setupFileLoader(onLoadedCallback) {
    const input = document.getElementById("fileLoader");
    const btn = document.getElementById("fileLoaderBtn");
    
    if (!input || !btn) return;

    // --- Hàm xử lý đọc file chung (cho cả Click và Drop) ---
    const handleFile = (file) => {
        if (!file) return;

        // Cập nhật tên nút thành tên file
        btn.textContent = file.name;

        const reader = new FileReader();
        reader.onload = function (e) {
            onLoadedCallback(e.target.result, file.name);
        };
        reader.readAsText(file, "utf-8");
    };

    // 1. Sự kiện CLICK truyền thống (Input Change)
    input.addEventListener("change", function () {
        handleFile(this.files[0]);
    });

    // 2. Sự kiện DRAG & DROP trên Nút
    
    // Khi kéo file vào vùng nút
    btn.addEventListener("dragover", (e) => {
        e.preventDefault(); // Bắt buộc để cho phép drop
        e.stopPropagation();
        btn.classList.add("dragging"); // Thêm class CSS
        btn.textContent = "Drop here!"; // Đổi text gợi ý
    });

    // Khi kéo ra ngoài nút
    btn.addEventListener("dragleave", (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.remove("dragging");
        
        // Trả lại text cũ (nếu input có file thì lấy tên file, ko thì mặc định)
        if (input.files.length > 0) {
            btn.textContent = input.files[0].name;
        } else {
            btn.textContent = "📂 Load";
        }
    });

    // Khi thả file
    btn.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.remove("dragging");

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            // Gán file vào input (để logic đồng bộ) và xử lý
            input.files = files; 
            handleFile(files[0]);
        }
    });
}

// ... (giữ nguyên phần còn lại) ...
```

### 3. Dọn dẹp `scripts/app.js`
Vì logic cập nhật tên nút (`btn.textContent`) đã được chuyển vào trong `loader.js` để dùng chung cho cả Drop và Click, bạn nên xóa đoạn code xử lý sự kiện `change` thừa ở cuối file `app.js` (nếu có) để tránh xung đột hoặc chạy 2 lần.

Trong `scripts/app.js`, tìm đoạn cuối cùng và **xóa hoặc comment** phần lắng nghe sự kiện change của `#fileLoader`:

```javascript
// scripts/app.js - Cập nhật đoạn cuối file

// FILE LOADER
setupFileLoader(async (content, filename) => {
    await loadRawTextFromUserFile(content, filename);

    resetState();
    const txt = getCurrentSectionText();
    displayText(txt);

    DOM.textInput.value = "";
    DOM.textInput.disabled = true;
    updateStatsDOMImmediate(100, 0, "0s", 0);
    DOM.textContainer.scrollTop = 0;
});

// Sự kiện click nút vẫn giữ nguyên để kích hoạt input ẩn
document
    .getElementById("fileLoaderBtn")
    .addEventListener("click", () =>
        document.getElementById("fileLoader").click()
    );

/* --- ĐOẠN NÀY NÊN XÓA VÌ ĐÃ CHUYỂN LOGIC VÀO loader.js ---
document
    .getElementById("fileLoader")
    .addEventListener("change", (e) => {
        const btn = document.getElementById("fileLoaderBtn");
        if (e.target.files.length) btn.textContent = e.target.files[0].name;
        else btn.textContent = "Upload File";
    });
----------------------------------------------------------- */
```

### Kết quả
Bây giờ bạn có thể:
1.  Bấm vào nút **Load** để chọn file như cũ.
2.  Kéo file `.txt` hoặc `.md` từ máy tính và thả trực tiếp vào nút **Load**. Nút sẽ sáng lên và đổi chữ thành "Drop here!" khi bạn kéo file qua.