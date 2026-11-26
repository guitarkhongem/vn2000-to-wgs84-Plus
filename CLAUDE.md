# CLAUDE.md — Hướng dẫn cho AI khi làm việc với repo này

Ứng dụng Streamlit chuyển đổi toạ độ **VN-2000 ⇄ WGS84** cho bất động sản huyện Hướng Hóa
(Quảng Trị). Bản chạy thật: https://vn2000-wgs84.streamlit.app/ (tự deploy khi push lên `main`).

Ngôn ngữ giao diện và comment: **tiếng Việt**.

## Chạy và kiểm tra

```bash
pip install -r requirements.txt -r requirements-dev.txt
streamlit run app.py      # chạy app
pytest                    # chạy test — PHẢI xanh trước khi commit
```

## Cấu trúc

| File | Vai trò |
|---|---|
| `app.py` | Toàn bộ giao diện: nhập liệu → chuyển đổi → bảng/xuất file → bản đồ |
| `functions/converter.py` | **Lõi thuật toán** VN2000 ⇄ WGS84 (Helmert 7 tham số + TM). Thuần Python |
| `functions/parse.py` | `parse_coordinates` (VN2000, nhiều định dạng) và `parse_wgs84` |
| `functions/lon0_selector.py` | Bảng kinh tuyến trục theo tỉnh + widget chọn `lon0` |
| `functions/area.py` | Diện tích: Shoelace (VN2000) và Geodesic (WGS84) |
| `functions/edges.py`, `markers.py`, `polygon.py` | Vẽ lên bản đồ folium |
| `functions/kml.py`, `export_dxf.py` | Xuất KML, DXF (ezdxf) |
| `functions/sort_utils.py` | Sắp tên điểm theo số tự nhiên |
| `functions/background.py`, `footer.py` | Trang trí |
| `functions/planning_layer.py` | Lớp quy hoạch: nạp GeoJSON, tìm thửa gần điểm (STRtree), đổi sang WGS84, vẽ folium |
| `data/QHHUONGHOA_30.geojson` | Quy hoạch Hướng Hóa: EPSG:9212 (VN-2000 TM-3, lon0 = 106.25), toạ độ [Đông, Bắc], ~19 800 polygon, ~1 triệu đỉnh, **không có thuộc tính loại đất** |
| `MAP/` | Bản MapInfo gốc (các lớp `Level N`), cũng không có thuộc tính; chưa dùng |
| `tests/` | pytest |

Module **chưa được dùng** (để lại, đừng xoá nếu chưa hỏi): `mapgen.py`, `ocr.py` (cần `easyocr`,
không có trong requirements), `shoelace_area.py` (trùng `area.py`), `logger.py`,
`compute_edge_lengths` trong `EdgeLengths.py`.

## WebGIS (thư mục `docs/`) — bản web tĩnh, thay dần Streamlit

Chạy hoàn toàn trên trình duyệt, đăng bằng GitHub Pages (Settings → Pages → branch `main`, thư mục `/docs`).
Không cần build: HTML + JS thuần, thư viện lấy từ CDN (MapLibre GL 4.7.1, geographiclib-geodesic 2.0.0).

| File | Vai trò |
|---|---|
| `docs/index.html`, `css/style.css` | Giao diện: bảng điều khiển trái (điện thoại: dưới bản đồ) + bản đồ |
| `docs/js/converter.js` | **Bản JS của `functions/converter.py`** — chép nguyên công thức |
| `docs/js/parse.js` | Bản JS của `functions/parse.py` |
| `docs/js/geo.js` | Bảng kinh tuyến trục, sắp tên điểm, Shoelace, diện tích/độ dài trắc địa |
| `docs/js/export.js` | Xuất CSV (có BOM), KML, DXF R12 (tên tiếng Việt ghi dạng `\U+XXXX`) |
| `docs/js/app.js` | Ghép giao diện + bản đồ. Lưu tạm lựa chọn người dùng trong localStorage |
| `docs/tests.html` | Test JS, mở trực tiếp bằng trình duyệt — phải hiện "Tất cả … test đều đạt" |

### Lớp quy hoạch trên WebGIS

```
data/QHHUONGHOA_30.geojson ──(scripts/build_planning_geojson.py, dùng converter.py)──▶ build/quyhoach_wgs84.geojsonl
                           ──(tippecanoe, z10–16, layer "quyhoach")──▶ docs/data/quyhoach.pmtiles
```
- Chạy tự động bằng `.github/workflows/build-planning-tiles.yml` khi đổi dữ liệu / converter / script,
  hoặc bấm tay (Actions → Build planning tiles → Run workflow). Workflow tự commit file PMTiles.
- Đổi hệ bằng **chính `vn2000_to_wgs84_baibao`**, không dùng PROJ/GDAL — để ranh thửa khớp điểm tuyệt đối.
- Thuộc tính mỗi thửa: `id` (thứ tự trong file gốc, cũng là feature id), `dien_tich` (m², phẳng VN-2000).
- Trên web: `qh-fill`/`qh-line` (hiện từ zoom 12), feature-state `hit` tô cam các thửa chứa điểm
  hoặc tâm thửa. Tra bằng `querySourceFeatures` + `VN.pointInGeometry` (không phụ thuộc việc vẽ).
- Dữ liệu có vùng lớn bao vùng nhỏ chồng lên nhau → danh sách xếp thửa nhỏ trước.
- Thử với file khác: `index.html?qh=duong-dan.geojson` (hoặc `.pmtiles`). Phải chạy qua http(s).

- **Python và JS phải cho cùng kết quả.** Sửa công thức ở một bên → sửa bên kia + cập nhật giá trị chốt
  ở cả `tests/test_converter.py` và `docs/tests.html`.
- Mở `index.html` bằng `file://` vẫn chạy, nhưng nên thử qua máy chủ http (vd `python -m http.server -d docs`).
- Không thêm bước build/npm nếu chưa thật cần.

## Quy tắc bắt buộc

1. **Không thay đổi thuật toán** trong `functions/converter.py`: hằng số elip, 7 tham số
   (dX, dY, dZ, rx, ry, rz, k), k0 = 0.9999, y0 = 500000. Muốn sửa phải có nguồn đối chiếu
   và thêm test chứng minh.
2. Quy ước toạ độ VN-2000: **X = hướng Bắc**, **Y = hướng Đông** (có 500 000 m). Đừng đảo.
3. Giữ tách lớp: logic tính toán/đọc dữ liệu nằm trong `functions/`, **không import
   `streamlit`** ở đó (trừ các file UI: `lon0_selector`, `background`, `footer`).
   `app.py` chỉ ghép giao diện.
4. Thêm hàm tính toán mới → thêm test trong `tests/`.
5. Trạng thái giữa các lần rerun lưu trong `st.session_state`:
   - `df`: bảng kết quả gần nhất
   - `textout`: kết quả dạng text
   - `xy`: XY VN-2000 gốc, cùng index với `df` (chỉ có ở chiều VN2000 → WGS84)
   - `lon0_value`, `province_select`, `join_points`, `show_lengths`
   - `show_planning`, `planning_radius` (lớp quy hoạch)
8. Lớp quy hoạch: **không vẽ cả file** lên bản đồ (quá nặng cho trình duyệt). Luôn lọc theo
   bán kính quanh điểm qua `PlanningLayer.nearby`. Đối tượng `PlanningLayer` được nạp một lần bằng
   `st.cache_resource` trong `app.py`. Truy vấn luôn đổi WGS84 → hệ của lớp (lon0 = 106.25),
   không dùng lon0 người dùng chọn.
6. Dữ liệu đầu vào lấy từ người dùng: luôn báo lỗi dòng sai cho người dùng thấy,
   không nuốt lỗi bằng `except:` trần.
7. Thay đổi phụ thuộc → cập nhật `requirements.txt` (Streamlit Cloud cài từ file này).

## Cách làm việc mong muốn

- Thay đổi nhỏ, mỗi lần một việc, mô tả commit rõ ràng bằng tiếng Việt
  (vd: `Sửa: đọc WGS84 thiếu H`), không dùng `Update app.py` hay số `2`, `3`.
- Trước khi sửa giao diện, đọc `app.py` từ đầu đến cuối — thứ tự các khối quyết định layout.
