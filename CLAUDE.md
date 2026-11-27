# CLAUDE.md — Hướng dẫn cho AI khi làm việc với repo này

Ứng dụng chuyển đổi toạ độ **VN-2000 ⇄ WGS84** cho bất động sản huyện Hướng Hóa (Quảng Trị),
gồm hai bản cùng thuật toán: **WebGIS** (`docs/`, GitHub Pages:
https://guitarkhongem.github.io/vn2000-to-wgs84-Plus/) và **Streamlit** (`app.py`).
Repo `guitarkhongem/vn2000-to-wgs84-Plus`, phát triển tiếp từ `guitarkhongem/vn2000-to-wgs84-streamlit`
(bản Streamlit cũ chạy tại https://vn2000-wgs84.streamlit.app/).
Hướng dẫn cho người dùng: **`docs/HUONG_DAN.md`** — nguồn duy nhất, `docs/huong-dan.html` đọc và hiển thị
file này (thư viện marked). Thêm / đổi tính năng thì cập nhật `docs/HUONG_DAN.md`.

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
| `data/QHHUONGHOA_30.geojson` | Quy hoạch Hướng Hóa (Điều chỉnh QHSDĐ đến 2030): EPSG:9212 (VN-2000 TM-3, lon0 = 106.25), toạ độ [Đông, Bắc], 19 809 polygon, ~1 triệu đỉnh. Thuộc tính `ma_dat`, `ten_dat`, `mau` (màu gốc), `nguon` (`nhan` / `mau` / `nhom` / null) |
| `scripts/build_basemap_nv2544.py` | Tạo `docs/data/nen_hanhchinh.geojson` (nền hành chính WebGIS) từ shapefile của đề tài NV25-44 (Lambert *BD1trieu_VN2000*, kinh tuyến 108°). Đổi hệ: Lambert ngược → TM-3 kinh tuyến gần nhất → **gọi nguyên** `vn2000_to_wgs84_baibao`. Thuần Python. Dữ liệu gốc **không nằm trong repo** (máy tác giả: `Desktop\Trung Anh\NV25-44 QGIS\NV25-44 QGIS\Data`) |
| `scripts/build_giadat_2026.py` | Tạo `docs/data/giadat_2026.json` (bảng giá đất 2026: PL I nông nghiệp theo xã, PL II đất ở, PL III TMDV/SXKD theo đoạn đường) từ `BANG GIA DAT 2026.xlsm` (**không nằm trong repo**; máy tác giả: `C:\Users\msi\Downloads`). Đọc toạ độ từ liên kết Google Maps (`data/giadat_link_rut_gon.json` giải các link rút gọn), ghép hình tuyến từ `data/giadat_tuyen.json`, phân loại chất lượng `cl` = `tot` / `xem_lai` / `thang`. Cần `openpyxl` |
| `scripts/do_tuyen_giadat.js` | Dò tuyến OSRM (routing.openstreetmap.de, hồ sơ foot, ~1 yêu cầu/giây, chỉ dò đoạn chưa có) → `data/giadat_tuyen.json` (hồ sơ `di_bo`) |
| `scripts/do_tuyen_giadat_osm.py` | Dò tuyến trên máy từ mạng đường OSM tải qua Overpass (file JSON `{nguon, ways:[{h,n,r,g}]}`, **không nằm trong repo**; máy tác giả: `Downloads\osm_duong_quangtri.json`): Dijkstra, cạnh trùng tên × 1,0, khác tên × 1,6 → hồ sơ `osm_ten` trong `data/giadat_tuyen.json`. Thuần Python |
| `scripts/extract_landuse_mapinfo.py` | Tạo file trên từ bản MapInfo gốc (`Level 30` = vùng tô màu, `Level 33` = nhãn mã đất) + `docs/data/quyhoach_chugiai.json`. Cần `pyogrio` (requirements-dev). Bản MapInfo **không nằm trong repo** (máy tác giả: `Desktop\Thay Tien\MAP`) |
| `assets/` | Logo, ảnh nền cho bản Streamlit |
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
| `docs/js/thongke.js`, `thongke-config.js` | *Thống kê truy cập*: khi `window.VN_THONGKE_API` (trong `thongke-config.js`, rỗng = tắt) có giá trị, mỗi lần nạp trang `sendBeacon` `POST /hit` thân `text/plain` `{"moi":0|1}` (moi = lần đầu trong ngày giờ VN, nhớ bằng localStorage `vn_tk_ngay`); bỏ qua khi Do Not Track / GPC / cờ `vn_tk_bo_qua`. Dòng chữ `#tk-mo` chỉ hiện khi URL có `?thongke`/`#thongke` (nhớ `vn_tk_admin`), bấm → hộp `<dialog id="tk-dlg">`: `GET /stats?tu=&den=` với `Authorization: Bearer <ADMIN_KEY>`, bảng quốc gia/thành phố, cột theo ngày (`VN.tkDayNgay` điền ngày trống), lớp `tk-diem` trên bản đồ, CSV. `app.js` gọi `VN.thongKeInit(map, helpers)`; nút chiều chuyển đổi trong `app.js` chọn bằng `.segmented button[data-dir]` (đừng bỏ `[data-dir]` — hộp thống kê cũng có `.segmented`). Máy chủ: `cloudflare/worker.js` + `schema.sql` (D1, bảng `luot` khoá ngày×quốc gia×thành phố; vị trí từ `request.cf`, không lưu IP), hướng dẫn dựng `cloudflare/HUONG_DAN.md` |
| `docs/js/ocrtoado.js` | *Nhận dạng toạ độ từ ảnh*: Tesseract.js 7 (jsDelivr, nạp khi dùng, PSM 11, đầu ra TSV), 2 lượt (chữ sáng tách ngưỡng / ảnh xám) gộp theo vị trí; `VN.ocrTimToaDo` tách số → lat/lon (≥4 số lẻ, 5–25 / 100–120 hoặc có N/E), X/Y (7/6 chữ số có số lẻ), h (có "m"), DMS; ghép cặp gần nhất. Người dùng duyệt trong hộp thoại rồi `app.js` đưa vào khung + Chuyển đổi |
| `docs/js/chupanh.js` | *Chụp ảnh có toạ độ*: `input capture` mở camera, vị trí = GPS EXIF của ảnh (`VN.docExif`) hoặc `getCurrentPosition`; vẽ ảnh + dải chữ (`VN.dongChu`: WGS84, VN-2000 qua `VN.wgs84ToVn2000`, tỉnh, giờ, ghi chú) lên canvas; lưu JPEG kèm EXIF GPS (`VN.ghiExif`); Web Share. `app.js` gọi `VN.chupAnhInit(map, helpers)` |
| `docs/js/lopfile.js` | *Lớp từ file*: KML/KMZ (DOMParser, giải nén ZIP bằng `DecompressionStream`), DXF (`VN.parseDxf`, bung khối INSERT, cung bulge), DGN V7 (`VN.parseDgn`, theo mô tả định dạng của GDAL dgnlib: int32 thứ tự VAX, VAX D-float, TCB → UOR/gốc), TCVN3 → Unicode (`VN.tcvn3`). DGN V8 (`VN.parseDgnV8`, tự giải mã — không có tài liệu công khai): vỏ OLE (`VN.cfbRead`), mô hình `Dgn-Md/#000000`, `Dgn~Mh` nén zlib (UOR tại byte 4196, gốc toàn cục 4212/4220), luồng `Dgn^G/$n` = 16 byte + zlib chứa phần tử (kiểu byte 4, cờ byte 6 — 0x4000 thành phần phức, độ dài 4+2×u32@8, hết hình học 4+2×u32@12, level u32@16, toạ độ double từ byte 108; chữ: số byte u16@114, chuỗi @174 — `FF FE 01 00` + 8 bit TCVN3 hoặc `FF FE` + UTF-16; cao @140, góc (rad) @148, gốc @156). Kiểm chứng bằng DXF xuất từ cùng file. DWG (`VN.dwgToDxf`): nạp động `@mlightcad/libredwg-web@0.9.4` (LibreDWG, GPL) từ jsDelivr chỉ khi mở .dwg, gọi thẳng `wasmInstance.dwg_write_dxf` (chấp nhận mã lỗi không nghiêm trọng < 128), rồi `VN.parseDxf`. Không chép thư viện GPL vào repo. Đổi toạ độ bằng `VN.vn2000ToWgs84` (không tự viết lại công thức). Hàm thuần có test trong `tests.html`. `app.js` gọi `VN.lopFileInit(map, helpers)` |
| `docs/js/giadat.js`, `docs/data/giadat_2026.json` | Lớp *Giá đất 2026*: nguồn `gd`, lớp `gd-*` (từ zoom 11, màu theo đất ở VT1), đoạn gần tâm thửa (400 m), tra cứu theo xã / tên đường. Hàm thuần `VN.mauGia`, `VN.khoangCachToiDuong`, `VN.doanGanNhat`, `VN.boDau` có test trong `tests.html`. `app.js` gọi `VN.giadatInit(map, helpers)` và `VN.giadatRows(rows)` |
| `docs/data/nen_hanhchinh.geojson` | Nền hành chính VN (34 tỉnh, biên giới, Hoàng Sa, Trường Sa, nước láng giềng, nhãn), WGS84, thuộc tính `lop`; mục `nguon` ghi nguồn. Hiện ở zoom ≤ 9 (lớp `nen-*`), OSM / vệ tinh mờ dần vào từ zoom 8,5 → 10. Không có file → app giữ OSM ở mọi zoom |

### Lớp quy hoạch trên WebGIS

```
data/QHHUONGHOA_30.geojson ──(scripts/build_planning_geojson.py, dùng converter.py)──▶ build/quyhoach_wgs84.geojsonl
                           ──(tippecanoe, z10–16, layer "quyhoach")──▶ docs/data/quyhoach.pmtiles
```
- Chạy tự động bằng `.github/workflows/build-planning-tiles.yml` khi đổi dữ liệu / converter / script,
  hoặc bấm tay (Actions → Build planning tiles → Run workflow). Workflow tự commit file PMTiles.
- Đổi hệ bằng **chính `vn2000_to_wgs84_baibao`**, không dùng PROJ/GDAL — để ranh thửa khớp điểm tuyệt đối.
- Thuộc tính mỗi thửa: `id` (thứ tự trong file gốc, cũng là feature id), `dien_tich` (m², phẳng VN-2000),
  và `ma_dat`, `ten_dat`, `mau`, `nguon` lấy nguyên từ `data/QHHUONGHOA_30.geojson`.
- Trên web: `qh-fill` tô theo `["get","mau"]` (từ zoom 10), `qh-line` (từ zoom 12); feature-state `hit`
  viền cam thửa chứa **tâm thửa** (nếu < 3 điểm: mọi thửa chứa điểm). Tra bằng `querySourceFeatures` +
  `VN.pointInGeometry` (không phụ thuộc việc vẽ). Chú giải đọc `docs/data/quyhoach_chugiai.json`.
- Dữ liệu có vùng lớn (đường DGT…) bao / chồng vùng nhỏ → popup và danh sách ưu tiên thửa nhỏ nhất.
- Thử với file khác: `index.html?qh=duong-dan.geojson` (hoặc `.pmtiles`). Phải chạy qua http(s).

- **Python và JS phải cho cùng kết quả.** Sửa công thức ở một bên → sửa bên kia + cập nhật giá trị chốt
  ở cả `tests/test_converter.py` và `docs/tests.html`.
- Mở `index.html` bằng `file://` vẫn chạy, nhưng nên thử qua máy chủ http (vd `python -m http.server -d docs`).
- Không thêm bước build/npm nếu chưa thật cần.
- **Sửa file trong `docs/js` hoặc `docs/css` → tăng số `?v=…`** ở các thẻ `<script>`/`<link>` trong
  `index.html`, `huong-dan.html`, `tests.html`; nếu không, trình duyệt người dùng vẫn chạy bản cũ đã cache.
- PMTiles: tippecanoe `--use-attribute-for-id=id` biến `id` thành feature id và **bỏ khỏi properties** →
  nguồn vector KHÔNG dùng `promoteId`, đọc `feature.id`. Thử PMTiles trên máy cần máy chủ hỗ trợ
  HTTP Range (`python -m http.server` không hỗ trợ; GitHub Pages có).

## Nguồn dữ liệu

Mọi dữ liệu đưa vào app phải **ghi rõ nguồn** ở cả bốn chỗ: thuộc tính `attribution` của nguồn bản đồ
(hiện ở góc bản đồ), mục *Nguồn dữ liệu bản đồ* ở chân bảng điều khiển (`docs/index.html`), mục
*Nguồn dữ liệu* trong `docs/HUONG_DAN.md` và `README.md`, và docstring của script tạo dữ liệu.

## Quy tắc bắt buộc

1. **Không thay đổi thuật toán** trong `functions/converter.py`: hằng số elip, 7 tham số
   (dX, dY, dZ, rx, ry, rz, k) — nguồn: **Quyết định số 05/2007/QĐ-BTNMT** ngày 27/02/2007 của Bộ TN&MT về sử
   dụng hệ thống tham số tính chuyển giữa Hệ tọa độ quốc tế WGS-84 và Hệ tọa độ quốc gia VN-2000 —, k0 = 0.9999, y0 = 500000. Muốn sửa phải có nguồn đối chiếu
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
