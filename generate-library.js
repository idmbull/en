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
 * Lấy thời gian commit ĐẦU TIÊN (Ngày tạo file trên Git)
 */
function getGitCreationTime(filePath) {
    try {
        const dir = path.dirname(filePath);
        const base = path.basename(filePath);
        
        // Lấy toàn bộ lịch sử timestamp của file
        const cmd = `git log --follow --format=%at -- "${base}"`;
        
        const output = execSync(cmd, { 
            cwd: dir, 
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore']
        }).trim();

        if (output) {
            // Output là danh sách timestamp (Mới nhất -> Cũ nhất)
            // Vì ta muốn lấy "Ngày tạo" (Creation Date), ta lấy dòng cuối cùng
            const timestamps = output.split('\n').filter(line => line.trim() !== '');
            if (timestamps.length > 0) {
                const firstCommit = timestamps[timestamps.length - 1];
                return parseInt(firstCommit, 10);
            }
        }
        
        // Fallback: Nếu không có git history
        return fs.statSync(filePath).birthtimeMs / 1000;

    } catch (e) {
        return fs.statSync(filePath).birthtimeMs / 1000;
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

    // 2. Lấy thời gian Git cho từng file
    const filesWithDate = files.map(file => {
        const fullPath = path.join(currentPath, file.name);
        const createdTime = getGitCreationTime(fullPath);
        
        return {
            fileItem: file,
            fullPath: fullPath,
            createdTime: createdTime
        };
    });

    // [THAY ĐỔI Ở ĐÂY] 3. Sắp xếp file: MỚI NHẤT lên ĐẦU (Descending)
    // b - a = Số lớn (mới hơn) đứng trước
    filesWithDate.sort((a, b) => b.createdTime - a.createdTime);

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
        // Bài Mới Nhất sẽ là 01
        const prefix = String(index + 1).padStart(2, '0');
        const numberedName = `${prefix}. ${file.name}`; 
        
        const containsTimeSlap = hasTimestamps(item.fullPath);

        result.push({
            name: numberedName,       // Tên hiển thị (01. Bai moi nhat.md)
            fileName: file.name,      // Tên gốc để load Audio (Bai moi nhat.md)
            path: itemRelativePath,
            hasAudio: containsTimeSlap
        });
    });

    return result;
}

function main() {
    console.log("🚀 Đang quét và sắp xếp từ MỚI NHẤT đến CŨ NHẤT...");
    
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
