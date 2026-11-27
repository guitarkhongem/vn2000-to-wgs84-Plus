# Hướng dẫn sử dụng VN2000 ⇄ WGS84

Địa chỉ: **https://guitarkhongem.github.io/vn2000-to-wgs84-Plus/** — mở được trên máy tính và điện thoại,
không cần cài đặt.

## 1. Bố cục màn hình

- **Máy tính:** bảng điều khiển bên trái, bản đồ bên phải. **Kéo thanh dọc** giữa hai phần để nới / thu
  bảng điều khiển (bấm đúp thanh để về mặc định; dùng được cả phím ← →).
- **Điện thoại:** bản đồ ở trên, bảng điều khiển bên dưới; **kéo thanh ngang** dưới bản đồ để đổi chiều cao
  bản đồ.
- **Cỡ chữ:** nút **A−** / **A+** dưới tiêu đề (90 % – 175 %) phóng to chữ trong bảng điều khiển, ô thông
  tin, chú giải và nhãn trên bản đồ. Lựa chọn được nhớ cho lần sau.

Lần đầu mở trang, ứng dụng tự chạy một **ví dụ** (4 góc một thửa đất ở Hướng Hóa) để bạn thấy ngay kết quả.

## 2. Chọn kinh tuyến trục

Đây là bước quan trọng nhất — sai kinh tuyến trục thì điểm lệch hàng trăm mét đến hàng km.

- **Tỉnh / thành phố:** chọn tỉnh, ô kinh tuyến tự điền (Quảng Trị là **106,25°**).
- **Kinh tuyến (°):** hoặc gõ tay, từ 102° đến 110°, bước 0,25°.

> Danh sách dùng **63 tỉnh cũ** (trước 01/07/2025). Nếu thửa đất thuộc tỉnh mới sau sáp nhập, hãy chọn
> theo **tỉnh cũ** nơi có thửa đất — kinh tuyến trục gắn với vị trí, không đổi theo tên tỉnh.

## 3. Chọn chiều chuyển đổi

- **VN2000 → WGS84:** từ toạ độ trên sổ đỏ / bản vẽ sang toạ độ GPS (Google Maps, Google Earth).
- **WGS84 → VN2000:** từ toạ độ GPS sang toạ độ VN-2000.

## 4. Nhập toạ độ

Gõ, dán, hoặc bấm **Mở file TXT/CSV**. Mỗi dòng là một điểm.

### Chiều VN2000 → WGS84

Quy ước: **X là hướng Bắc** (số 7 chữ số, vd 1842173), **Y là hướng Đông** (số quanh 500000, vd 546243).

| Dạng | Ví dụ |
|---|---|
| Tên X Y H | `1 1842173.70 546243.50 10` |
| Tên X Y | `1 1842173.70 546243.50` |
| X Y H | `1842173.70 546243.50 10` |
| X Y | `1842173.70 546243.50` |
| Hai dòng X= / Y= | `X=1842173.70` rồi xuống dòng `Y=546243.50` (nhập ngược sẽ tự đảo) |
| Mã N / E | `N01842173 E00546243` (cùng dòng hoặc hai dòng) |
| Ba dòng riêng | dòng 1 là X, dòng 2 là Y, dòng 3 là H |

- Các số cách nhau bằng **dấu cách, tab hoặc dấu phẩy**; dấu thập phân là **dấu chấm**.
- Không có H thì H = 0. Ghi chú sau toạ độ và ký tự `>` `#` đầu tên điểm được tự bỏ qua.
- Điểm ngoài phạm vi Việt Nam bị loại và báo lỗi (X 500 000 – 2 650 000; Y 330 000 – 670 000;
  H −1000 – 3200).

### Chiều WGS84 → VN2000

| Dạng | Ví dụ |
|---|---|
| Vĩ độ Kinh độ | `16.65562529 106.68535922` |
| Vĩ độ Kinh độ H | `16.65562529 106.68535922 -3.6` |
| Tên Vĩ độ Kinh độ [H] | `M1 16.65562529 106.68535922` |

**Vĩ độ** (khoảng 8–23) ghi **trước**, **kinh độ** (khoảng 102–110) ghi **sau**. Ngăn cách bằng dấu
cách, dấu phẩy hoặc dấu chấm phẩy — dán thẳng toạ độ copy từ Google Maps là được.

### Các nút

- **Ví dụ:** điền dữ liệu mẫu. **Xoá:** xoá ô nhập và kết quả. **Chuyển đổi:** thực hiện.
- Dòng sai hiện trong **khung vàng** kèm lý do; các dòng đúng vẫn được chuyển đổi.

## 5. Đọc và xuất kết quả

Bảng **Kết quả** có đủ hai hệ cho mỗi điểm: Tên, X, Y, Vĩ độ, Kinh độ, H.

- **Bấm vào một dòng:** bản đồ bay tới điểm đó và hiện toạ độ, kèm tuỳ chọn **vẽ vòng tròn bán kính**
  (xem mục 7).
- **Sao chép:** chép kết quả dạng chữ (mỗi điểm một dòng) để dán vào Zalo, Excel…
- **CSV:** file mở bằng Excel, đủ hai hệ, không lỗi font tiếng Việt.
- **KML:** mở bằng Google Earth.
- **DXF:** mở bằng AutoCAD / phần mềm CAD. Mỗi điểm là **dấu +** (lớp `POINTS`, đỏ) và **tên điểm**
  (lớp `TEXT`, xanh lá). Trong CAD: **X = hướng Đông, Y = hướng Bắc**.

## 6. Thửa đất: nối điểm, cạnh, diện tích

- **Nối điểm:** vẽ ranh thửa màu xanh. Thứ tự nối **theo số trong tên điểm** (1 → 2 → 3 … → 1), không
  theo thứ tự dòng nhập — hãy đặt tên các góc theo thứ tự đi vòng quanh thửa.
- **Chiều dài cạnh:** hiện độ dài từng cạnh (m) trên bản đồ.
- Từ 3 điểm trở lên, ứng dụng hiện:
  - **Diện tích VN-2000** — tính trên mặt phẳng chiếu, giống hồ sơ địa chính;
  - **Diện tích WGS84** — tính trên mặt elipxoit;
  - **Chu vi.**

  Hai diện tích thường chênh 0,01–0,05% do phép chiếu — bình thường, không phải lỗi.

## 7. Bản đồ

- **Bản đồ / Vệ tinh** (góc trên trái): đổi nền. Ở vùng nông thôn, ảnh vệ tinh zoom sâu có thể hơi mờ.
- **◎ Định vị vị trí của tôi** (nút dưới nút la bàn, góc trên bên phải): như Google Maps — chấm xanh là vị trí
  thiết bị, vòng mờ là phạm vi sai số, mũi nhọn là hướng đang nhìn (điện thoại). Bấm lần 1: bay tới vị trí và
  bám theo khi di chuyển; kéo bản đồ thì thôi bám (bấm lại để bám tiếp); bấm khi đang bám để tắt. Ô **📍 Vị trí
  của tôi** hiện toạ độ WGS84, toạ độ **VN-2000** theo kinh tuyến trục đang chọn và độ chính xác (±m); nút
  *Sao chép* để dán vào Zalo, Excel… Lần đầu trình duyệt hỏi quyền **Vị trí** — chọn *Cho phép*. Toạ độ lấy từ
  GPS / Wi-Fi của thiết bị (điện thoại ngoài trời thường ±3–10 m, máy tính có thể sai hàng trăm mét) — **chỉ để
  tham khảo, không thay đo đạc địa chính**.
- **☰ Lớp bản đồ / Thu gọn** (góc trên bên trái bản đồ): bấm để ẩn / hiện cả nhóm tuỳ chọn *Bản đồ – Vệ tinh*,
  *Quy hoạch*, *Giá đất*, *Độ đậm lớp phủ* cho đỡ che bản đồ. Ứng dụng nhớ lựa chọn; trên điện thoại mặc định thu gọn.
- **Độ đậm lớp phủ** (thanh trượt dưới nút *Giá đất*): giảm độ đậm của lớp **quy hoạch** và **giá đất** để
  nhìn thấy ảnh vệ tinh / bản đồ bên dưới (0 % = trong suốt, 100 % = mặc định). Khi bật *Vệ tinh* mà chỉ thấy
  màu quy hoạch, hãy kéo thanh này xuống khoảng 30–50 % hoặc tắt nút *Quy hoạch*.
- **Đảo, quần đảo luôn được ghi chú** ở mọi mức zoom: QĐ. Hoàng Sa (TP. Đà Nẵng), QĐ. Trường Sa (Khánh Hòa),
  Đ. Bạch Long Vĩ (TP. Hải Phòng — điểm chủ quyền quan trọng ở Vịnh Bắc Bộ), Đ. Phú Quốc (An Giang — quan trọng
  ở vùng biển Tây Nam), QĐ. Thổ Chu (An Giang), QĐ. Côn Sơn (TP. Hồ Chí Minh), Đ. Phú Quý (Lâm Đồng),
  Đ. Lý Sơn (Quảng Ngãi), Đ. Cồn Cỏ (Quảng Trị). Đưa chuột vào tên đảo để xem ý nghĩa.
- **Nền hành chính khi thu nhỏ:** từ mức zoom 9 trở xuống, bản đồ chuyển sang **nền hành chính Việt Nam**
  (34 tỉnh, thành phố mới; biên giới quốc gia; **QĐ. Hoàng Sa** và **QĐ. Trường Sa** tô đỏ). Phóng to qua
  mức 9–10, nền tự chuyển dần về Bản đồ / Vệ tinh. Nguồn: xem mục *Nguồn dữ liệu*.
- **Tỉnh của điểm:** sau khi chuyển đổi, dưới chữ *Kết quả* ghi điểm thuộc **tỉnh / thành phố nào (34 tỉnh
  mới)**, và tỉnh đó được tô hồng trên nền hành chính. Ranh tỉnh lấy từ bản đồ tỷ lệ 1:1.000.000 nên điểm
  **sát ranh tỉnh** (trong vài trăm mét) có thể bị xếp nhầm tỉnh. **Kinh tuyến trục vẫn chọn theo tỉnh cũ**
  (mục 2) — tỉnh mới có thể gồm nhiều tỉnh cũ khác kinh tuyến trục.
- **Bấm vào dấu + của điểm:** hiện toạ độ hai hệ.
- **Vòng tròn bán kính:** trong ô thông tin của điểm (bấm dấu + hoặc dòng trong bảng kết quả), gõ bán kính
  (mét, nhận cả dấu phẩy như `25,5`) vào ô **Vòng tròn bán kính** rồi bấm **Vẽ**.
  - Bản đồ vẽ vòng tròn nét đứt màu hồng, **tâm tại điểm đó**, ghi `R = … m` ở mép trên, và tự phóng /
    thu để thấy trọn vòng tròn.
  - Vẽ được nhiều vòng tròn, ở nhiều điểm, nhiều bán kính khác nhau. Bán kính dùng lần trước được nhớ sẵn.
  - Danh sách vòng tròn (kèm diện tích ≈ πR²) nằm dưới bảng kết quả; bấm **Xoá** từng cái hoặc **Xoá tất cả**.
  - Vòng tròn tính trên mặt elipxoit WGS84: mọi điểm trên vòng cách tâm đúng R mét.
- Phóng to / thu nhỏ bằng con lăn chuột hoặc chụm hai ngón tay; nút la bàn đưa bản đồ về hướng Bắc.
- Góc dưới trái có **thước tỉ lệ**.

## 8. Lớp quy hoạch Hướng Hóa

Lớp lấy từ **Bản đồ điều chỉnh quy hoạch sử dụng đất đến năm 2030 huyện Hướng Hóa**
(~19 800 thửa), **tô đúng màu của bản đồ quy hoạch gốc**.

- Nút **Quy hoạch** (dưới nút chọn nền): bật / tắt lớp. Màu hiện từ **mức zoom 10**, ranh thửa từ mức 12.
- **Chú giải quy hoạch** (góc dưới bên phải bản đồ): bấm để mở danh sách mã đất, tên loại đất, màu và số thửa.
- **Bấm vào bất kỳ thửa nào** để xem: loại đất (vd *Đất ở tại nông thôn*), mã (vd **ONT**),
  số thửa và diện tích. Chỗ có vùng lớn (đường…) chồng lên thửa nhỏ, ứng dụng chọn thửa nhỏ nhất.
- Sau khi chuyển đổi, bảng điều khiển cho biết **quy hoạch tại vị trí thửa của bạn**, ví dụ:
  *ONT Đất ở tại nông thôn — Thửa số 1 · 2.491,3 m² · chứa tâm thửa*. Thửa chứa **tâm thửa** được
  **viền cam** trên bản đồ (các điểm góc thường nằm đúng trên ranh nên chỉ liệt kê, không viền).
- Loại đất được xác định theo thứ tự:
  1. **nhãn mã đất** ghi trên bản đồ (khoảng một nửa số thửa);
  2. **suy ra từ màu** khi thửa không có nhãn (ghi rõ *"suy ra từ màu"* trong ô thông tin) — ví dụ màu
     cam đậm là đất giao thông (DGT), màu hồng là đất ở nông thôn (ONT);
  3. vài trăm thửa công trình công cộng / sản xuất kinh doanh dùng chung một màu cho nhiều mã → chỉ
     ghi được **tên nhóm**.
- Thông tin chỉ để **tham khảo**; khi giao dịch cần đối chiếu bản đồ, văn bản quy hoạch chính thức.

## 9. Giá đất 2026

Lớp **Giá đất** hiển thị **Bảng giá đất tỉnh Quảng Trị áp dụng từ 01/01/2026** (Nghị quyết
12/2025/NQ-HĐND ngày 11/12/2025 của HĐND tỉnh) — 78 xã, phường, đặc khu, khoảng 6 700 đoạn đường.

- Nút **Giá đất** (dưới nút *Quy hoạch*): bật / tắt lớp. Đoạn đường hiện từ **mức zoom 11**, tô màu theo
  **giá đất ở Vị trí 1** (chú giải góc dưới trái): vàng nhạt < 1 triệu … tím ≥ 20 triệu đ/m².
- **Bấm vào đoạn đường** để xem: tên đường, đoạn từ … đến …, xã mới (và xã cũ), bảng giá **Vị trí 1–4** của
  đất ở, đất thương mại dịch vụ (TMDV), đất cơ sở sản xuất phi nông nghiệp (SXKD), và mức thay đổi so với
  bảng giá cũ.
- **Sau khi chuyển đổi**, dưới bảng kết quả có mục *Giá đất 2026 quanh tâm thửa*: tối đa 4 đoạn đường gần
  nhất (trong 400 m) kèm khoảng cách, và **giá đất nông nghiệp** của xã. Bấm vào một đoạn để bay tới đoạn đó.
- **Tra cứu** (mục *Bảng giá đất 2026* trong bảng điều khiển): chọn xã và / hoặc gõ tên đường (không cần
  dấu). Tra được **cả các đoạn không có toạ độ**; đoạn có toạ độ bấm vào để xem trên bản đồ.

**Vị trí đoạn đường được xác định thế nào:** mỗi đoạn trong bảng giá có liên kết Google Maps nối điểm đầu
→ điểm cuối (đôi khi có điểm giữa). Ứng dụng **dò tuyến theo mạng đường OpenStreetMap** giữa các
điểm đó, nên đoạn vẽ ra bám theo con đường thật, không phải đường thẳng:

1. Tải toàn bộ mạng đường OSM vùng có đoạn giá đất (Overpass API, 39 ô 0,2°, ~69 000 tuyến đường), dựng đồ thị
   và **dò đường ngắn nhất ưu tiên đúng tên**: cạnh trùng tên đường trong bảng giá tính trọng số 1,0, cạnh khác
   tên × 1,6 — tuyến đi theo đúng con đường có tên khi có thể. Điểm đầu/cuối chiếu lên đường trùng tên trong
   60 m, nếu không có thì đường gần nhất trong 150 m.
2. **Đối chiếu tên**: so tên và số hiệu (ref) đường OSM dọc tuyến với tên trong bảng giá (bỏ dấu; *Quốc lộ 9* =
   *QL9* = *QL.9*; *Quốc lộ 1A* = *Quốc lộ 1*). Có thêm tuyến dò OSRM hồ sơ *đi bộ* cho một phần các đoạn; mỗi
   đoạn chọn tuyến đạt hạng tốt nhất, cùng hạng chọn tuyến trùng tên nhiều hơn.
3. Kiểm tra từng đoạn:

| Trên bản đồ | Ý nghĩa |
|---|---|
| Nét liền | Hai đầu bám đường ≤ 30 m, tuyến không vòng quá 2,5 lần đường thẳng, và ≥ 50 % chiều dài nằm trên đường trùng tên (khi OSM có tên đường) |
| Nét đứt | **Cần xem lại**: không đạt một trong các điều kiện trên, hoặc không dò được (nối thẳng các điểm). Khi lý do là khác tên, ô thông tin ghi tên đường OSM mà tuyến nằm trên (thường là phố trong đô thị được OSM ghi theo tên quốc lộ, hoặc OSM chưa có tên) |

Khoảng một phần ba số đoạn có liên kết toạ độ; số còn lại (*"Chưa gắn vị trí"* hoặc mô tả theo thửa, tờ
bản đồ) chỉ tra cứu được trong bảng.

> **Lưu ý:** đoạn đường gần nhất chưa chắc là đường mà thửa đất tiếp giáp; vị trí (VT1–VT4) của thửa do cơ
> quan có thẩm quyền xác định theo quy định kèm Nghị quyết. Thông tin chỉ để tham khảo.

## 10. Lớp từ file (KML, KMZ, DXF, DGN)

Mục **Lớp từ file** trong bảng điều khiển: bấm **Thêm file KML, KMZ, DXF, DGN…** (chọn được nhiều file) hoặc
**kéo thả file vào bản đồ**. File chỉ được đọc trên máy bạn, không tải lên mạng.

| File | Đọc được | Toạ độ |
|---|---|---|
| **.kml, .kmz** (Google Earth) | Điểm, đường, vùng (cả MultiGeometry), tên, mô tả, ExtendedData, màu theo Style | WGS84 — mở thẳng |
| **.dxf** (AutoCAD, mọi phiên bản) | LINE, LWPOLYLINE / POLYLINE (cả cung *bulge*), CIRCLE, ARC, ELLIPSE, POINT, TEXT, MTEXT, ATTRIB, khối INSERT (bung ra đúng vị trí, tỉ lệ, góc xoay) | Hỏi hệ toạ độ |
| **.dgn MicroStation V7** | Line, LineString, Shape, Curve, chuỗi / hình phức, Ellipse, Arc, Text, Cell; lớp = *Level* | Hỏi hệ toạ độ |
| .dgn **MicroStation V8**, .dwg | **Chưa đọc được** — định dạng đóng của Bentley / Autodesk, trình duyệt không có thư viện mở | Xuất sang DXF (xem dưới) |

- **Mỗi lần mở file CAD** (DXF, DGN) ứng dụng hỏi: toạ độ trong file là **VN-2000** (x = Đông/Y, y = Bắc/X như
  AutoCAD, MicroStation), **VN-2000 đảo trục** hay **WGS84** (độ), và **kinh tuyến trục** (chọn tỉnh hoặc gõ số).
  Ứng dụng đoán sẵn theo phạm vi toạ độ trong file. Toạ độ VN-2000 đổi sang WGS84 bằng **đúng hàm chuyển đổi của
  ứng dụng** (7 tham số QĐ 05/2007/QĐ-BTNMT), độ cao lấy bằng 0.
- **Chữ tiếng Việt mã TCVN3** (font .VnTime… của bản đồ địa chính cũ) tự đổi sang Unicode.
- **Chữ trong file CAD** hiện đúng chiều cao thật (m) theo mức phóng — như trong CAD: phóng to mới thấy số
  thửa, diện tích; tối đa 400 chữ trong khung nhìn.
- **Bấm vào đối tượng**: xem tên lớp / Level, thuộc tính KML; vùng khép kín có **diện tích**, đường có
  **chiều dài** (tính trên elipxoit WGS84 — để tham khảo).
- **Danh sách lớp**: ô đánh dấu để ẩn / hiện, **⤢** phóng tới lớp, **×** gỡ lớp. Lớp từ file không được lưu
  lại — tải lại trang thì mở lại file.
- **File DGN V8 / DWG**: trong MicroStation chọn *File › Export › DWG/DXF* (kiểu **DXF**) hoặc *File › Save As*
  kiểu **MicroStation V7 DGN**; trong AutoCAD chọn *Save As* kiểu **AutoCAD DXF**. Rồi mở file mới tại đây.

## 11. Nguồn dữ liệu

| Dữ liệu | Nguồn | Ghi chú |
|---|---|---|
| Nền hành chính (zoom ≤ 9): 34 tỉnh, biên giới, QĐ. Hoàng Sa, QĐ. Trường Sa, nước láng giềng | **Bản đồ hành chính Việt Nam tỷ lệ 1:1.000.000** — Cục Đo đạc, Bản đồ và Thông tin địa lý Việt Nam (Bộ Nông nghiệp và Môi trường), 02/2025. Ranh giới tỉnh theo **Nghị quyết 202/2025/QH15**. Biên tập: **đề tài KH&CN cấp cơ sở NV25-44** *"Xây dựng chuỗi bản đồ hành chính Việt Nam tỷ lệ nhỏ phục vụ công bố khoa học của Trường Đại học Mỏ - Địa chất"*, chủ nhiệm **TS Trần Trung Anh**, 10/2025 | Chuyển từ hệ Lambert *BD1trieu_VN2000* sang WGS84 bằng chính 7 tham số của ứng dụng; đơn giản hoá ranh ~30 m. Tỷ lệ nhỏ: chỉ để xem tổng quan, **không dùng xác định ranh thửa**. Vị trí các nhãn *Biển Đông* và tên nước láng giềng đặt theo bố cục bản đồ NV25-44 |
| Bản đồ đường phố | © **OpenStreetMap contributors**, giấy phép ODbL | openstreetmap.org/copyright |
| Ảnh vệ tinh | **Esri World Imagery** (Esri, Maxar, Earthstar Geographics) | Độ phân giải tuỳ vùng |
| Lớp quy hoạch Hướng Hóa | **Bản đồ điều chỉnh quy hoạch sử dụng đất đến năm 2030 huyện Hướng Hóa** | Chỉ để tham khảo (mục 8) |
| Giá đất 2026 | **Nghị quyết 12/2025/NQ-HĐND** ngày 11/12/2025 của HĐND tỉnh Quảng Trị — Bảng giá đất áp dụng từ 01/01/2026 (Phụ lục I: đất nông nghiệp; II: đất ở; III: đất TMDV, đất cơ sở SXKD phi nông nghiệp), qua bản tổng hợp Excel *"BANG GIA DAT 2026"* | Liên kết Google Maps điểm đầu – cuối từng đoạn lấy từ bản tổng hợp; hình đoạn đường dò theo mạng đường © **OpenStreetMap contributors** (ODbL) dữ liệu tải qua **Overpass API** (maps.mail.ru), dò tuyến trên máy; một phần bằng **OSRM** (máy chủ routing.openstreetmap.de của FOSSGIS). Mục 9 |
| Tham số chuyển đổi VN-2000 ⇄ WGS84 (7 tham số) | **Quyết định số 05/2007/QĐ-BTNMT** ngày 27/02/2007 của Bộ Tài nguyên và Môi trường *về sử dụng hệ thống tham số tính chuyển giữa Hệ tọa độ quốc tế WGS-84 và Hệ tọa độ quốc gia VN-2000* | Dịch gốc −191,90441429 m; −39,30318279 m; −111,45032835 m · góc xoay −0,00928836″; 0,01975479″; −0,00427372″ · tỉ lệ k = 1,000000252906278 (cũng là bộ EPSG:6960, Coordinate Frame) |
| Công thức chuyển đổi | Trần Trung Anh, Quách Mạnh Tuấn — *Công tác tính chuyển toạ độ trong công nghệ máy bay không người lái có định vị tâm chụp chính xác*, Hội nghị KH Quốc gia về Công nghệ Địa không gian | |

Tên nguồn cũng hiện ở **góc dưới phải bản đồ** (nút ⓘ) và cuối bảng điều khiển (*Nguồn dữ liệu bản đồ*).

## 12. Ứng dụng tự nhớ

Kinh tuyến trục, chiều chuyển đổi, dữ liệu nhập lần trước, nền bản đồ, các ô *Nối điểm*,
*Chiều dài cạnh*, nút *Quy hoạch* và *Giá đất* được nhớ cho lần mở sau. Dữ liệu chỉ lưu trên máy bạn, không gửi đi đâu.

## 13. Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| Điểm lệch xa vài km | Sai kinh tuyến trục, hoặc **đảo X và Y** (X phải là số 7 chữ số) |
| Điểm rơi ra biển / nước khác | Nhập ngược vĩ độ và kinh độ ở chiều WGS84 → VN2000 |
| Thửa vẽ hình chéo, xoắn | Tên điểm không theo thứ tự đi vòng quanh thửa |
| Khung vàng "Không đúng định dạng" | Dùng dấu phẩy làm dấu thập phân, hoặc có chữ lẫn vào số |
| Không thấy nút Quy hoạch | Lớp quy hoạch chưa được tạo, hoặc đang mở file trực tiếp trên máy thay vì qua trang web |
| Lớp quy hoạch không hiện | Zoom quá xa — phóng to tới mức 10 trở lên (ranh thửa từ mức 12) |

## Bản Streamlit

Bản Streamlit (https://vn2000-wgs84.streamlit.app/) dùng **cùng thuật toán**. Khác biệt chính: lần đầu mở
phải chờ app "thức dậy"; lớp quy hoạch chỉ vẽ các thửa trong **bán kính** bạn chọn (mặc định 300 m);
*Nối điểm* và *Hiện cạnh* là nút bấm bật/tắt.

---

Tác giả: **Trần Trường Sinh** · 0917.750.555
