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
 * Lấy thời gian commit GẦN NHẤT (Ngày sửa đổi file trên Git)
 */
function getGitModificationTime(filePath) {
    try {
        const dir = path.dirname(filePath);
        const base = path.basename(filePath);
        
        // Lấy timestamp của commit gần nhất (-1) có thay đổi file này
        const cmd = `git log -1 --format=%at -- "${base}"`;
        
        const output = execSync(cmd, { 
            cwd: dir, 
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore']
        }).trim();

        if (output) {
            return parseInt(output, 10);
        }
        
        // Fallback: Nếu không có git history, dùng ngày sửa đổi của hệ thống (mtimeMs)
        return fs.statSync(filePath).mtimeMs / 1000;

    } catch (e) {
        // Fallback: dùng ngày sửa đổi của hệ thống (mtimeMs)
        return fs.statSync(filePath).mtimeMs / 1000;
    }
}

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

    // 1. Thư mục sắp xếp theo tên (A-Z) để dễ tìm
    folders.sort((a, b) => a.name.localeCompare(b.name));

    // 2. Lấy thời gian sửa đổi gần nhất cho từng file
    const filesWithDate = files.map(file => {
        const fullPath = path.join(currentPath, file.name);
        const modifiedTime = getGitModificationTime(fullPath);
        
        return {
            fileItem: file,
            fullPath: fullPath,
            modifiedTime: modifiedTime
        };
    });

    // 3. Sắp xếp file: SỬA ĐỔI MỚI NHẤT lên ĐẦU (Descending)
    filesWithDate.sort((a, b) => b.modifiedTime - a.modifiedTime);

    const result = [];

    // Xử lý đệ quy thư mục con
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
        // Bài sửa đổi mới nhất sẽ là 01
        const prefix = String(index + 1).padStart(2, '0');
        const numberedName = `${prefix}. ${file.name}`; 
        
        const containsTimeSlap = hasTimestamps(item.fullPath);

        result.push({
            name: numberedName,       // Tên hiển thị (01. Bai sua moi nhat.md)
            fileName: file.name,      // Tên gốc để load Audio
            path: itemRelativePath,
            hasAudio: containsTimeSlap
        });
    });

    return result;
}

function main() {
    console.log("🚀 Đang quét và sắp xếp theo ngày SỬA ĐỔI MỚI NHẤT...");
    
    try {
        const tree = scanDirectory(TEXTS_DIR);
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(tree, null, 2), 'utf-8');
        console.log("---------------------------------------");
        console.log(`✅ Đã xong! File lưu tại: ${OUTPUT_FILE}`);
    } catch (err) {
        console.error("❌ Lỗi:", err.message);
    }
}

main();
