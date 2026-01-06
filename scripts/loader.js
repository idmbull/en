// scripts/loader.js
import { Store } from "./core/store.js";
import { parseUnified } from "./utils/content-parser.js";

// ĐỊNH NGHĨA CÁC ĐƯỜNG DẪN GỐC (Rất quan trọng)
const TEXT_BASE = "library/";
const AUDIO_BASE = "https://cdn.jsdelivr.net/gh/idmbull/english@main/assets/audio/";

function removeExtension(filename) {
    return filename.replace(/\.[^/.]+$/, "");
}


export async function loadLibrary() {
    try {
        const resp = await fetch('library.json', { cache: 'no-cache' });
        const data = await resp.json();
        const container = document.getElementById('playlistContent');
        const trigger = document.getElementById('playlistTrigger'); // Nút bấm

        if (!container || !trigger) return;

        container.innerHTML = '';
        const rootUl = document.createElement('ul');
        rootUl.className = 'tree-ul expanded';

        const createItem = (item) => {
            const li = document.createElement('li');
            li.className = 'tree-item';
            const label = document.createElement('div');

            if (item.items) {
                // Xử lý Thư mục
                label.className = 'tree-label is-folder';
                label.innerHTML = `<span class="tree-arrow">▶</span> 📁 ${item.name}`;
                const ul = document.createElement('ul');
                ul.className = 'tree-ul';

                label.onclick = (e) => {
                    e.stopPropagation();
                    li.classList.toggle('expanded');
                    ul.classList.toggle('expanded');
                };

                li.appendChild(label);
                item.items.forEach(child => ul.appendChild(createItem(child)));
                li.appendChild(ul);
            } else {
                // Xử lý File bài tập
                label.className = 'tree-label is-file selectable-file';
                const icon = item.hasAudio ? '🎧' : '📄';
                label.innerHTML = `<span class="tree-icon">${icon}</span> ${item.name.replace(/\.[^.]+$/, "")}`;

                label.onclick = async (e) => {
                    if (e) e.stopPropagation();
                    document.querySelectorAll('.tree-label').forEach(el => el.classList.remove('active'));
                    label.classList.add('active');

                    document.getElementById('playlistContent').classList.add('hidden');
                    const triggerSpan = document.querySelector('#playlistTrigger span');
                    // Hiển thị tên có số thứ tự trên menu
                    if (triggerSpan) triggerSpan.textContent = item.name;

                    try {
                        const response = await fetch(TEXT_BASE + item.path);
                        const rawText = await response.text();
                        const parsed = parseUnified(rawText);

                        // Tiêu đề bài học dùng tên hiển thị (có số) cho đẹp
                        if (!parsed.title) {
                            parsed.title = removeExtension(item.name);
                        }

                        // [SỬA Ở ĐÂY] -----------------------------------------
                        // Dùng item.fileName (tên gốc) nếu có, để khớp với file Audio trên server
                        const originalFileName = item.fileName || item.name;
                        const fileNameOnly = removeExtension(originalFileName);
                        const audioUrl = item.hasAudio ? `${AUDIO_BASE}${fileNameOnly}.mp3` : null;
                        // -----------------------------------------------------

                        Store.setSourceUnified(parsed, item.hasAudio, audioUrl);
                        document.dispatchEvent(new CustomEvent("app:content-loaded"));

                    } catch (err) {
                        console.error("Lỗi khi tải file:", err);
                        alert("Không thể tải nội dung bài tập này.");
                    }
                };
                li.appendChild(label);
            }
            return li;
        };

        data.forEach(item => rootUl.appendChild(createItem(item)));
        container.appendChild(rootUl);

        trigger.onclick = (e) => {
            e.stopPropagation();
            container.classList.toggle('hidden');
        };

        // Đóng menu khi click ra ngoài vùng dropdown
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target) && e.target !== trigger) {
                container.classList.add('hidden');
            }
        });
        // --------------------------------------

        // Tự động chọn bài đầu tiên (đoạn cũ)
        const firstFile = container.querySelector('.selectable-file');
        if (firstFile) {
            firstFile.click();
        }

    } catch (e) {
        console.error("Lỗi nạp Library:", e);
    }
}

export async function loadUserContent(rawText, fileName) {
    try {
        const parsed = parseUnified(rawText);

        // [THÊM LOGIC TIÊU ĐỀ CHO FILE UPLOAD]
        if (!parsed.title) {
            parsed.title = removeExtension(fileName);
        }

        Store.setSourceUnified(parsed, false, null);
        return true;
    } catch (e) {
        console.error(e);
        alert("Lỗi đọc file nội dung!");
        return false;
    }
}