const fs = require('fs');
const path = require('path');

// ==========================================
// CẤU HÌNH ĐƯỜNG DẪN
// ==========================================
const TEXTS_DIR = path.join(__dirname, 'library');
const OUTPUT_FILE = path.join(__dirname, 'library.json');

const ALLOWED_EXTS = ['.txt', '.md', '.tsv'];
const IGNORE_LIST = ['.DS_Store', 'Thumbs.db', '.git'];

/**
 * Regex kiểm tra Timestamp (Time slap)
 * Tìm dạng: [Số].[Số] [Khoảng trắng/Tab] [Số].[Số] ở đầu dòng
 * Ví dụ: 0.0  5.2
 */
const TIMESTAMP_REGEX = /^[\d.]+\s+[\d.]+/m;

/**
 * Kiểm tra nội dung file có chứa Timestamp hay không
 * @param {string} filePath Đường dẫn đầy đủ của file
 */
function hasTimestamps(filePath) {
    try {
        // Chỉ đọc 2000 ký tự đầu tiên để tối ưu hiệu năng (đủ để nhận diện bài dictation)
        const content = fs.readFileSync(filePath, 'utf8').slice(0, 2000);
        return TIMESTAMP_REGEX.test(content);
    } catch (e) {
        console.error(`❌ Lỗi khi đọc file ${filePath}:`, e.message);
        return false;
    }
}

/**
 * Quét thư mục đệ quy và xây dựng cấu trúc cây
 * @param {string} currentPath Đường dẫn thư mục hiện tại
 * @param {string} relativePath Đường dẫn tương đối dùng cho việc fetch ở Frontend
 */
function scanDirectory(currentPath, relativePath = "") {
    if (!fs.existsSync(currentPath)) {
        console.warn(`⚠️ Thư mục không tồn tại: ${currentPath}`);
        return [];
    }

    const items = fs.readdirSync(currentPath, { withFileTypes: true });
    const result = [];

    items.forEach(item => {
        // Bỏ qua các file hệ thống ẩn
        if (IGNORE_LIST.includes(item.name) || item.name.startsWith('.')) return;

        // Tính toán đường dẫn tương đối (chuẩn hóa dấu gạch chéo cho Web)
        const itemRelativePath = path.join(relativePath, item.name).replace(/\\/g, '/');

        if (item.isDirectory()) {
            const subPath = path.join(currentPath, item.name);
            const children = scanDirectory(subPath, itemRelativePath);

            // Chỉ thêm thư mục vào danh sách nếu bên trong nó có file hợp lệ
            if (children.length > 0) {
                result.push({
                    name: item.name,
                    items: children
                });
            }
        } else {
            const ext = path.extname(item.name).toLowerCase();
            if (ALLOWED_EXTS.includes(ext)) {
                const fullPath = path.join(currentPath, item.name);

                // QUY TẮC MỚI: 
                // Nếu nội dung có timestamp -> Mặc định hasAudio = true
                const containsTimeSlap = hasTimestamps(fullPath);

                result.push({
                    name: item.name,
                    path: itemRelativePath, // Dùng để fetch file text
                    hasAudio: containsTimeSlap
                });
            }
        }
    });

    // Sắp xếp: Thư mục lên trước, sau đó đến File (A-Z)
    return result.sort((a, b) => {
        const aIsFolder = a.items ? 0 : 1;
        const bIsFolder = b.items ? 0 : 1;
        if (aIsFolder !== bIsFolder) return aIsFolder - bIsFolder;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
}

// ==========================================
// CHƯƠNG TRÌNH CHÍNH
// ==========================================
function main() {
    console.log("🚀 Bắt đầu quét thư mục library/texts...");
    console.log("---------------------------------------");

    const tree = scanDirectory(TEXTS_DIR);

    try {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(tree, null, 2), 'utf-8');
        console.log("---------------------------------------");
        console.log(`✅ THÀNH CÔNG: Đã tạo file ${OUTPUT_FILE}`);
        console.log(`📝 Tổng số mục gốc: ${tree.length}`);
    } catch (err) {
        console.error("❌ Lỗi khi ghi file JSON:", err.message);
    }
}

main();