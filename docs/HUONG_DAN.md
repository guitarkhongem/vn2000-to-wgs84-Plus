# Hướng dẫn sử dụng VN2000 ⇄ WGS84

Địa chỉ: **https://guitarkhongem.github.io/vn2000-to-wgs84-Plus/** — mở được trên máy tính và điện thoại,
không cần cài đặt.

## 1. Bố cục màn hình

- **Máy tính:** bảng điều khiển bên trái, bản đồ bên phải.
- **Điện thoại:** bản đồ ở trên, kéo xuống để thấy bảng điều khiển.

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

## 9. Nguồn dữ liệu

| Dữ liệu | Nguồn | Ghi chú |
|---|---|---|
| Nền hành chính (zoom ≤ 9): 34 tỉnh, biên giới, QĐ. Hoàng Sa, QĐ. Trường Sa, nước láng giềng | **Bản đồ hành chính Việt Nam tỷ lệ 1:1.000.000** — Cục Đo đạc, Bản đồ và Thông tin địa lý Việt Nam (Bộ Nông nghiệp và Môi trường), 02/2025. Ranh giới tỉnh theo **Nghị quyết 202/2025/QH15**. Biên tập: **đề tài KH&CN cấp cơ sở NV25-44** *"Xây dựng chuỗi bản đồ hành chính Việt Nam tỷ lệ nhỏ phục vụ công bố khoa học của Trường Đại học Mỏ - Địa chất"*, chủ nhiệm **TS Trần Trung Anh**, 10/2025 | Chuyển từ hệ Lambert *BD1trieu_VN2000* sang WGS84 bằng chính 7 tham số của ứng dụng; đơn giản hoá ranh ~30 m. Tỷ lệ nhỏ: chỉ để xem tổng quan, **không dùng xác định ranh thửa**. Vị trí các nhãn *Biển Đông* và tên nước láng giềng đặt theo bố cục bản đồ NV25-44 |
| Bản đồ đường phố | © **OpenStreetMap contributors**, giấy phép ODbL | openstreetmap.org/copyright |
| Ảnh vệ tinh | **Esri World Imagery** (Esri, Maxar, Earthstar Geographics) | Độ phân giải tuỳ vùng |
| Lớp quy hoạch Hướng Hóa | **Bản đồ điều chỉnh quy hoạch sử dụng đất đến năm 2030 huyện Hướng Hóa** | Chỉ để tham khảo (mục 8) |
| Tham số chuyển đổi VN-2000 → WGS84 | 7 tham số Helmert, trùng **EPSG:6960** *VN-2000 to WGS 84 (2)* (Coordinate Frame) | |
| Công thức chuyển đổi | Trần Trung Anh, Quách Mạnh Tuấn — *Công tác tính chuyển toạ độ trong công nghệ máy bay không người lái có định vị tâm chụp chính xác*, Hội nghị KH Quốc gia về Công nghệ Địa không gian | |

Tên nguồn cũng hiện ở **góc dưới phải bản đồ** (nút ⓘ) và cuối bảng điều khiển (*Nguồn dữ liệu bản đồ*).

## 10. Ứng dụng tự nhớ

Kinh tuyến trục, chiều chuyển đổi, dữ liệu nhập lần trước, nền bản đồ, các ô *Nối điểm*,
*Chiều dài cạnh* và nút *Quy hoạch* được nhớ cho lần mở sau. Dữ liệu chỉ lưu trên máy bạn, không gửi đi đâu.

## 11. Xử lý sự cố

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
