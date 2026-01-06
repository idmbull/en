const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ==========================================
// CẤU HÌNH ĐƯỜNG DẪN
// ==========================================
const TEXTS_DIR = path.join(__dirname, 'library');
const OUTPUT_FILE = path.join(__dirname, 'library.json');

const ALLOWED_EXTS = ['.txt', '.md', '.tsv'];
const IGNORE_LIST = ['.DS_Store', 'Thumbs.db', '.git'];

/**
 * Regex kiểm tra Timestamp (Time slap)
 */
const TIMESTAMP_REGEX = /^[\d.]+\s+[\d.]+/m;

function hasTimestamps(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8').slice(0, 2000);
        return TIMESTAMP_REGEX.test(content);
    } catch (e) {
        return false;
    }
}

/**
 * Lấy thời gian commit ĐẦU TIÊN (First Commit Date) từ Git
 * Trả về Unix Timestamp (seconds)
 */
function getGitCreationTime(filePath) {
    try {
        // Lấy đường dẫn tương đối từ thư mục gốc của dự án để git hiểu
        // Lệnh: git log --diff-filter=A --follow --format=%at -- [filepath] | tail -1
        // Ý nghĩa: Tìm lịch sử file, lấy timestamp (%at), lấy dòng cuối cùng (cũ nhất)

        const dir = path.dirname(filePath);
        const base = path.basename(filePath);

        // Chạy lệnh git log trong thư mục chứa file
        const cmd = `git log --follow --format=%at -- "${base}" | tail -n 1`;

        const timestamp = execSync(cmd, {
            cwd: dir,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'] // Ẩn lỗi nếu file chưa commit
        }).trim();

        if (timestamp) {
            return parseInt(timestamp, 10);
        }

        // Nếu không tìm thấy trong git (file mới chưa commit), dùng fs.stat
        return fs.statSync(filePath).birthtimeMs / 1000;

    } catch (e) {
        // Fallback an toàn
        return fs.statSync(filePath).birthtimeMs / 1000;
    }
}

/**
 * Quét thư mục đệ quy
 */
function scanDirectory(currentPath, relativePath = "") {
    if (!fs.existsSync(currentPath)) return [];

    const items = fs.readdirSync(currentPath, { withFileTypes: true });

    let folders = [];
    let files = [];

    items.forEach(item => {
        if (IGNORE_LIST.includes(item.name) || item.name.startsWith('.')) return;

        if (item.isDirectory()) {
            folders.push(item);
        } else {
            const ext = path.extname(item.name).toLowerCase();
            if (ALLOWED_EXTS.includes(ext)) {
                files.push(item);
            }
        }
    });

    // 1. Sắp xếp Thư mục (Vẫn theo tên A-Z để dễ nhìn cấu trúc)
    folders.sort((a, b) => a.name.localeCompare(b.name));

    // 2. Xử lý Files: Lấy ngày Commit và Sắp xếp
    const filesWithDate = files.map(file => {
        const fullPath = path.join(currentPath, file.name);
        return {
            fileItem: file,
            fullPath: fullPath,
            // Lấy ngày tạo
            createdTime: getGitCreationTime(fullPath)
        };
    });

    // Sắp xếp: CŨ NHẤT lên ĐẦU (Ascending) -> Bài 01 là bài làm đầu tiên
    // Nếu muốn MỚI NHẤT lên đầu, đổi thành: b.createdTime - a.createdTime
    filesWithDate.sort((a, b) => a.createdTime - b.createdTime);

    const result = [];

    // Xử lý Thư mục con
    folders.forEach(folder => {
        const itemRelativePath = path.join(relativePath, folder.name).replace(/\\/g, '/');
        const subPath = path.join(currentPath, folder.name);
        const children = scanDirectory(subPath, itemRelativePath);

        if (children.length > 0) {
            result.push({
                name: folder.name,
                items: children
            });
        }
    });

    // Xử lý File và Đánh số
    filesWithDate.forEach((item, index) => {
        const file = item.fileItem;
        const itemRelativePath = path.join(relativePath, file.name).replace(/\\/g, '/');

        // Đánh số 01, 02...
        const prefix = String(index + 1).padStart(2, '0');
        const numberedName = `${prefix}. ${file.name}`; // Tên dùng để HIỂN THỊ

        const containsTimeSlap = hasTimestamps(item.fullPath);

        result.push({
            name: numberedName,      // VD: "01. A Magical Book.md" (Có số)
            fileName: file.name,     // VD: "A Magical Book.md" (Tên gốc -> Để tìm Audio)
            path: itemRelativePath,
            hasAudio: containsTimeSlap
        });
    });

    return result;
}

function main() {
    console.log("🚀 Đang quét và tra cứu lịch sử Git...");
    console.log("⏳ Vui lòng đợi, quá trình này có thể mất vài giây...");

    try {
        const tree = scanDirectory(TEXTS_DIR);
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(tree, null, 2), 'utf-8');
        console.log("---------------------------------------");
        console.log(`✅ Đã xong! File lưu tại: ${OUTPUT_FILE}`);
        console.log(`📅 Tiêu chí sắp xếp: Ngày commit đầu tiên (Cũ nhất -> Mới nhất)`);
    } catch (err) {
        console.error("❌ Lỗi:", err.message);
    }
}

main();