const fs = require('fs');
const path = require('path');

// CẤU HÌNH
const CONFIG = [
    {
        // Quét thư mục này
        sourceDir: path.join(__dirname, 'texts', 'dictation'),
        // Xuất ra file này
        outputFile: path.join(__dirname, 'dictation.json'),
        // Chỉ lấy các đuôi file này
        extensions: ['.txt', '.md', '.tsv']
    },
    {
        // Cấu hình cho Reading mode (nếu cần)
        sourceDir: path.join(__dirname, 'texts', 'typing'),
        outputFile: path.join(__dirname, 'index.json'),
        extensions: ['.txt', '.md']
    }
];

// Các file/folder hệ thống cần bỏ qua
const IGNORE_LIST = ['.DS_Store', 'Thumbs.db', '.git', 'node_modules'];

/**
 * Hàm đệ quy quét thư mục
 */
function scanDirectory(dirPath, extensions) {
    // Kiểm tra thư mục có tồn tại không
    if (!fs.existsSync(dirPath)) {
        console.warn(`⚠️  Thư mục không tồn tại: ${dirPath}`);
        return [];
    }

    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    const result = [];

    items.forEach(item => {
        // Bỏ qua file trong danh sách ignore
        if (IGNORE_LIST.includes(item.name)) return;

        // 1. Nếu là THƯ MỤC -> Đệ quy
        if (item.isDirectory()) {
            const subPath = path.join(dirPath, item.name);
            const children = scanDirectory(subPath, extensions);

            // Chỉ thêm folder nếu bên trong có file bài tập
            if (children.length > 0) {
                result.push({
                    name: item.name,
                    items: children
                });
            }
        }
        // 2. Nếu là FILE -> Kiểm tra đuôi file
        else if (item.isFile()) {
            const ext = path.extname(item.name).toLowerCase();
            if (extensions.includes(ext)) {
                result.push(item.name);
            }
        }
    });

    // Sắp xếp: Folder lên đầu, File xuống dưới (Hoặc A-Z tùy ý)
    return result.sort((a, b) => {
        const typeA = typeof a === 'object' ? 0 : 1; // 0 là folder, 1 là file
        const typeB = typeof b === 'object' ? 0 : 1;

        // Ưu tiên folder lên trước
        if (typeA !== typeB) return typeA - typeB;

        // Nếu cùng loại thì sort A-Z
        const nameA = typeA === 0 ? a.name : a;
        const nameB = typeB === 0 ? b.name : b;
        return nameA.localeCompare(nameB);
    });
}

/**
 * Hàm chạy chính
 */
function main() {
    console.log("🚀 Đang tạo danh sách bài tập...");

    CONFIG.forEach(cfg => {
        console.log(`\n📂 Đang quét: ${cfg.sourceDir}`);

        const data = scanDirectory(cfg.sourceDir, cfg.extensions);

        fs.writeFileSync(cfg.outputFile, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`✅ Đã tạo file: ${cfg.outputFile} (${data.length} mục gốc)`);
    });

    console.log("\n🎉 Hoàn tất!");
}

main();