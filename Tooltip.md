Dựa trên mã nguồn bạn cung cấp (đặc biệt là file `scripts/utils.js` hàm `convertInlineFootnotes` và `scripts/tooltip.js`), dưới đây là giải thích chi tiết về cách chương trình xử lý tooltip và quy chuẩn cấu trúc file đầu vào.

---

### 1. Cơ chế hoạt động (Technical Flow)

Chương trình không sử dụng cơ chế Markdown Footnote chuẩn (thường nằm cuối trang) mà sử dụng cơ chế **Inline Footnote** (Chú thích nội dòng) được xử lý tùy chỉnh trước khi render ra HTML.

Quy trình xử lý như sau:

1.  **Pre-parsing (`scripts/utils.js`):**
    *   Trước khi văn bản được đưa vào thư viện `marked.js` để chuyển thành HTML, hàm `convertInlineFootnotes` sẽ quét chuỗi văn bản gốc.
    *   Nó tìm kiếm ký tự đặc biệt: `^[` (bắt đầu chú thích) và `]` (kết thúc chú thích).

2.  **Detection Logic (Thuật toán nhận diện):**
    Chương trình nhìn ngược lại (backwards) từ vị trí `^[` để xác định xem chú thích này thuộc về cái gì. Có 3 trường hợp:
    *   **Cụm từ (Phrase):** Nếu ngay trước đó là thẻ in đậm `**...**`. Chương trình sẽ lấy toàn bộ nội dung trong cặp `**`.
    *   **Câu (Sentence):** Nếu ngay trước đó là dấu câu (`.`, `!`, `?`, `;`). Chương trình sẽ lấy đoạn văn bản từ dấu câu đó ngược về dấu câu trước đó.
    *   **Từ đơn (Word - Mặc định):** Nếu không rơi vào 2 trường hợp trên, nó sẽ tìm khoảng trắng gần nhất và lấy từ đó.

3.  **HTML Injection:**
    *   Đoạn văn bản được chọn sẽ được bao bọc bởi thẻ:
        `<span class="tooltip-word" data-note="Nội dung chú thích">Văn bản gốc</span>`
    *   Thuộc tính `data-note` chứa nội dung hiển thị trong Tooltip.

4.  **Hiển thị (`scripts/tooltip.js`):**
    *   Khi người dùng Hover chuột hoặc khi con trỏ gõ phím đi vào vùng của thẻ `<span>` này, JS sẽ đọc `data-note` và hiển thị nó lên `#globalTooltip`.

---

### 2. Cấu trúc chuẩn file đầu vào (Standard Input Syntax)

Để Tooltip hoạt động chính xác, bạn cần soạn thảo file nội dung (`.txt`, `.md`, hoặc cột Text trong `.tsv` của Dictation) theo quy tắc sau:

Cú pháp gốc: `Đối tượng^[Nội dung chú thích]`

#### Trường hợp 1: Chú thích cho MỘT TỪ (Word)
Viết liền `^[` ngay sau từ cần chú thích. Không được có khoảng trắng giữa từ và dấu `^[`.

*   **Cấu trúc:** `Word^[Note]`
*   **Ví dụ:**
    ```text
    She ate an apple^[một loại quả màu đỏ] yesterday.
    ```
    -> Tooltip sẽ hiện khi hover vào chữ "apple".

#### Trường hợp 2: Chú thích cho CỤM TỪ (Phrase/Idiom) - *Khuyên dùng*
Để chú thích cho một cụm từ có dấu cách, bạn **BẮT BUỘC** phải bọc cụm từ đó trong dấu in đậm `**...**`.

*   **Cấu trúc:** `**Cụm từ cần giải thích**^[Note]`
*   **Ví dụ:**
    ```text
    I **look forward to**^[mong đợi] meeting you.
    ```
    -> Tooltip sẽ hiện cho cả cụm "look forward to". Chữ vẫn sẽ được in đậm.

#### Trường hợp 3: Chú thích cho cả CÂU (Sentence)
Đặt chú thích ngay sau dấu kết thúc câu (`.`, `!`, `?`).

*   **Cấu trúc:** `Câu hoàn chỉnh.^[Note]`
*   **Ví dụ:**
    ```text
    It's raining cats and dogs.^[Trời mưa rất to]
    ```
    -> Tooltip sẽ hiện cho cả câu (Logic này dựa vào dấu chấm câu, nhưng đôi khi kém chính xác hơn cách dùng in đậm).

---

### 3. Ví dụ mẫu File đầu vào (`sample.txt`)

Dưới đây là một đoạn văn bản mẫu chuẩn để bạn copy vào file text:

```markdown
# Learning English

## Vocabulary
This is a simple paragraph to test the tooltip system.
The architecture^[kiến trúc] of this building is amazing.
The programmer wrote a complex algorithm^[thuật toán].

## Idioms (Phrase)
She decided to **call off**^[hủy bỏ] the meeting due to bad weather.
Please **keep an eye on**^[để mắt đến/trông chừng] my bag while I'm away.

## Sentence Translation
Time flies when you're having fun.^[Thời gian trôi nhanh khi bạn vui vẻ]
**Don't judge a book by its cover.**^[Đừng đánh giá qua vẻ bề ngoài]
```

### 4. Lưu ý quan trọng khi soạn thảo

1.  **Tránh ký tự đặc biệt trong Note:** Trong phần nội dung chú thích `^[...]`, hạn chế dùng các ký tự ngoặc vuông `[` hoặc `]` khác, vì nó có thể làm gãy parser (parser tìm dấu `]` đóng đầu tiên).
2.  **Khoảng trắng:**
    *   ĐÚNG: `apple^[táo]`
    *   SAI: `apple ^[táo]` (Có dấu cách thừa -> Parser sẽ không nhận diện được từ "apple" mà coi như chú thích cho khoảng trắng hoặc bị lỗi).
3.  **Markdown bên trong Note:** Hiện tại code hỗ trợ `marked.parseInline(note)` trong file `tooltip.js`, nghĩa là bạn có thể dùng markdown đơn giản *bên trong* chú thích.
    *   Ví dụ: `word^[Nghĩa là *từ*]` -> Chữ "từ" sẽ in nghiêng trong tooltip.