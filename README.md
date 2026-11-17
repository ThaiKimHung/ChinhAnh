# ChinhAnh — LK Magic Web Studio

Ứng dụng web chỉnh sửa ảnh Studio tối (Dark UI) chạy trực tiếp trên trình duyệt (React + Vite + Tailwind CSS + HTML5 Canvas + `@imgly/background-removal`).

## Tính năng chính

- **Chỉnh màu sắc & Preset Studio:** 8 preset màu (Studio Trong Trẻo, Cưới Hàn Quốc, Nắng Ấm, Film Cổ Điển, Chân Dung Sáng Da, Tông Lạnh, Đen Trắng) và 10 thanh trượt chi tiết (Exposure, Contrast, Highlights, Shadows, Temp, Tint, Saturation, Vibrance, Sharpen, Vignette).
- **Chỉnh chân dung (Portrait Retouch):** Làm mịn da tự động giữ chi tiết mắt/tóc, làm sáng da, hồng hào, kèm cọ mịn da và cọ xóa mụn/khuyết điểm thủ công.
- **Nắn bóp thủ công (Liquify):** Đẩy (Push), Thu nhỏ (Pinch), Phóng to (Bloat) và Khôi phục vùng.
- **Xóa vật thể thừa:** Tô xóa tự động (Exemplar Patch Inpainting) và Nhân bản vùng (Clone Stamp).
- **Tách nền AI & Hậu cảnh:** Tách nền tự động ngay trên trình duyệt bằng `@imgly/background-removal`, hỗ trợ nền trong suốt (PNG), xóa phông Bokeh, nền màu đơn sắc và ghép ảnh nền.
- **Cắt, xoay, lật & Chữ/Khung viền:** Cắt theo tỷ lệ chuẩn, xoay 90°, lật ngang/dọc, thêm chữ watermark, khung viền và xuất ảnh JPG / PNG / WebP.
- **Công cụ Studio:** Kéo thả nhiều ảnh (Filmstrip), Zoom/Pan, chia đôi Trước/Sau, giữ để xem ảnh gốc, Undo/Redo (`Ctrl+Z` / `Ctrl+Y`).

## Cài đặt & chạy

```bash
npm install
npm run dev
```

Build production:

```bash
npm run build
```
