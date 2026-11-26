# VN2000 ⇄ WGS84 Plus

Ứng dụng chuyển đổi toạ độ giữa hệ **VN-2000** (múi chiếu 3°) và **WGS84**, xem trên bản đồ,
tính diện tích, đối chiếu lớp quy hoạch Hướng Hóa và xuất file KML / DXF / CSV.

👉 **WebGIS:** https://guitarkhongem.github.io/vn2000-to-wgs84-Plus/
📖 **Hướng dẫn sử dụng:** [docs/HUONG_DAN.md](docs/HUONG_DAN.md) (cũng có nút *Hướng dẫn* ngay trong ứng dụng)

Repo này phát triển tiếp từ
[vn2000-to-wgs84-streamlit](https://github.com/guitarkhongem/vn2000-to-wgs84-streamlit)
(bản Streamlit đang chạy tại https://vn2000-wgs84.streamlit.app/), giữ nguyên thuật toán.

## Tính năng

- Chuyển đổi hai chiều VN-2000 ⇄ WGS84 (Helmert 7 tham số).
- Chọn kinh tuyến trục theo tỉnh hoặc nhập tay.
- Nhập toạ độ bằng cách dán hoặc mở file TXT/CSV. Hỗ trợ nhiều định dạng:
  `Tên X Y H`, `X Y H`, `X Y`, `X=… / Y=…`, `N…… E……`; chiều ngược lại `[Tên] Vĩ-độ Kinh-độ [H]`.
- Bản đồ nền giao thông / vệ tinh, nối điểm, chiều dài cạnh, chu vi.
- Diện tích theo VN-2000 (Shoelace) và WGS84 (trắc địa) để so sánh.
- Lớp quy hoạch Hướng Hóa (Điều chỉnh QHSDĐ đến 2030, ~19 800 thửa): **tô đúng màu bản đồ quy hoạch**,
  có **loại đất** từng thửa và chú giải; cho biết thửa của bạn nằm trong loại đất nào.
- Xuất CSV (Excel), KML (Google Earth), DXF (AutoCAD).

## Hai phiên bản trong repo

| | WebGIS (`docs/`) | Streamlit (`app.py`) |
|---|---|---|
| Chạy ở | Trình duyệt, đăng bằng GitHub Pages | Máy chủ Python (Streamlit Cloud) |
| Mở nhanh, không "ngủ" | ✔ | ✘ |
| Lớp quy hoạch | Toàn bộ (PMTiles) | Trong bán kính quanh điểm |
| Kiểm thử | [`docs/tests.html`](docs/tests.html) | `pytest` |

Hai bản dùng **cùng thuật toán** và cho cùng kết quả (có test đối chiếu).

## Đăng WebGIS lên mạng

1. **Settings → Pages → Deploy from a branch → `main` / `/docs`** → Save.
2. **Actions → Build planning tiles → Run workflow** để tạo lớp quy hoạch
   `docs/data/quyhoach.pmtiles` (workflow tự chạy lại khi dữ liệu / thuật toán thay đổi).
   Nếu bước commit báo lỗi quyền: **Settings → Actions → General → Workflow permissions → Read and write**.

## Chạy bản Streamlit trên máy

```bash
pip install -r requirements.txt
streamlit run app.py
```

## Kiểm thử

```bash
pip install -r requirements.txt -r requirements-dev.txt
pytest
```

Test JS: mở `docs/tests.html` bằng trình duyệt — phải hiện "Tất cả … test đều đạt".

## Ghi chú cho người phát triển

Xem [CLAUDE.md](CLAUDE.md) — cấu trúc code, quy ước và các quy tắc khi sửa (dùng được cho cả
người và trợ lý AI).

## Tác giả

Trần Trường Sinh · 0917.750.555

Nguồn công thức: *Công tác tính chuyển toạ độ trong công nghệ máy bay không người lái có định vị tâm chụp
chính xác* — Trần Trung Anh, Quách Mạnh Tuấn (Hội nghị KH Quốc gia về Công nghệ Địa không gian).
