# ChinhAnh — LK Magic Web Studio

Ứng dụng web chỉnh sửa ảnh Studio tối (Dark UI) chạy trực tiếp trên trình duyệt (React + Vite + Tailwind CSS + HTML5 Canvas + `@imgly/background-removal`).

## Tính năng chính

- **Chỉnh màu sắc & Preset Studio:** 8 preset màu (Studio Trong Trẻo, Cưới Hàn Quốc, Nắng Ấm, Film Cổ Điển, Chân Dung Sáng Da, Tông Lạnh, Đen Trắng) và 10 thanh trượt chi tiết (Exposure, Contrast, Highlights, Shadows, Temp, Tint, Saturation, Vibrance, Sharpen, Vignette).
- **Chỉnh chân dung (Portrait Retouch):** Làm mịn da tự động giữ chi tiết mắt/tóc, làm sáng da, hồng hào, kèm cọ mịn da và cọ xóa mụn/khuyết điểm thủ công.
- **Nắn bóp thủ công (Liquify):** Đẩy (Push), Thu nhỏ (Pinch), Phóng to (Bloat) và Khôi phục vùng.
- **Xóa vật thể thừa:** Tô xóa tự động (Exemplar Patch Inpainting) và Nhân bản vùng (Clone Stamp).
- **Tách nền AI & Hậu cảnh:** Tách nền tự động ngay trên trình duyệt bằng `@imgly/background-removal`, hỗ trợ nền trong suốt (PNG), xóa phông Bokeh, nền màu đơn sắc và ghép ảnh nền.
- **Cắt, xoay, lật & Chữ/Khung viền:** Cắt theo tỷ lệ chuẩn, xoay 90°, lật ngang/dọc, thêm chữ watermark, khung viền và xuất ảnh JPG / PNG / WebP.
- **Công cụ Studio:** Kéo thả nhiều ảnh (Filmstrip), Zoom/Pan, chia đôi Trước/Sau, giữ để xem ảnh gốc, Undo/Redo (`Ctrl+Z` / `Ctrl+Y`), xuất hàng loạt cả Filmstrip thành tệp ZIP.
- **Xử lý bằng GPU:** Chỉnh màu, làm đẹp da và làm nét chạy trên WebGL2 (nhanh hơn 10–40 lần), tự quay về CPU nếu trình duyệt không hỗ trợ.
- **Ảnh iPhone (HEIC/HEIF):** Tự chuyển sang JPEG khi mở trên trình duyệt không đọc được HEIC.
- **Điện thoại & cảm ứng:** Chụm hai ngón để phóng to/thu nhỏ và kéo ảnh.
- **Cài như ứng dụng (PWA):** Cài lên màn hình chính, dùng được khi mất mạng sau lần mở đầu; tách nền AI cũng chạy offline sau lần dùng đầu tiên. Bản nháp được lưu tự động trên thiết bị.

## Cài đặt & chạy

```bash
npm install
npm run dev
```

Build production:

```bash
npm run build
```

Kiểm tra:

```bash
npm run lint
npm test
```

## Triển khai lên GitHub Pages

Workflow `.github/workflows/deploy-pages.yml` tự build và đăng app mỗi khi đẩy lên nhánh `main`. Chỉ cần bật một lần: **Settings → Pages → Source: GitHub Actions**. App sẽ có địa chỉ `https://<tài-khoản>.github.io/<tên-repo>/`.

Khi tự host ở một đường dẫn con, đặt biến `BASE_PATH` lúc build, ví dụ `BASE_PATH=/ChinhAnh/ npm run build`.

## Cấu trúc mã nguồn

- `src/App.jsx`: trạng thái editor và luồng thao tác chính.
- `src/hooks/`: lịch sử undo (giới hạn theo RAM), bản nháp, phím tắt, preset cá nhân.
- `src/components/`: thanh công cụ, canvas, filmstrip, hộp thoại xuất ảnh; `components/panels/` gồm bảng điều chỉnh của từng tab.
- `src/engine/`: xử lý ảnh (CPU `imagePipeline.js`, GPU `gpuPipeline.js`), xóa vật thể, tách nền, xuất ảnh, lưu nháp.
- `public/sw.js`, `public/manifest.webmanifest`: chế độ offline và cài đặt PWA.
