# VN2000 ⇄ WGS84 Converter

Ứng dụng web chuyển đổi toạ độ giữa hệ **VN-2000** (múi chiếu 3°) và **WGS84**,
hiển thị lên bản đồ, tính diện tích và xuất file KML / DXF / CSV.

👉 Dùng thử: https://vn2000-wgs84.streamlit.app/

## Tính năng

- Chuyển đổi hai chiều VN-2000 ⇄ WGS84 (Helmert 7 tham số).
- Chọn kinh tuyến trục theo tỉnh hoặc nhập tay.
- Nhập toạ độ bằng cách dán hoặc tải file TXT/CSV. Hỗ trợ nhiều định dạng:
  `STT X Y H`, `X Y H`, `X Y`, `X=… / Y=…`, `N…… E……`.
- Hiển thị điểm trên bản đồ (giao thông / vệ tinh), nối điểm, hiện chiều dài cạnh.
- Tính diện tích theo VN-2000 (Shoelace) và WGS84 (Geodesic) để so sánh.
- Xuất CSV, KML (Google Earth), DXF (AutoCAD).

## Bản WebGIS (mới)

Thư mục [`docs/`](docs/) là bản web chạy hoàn toàn trên trình duyệt (MapLibre GL), không cần máy chủ:
mở nhanh, không "ngủ", dùng tốt trên điện thoại. Cùng thuật toán với bản Streamlit
(kiểm chứng bằng [`docs/tests.html`](docs/tests.html)).

Đăng lên GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / `/docs`**.

Lớp quy hoạch Hướng Hóa (~19 800 thửa) được GitHub Actions tự chuyển thành
`docs/data/quyhoach.pmtiles` mỗi khi dữ liệu thay đổi (xem `.github/workflows/build-planning-tiles.yml`).

## Chạy trên máy

```bash
pip install -r requirements.txt
streamlit run app.py
```

## Kiểm thử

```bash
pip install -r requirements-dev.txt
pytest
```

## Ghi chú cho người phát triển

Xem [CLAUDE.md](CLAUDE.md) — cấu trúc code, quy ước và các quy tắc khi sửa (dùng được cho cả
người và trợ lý AI).
