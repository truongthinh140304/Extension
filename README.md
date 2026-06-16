# Side Panel

Chrome Extension MV3 dùng để scan board monday.com hiện tại vào side panel và hiển thị thống kê của board.

## Cài đặt

```bash
pnpm install
```

## Build

```bash
pnpm build
```

Output của extension sẽ được tạo trong thư mục `dist`.

## Load vào Chrome hoặc Edge

1. Mở `chrome://extensions` hoặc `edge://extensions`.
2. Bật Developer mode.
3. Bấm Load unpacked.
4. Chọn thư mục `dist`.

## Kiểm thử trên monday.com

1. Mở một board trên monday.com.
2. Reload board một lần sau khi cài extension để content script được inject vào trang.
3. Bấm icon extension. Chrome sẽ mở side panel.
4. Bấm Scan current board.

## Side Panel

Side panel hiển thị trạng thái kết nối, các thao tác scan và thống kê của board.

Kết quả scan được lưu trong `chrome.storage.local`, nhờ đó thống kê gần nhất có thể được khôi phục khi side panel được mở lại. Dữ liệu board được xử lý cục bộ trong trình duyệt của bạn và không được gửi tới dịch vụ bên ngoài.

## Giới hạn của DOM scraping

monday.com là một web app phức tạp và có thể thay đổi cấu trúc DOM bất kỳ lúc nào. Scraper tránh phụ thuộc vào các class name dạng hash, ưu tiên dùng role, aria label, data attribute, link và text đang hiển thị, nhưng vẫn có thể bỏ sót các row bị ẩn, row được virtualize, custom column hoặc layout không được render trên màn hình.

## Khi nào nên dùng monday API

Hãy dùng monday GraphQL API chính thức khi bạn cần dữ liệu toàn board một cách đáng tin cậy, bao gồm row bị ẩn, tất cả column, automation, phân trang hoặc báo cáo dùng cho production. Extension này không đọc token/cookie/session data từ monday.com.
