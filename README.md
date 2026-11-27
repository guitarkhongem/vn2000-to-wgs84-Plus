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
- **Nền hành chính Việt Nam** khi thu nhỏ bản đồ: 34 tỉnh, thành phố mới, biên giới, QĐ. Hoàng Sa, QĐ. Trường Sa;
  cho biết điểm thuộc tỉnh mới nào.
- **Lớp từ file**: mở KML / KMZ, DXF (AutoCAD), DGN MicroStation V7 và V8 chồng lên bản đồ; file CAD VN-2000 hỏi kinh tuyến trục mỗi lần mở, chữ TCVN3 tự đổi Unicode;
- **Giá đất 2026** (NQ 12/2025/NQ-HĐND, 78 xã phường): đoạn đường dò theo mạng đường OSM, tô màu theo giá;
  giá các đoạn gần thửa sau khi chuyển đổi; tra cứu theo xã / tên đường.

## Nguồn dữ liệu

| Dữ liệu | Nguồn |
|---|---|
| Nền hành chính (zoom ≤ 9) | Bản đồ hành chính Việt Nam tỷ lệ 1:1.000.000, Cục Đo đạc, Bản đồ và Thông tin địa lý Việt Nam (02/2025); ranh tỉnh theo NQ 202/2025/QH15; biên tập: đề tài NV25-44, Trường ĐH Mỏ - Địa chất (chủ nhiệm TS Trần Trung Anh, 10/2025) |
| Bản đồ đường phố | © OpenStreetMap contributors (ODbL) |
| Ảnh vệ tinh | Esri World Imagery (Esri, Maxar, Earthstar Geographics) |
| Quy hoạch Hướng Hóa | Bản đồ điều chỉnh quy hoạch sử dụng đất đến năm 2030 huyện Hướng Hóa |
| Giá đất 2026 | Nghị quyết 12/2025/NQ-HĐND tỉnh Quảng Trị (bản tổng hợp Excel "BANG GIA DAT 2026"); hình đoạn đường dò theo mạng đường © OpenStreetMap contributors (Overpass API + dò tuyến ưu tiên đúng tên; một phần OSRM) |
| Tham số VN-2000 ⇄ WGS84 (7 tham số) | Quyết định số 05/2007/QĐ-BTNMT ngày 27/02/2007 của Bộ Tài nguyên và Môi trường: Về sử dụng hệ thống tham số tính chuyển giữa Hệ tọa độ quốc tế WGS-84 và Hệ tọa độ quốc gia VN-2000 (cũng là bộ EPSG:6960) |

Chi tiết: mục *Nguồn dữ liệu* trong [docs/HUONG_DAN.md](docs/HUONG_DAN.md).

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
