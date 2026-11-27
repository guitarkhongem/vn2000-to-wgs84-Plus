# Thống kê truy cập — dựng máy chủ trên Cloudflare (miễn phí)

Ứng dụng web (GitHub Pages) chỉ là trang tĩnh, không tự lưu được số liệu. Thư mục này chứa một máy chủ nhỏ
chạy trên **Cloudflare Workers** + cơ sở dữ liệu **Cloudflare D1** để đếm lượt mở ứng dụng theo ngày,
quốc gia, thành phố. Chủ ứng dụng xem số liệu trong tab *📊 Thống kê truy cập* (ẩn với người dùng khác).

| File | Vai trò |
|---|---|
| `schema.sql` | Tạo bảng `luot` (mỗi dòng = 1 ngày × 1 thành phố: số lượt xem, số lượt khách) |
| `worker.js` | Máy chủ: `POST /hit` cộng 1 lượt; `GET /stats` trả số liệu (cần khoá quản trị) |

## Bản đang chạy

- Tài khoản Cloudflare: đăng nhập bằng GitHub **guitarkhongem** (Guitarkhongem@gmail.com).
- Worker **`vn2000-thongke`**: <https://vn2000-thongke.guitarkhongem.workers.dev> — mã = `worker.js` (dán vào
  *Edit code*, đã bỏ chú thích); biến *Secret* `ADMIN_KEY`; binding `DB`.
- D1 **`vn2000_thongke`** (id `b76fa99d-50c0-4574-ad0c-7defee68b4ec`), bảng `luot` theo `schema.sql`.
- Sửa `worker.js` trong repo thì phải dán lại vào *Edit code* của Worker rồi **Deploy** — Cloudflare không tự lấy từ GitHub.
- Worker còn cấp khoá ảnh vệ tinh Google cho ứng dụng: `GET /google` (Secret `GOOGLE_MAPS_KEY`) — xem mục cuối.

## Thu thập những gì

- Mỗi lần mở trang, trình duyệt gửi `{"moi":1}` (lần mở đầu tiên trong ngày của máy đó) hoặc `{"moi":0}`.
  Không gửi toạ độ, không gửi dữ liệu người dùng nhập, không cookie.
- **Quốc gia, thành phố, vùng, toạ độ gần đúng của thành phố** do chính Cloudflare ước tính theo địa chỉ mạng
  (thuộc tính `request.cf`) — máy chủ chỉ lưu các giá trị này, **không lưu địa chỉ IP**.
- Trình duyệt bật *Do Not Track* / *Global Privacy Control* thì không gửi. Chủ ứng dụng tick
  *Không đếm máy này* để không tự cộng lượt của mình.
- Vị trí theo địa chỉ mạng chỉ đúng tới mức thành phố, có thể lệch (nhà mạng đặt máy chủ ở Hà Nội / TP.HCM,
  dùng VPN, 4G…).

## Dựng máy chủ (làm một lần, khoảng 10 phút)

Giao diện Cloudflare đổi theo thời gian; tên mục dưới đây theo tài liệu Cloudflare (11/2026).

1. **Tạo tài khoản** miễn phí tại <https://dash.cloudflare.com/sign-up> (không cần thẻ thanh toán), đăng nhập.
2. **Tạo cơ sở dữ liệu D1**: menu trái *Storage & Databases* → *D1 SQL Database* → **Create Database**
   → đặt tên `vn2000_thongke` → **Create**.
3. **Tạo bảng**: mở cơ sở dữ liệu vừa tạo → tab **Console** → dán toàn bộ nội dung `schema.sql` → **Execute**.
4. **Tạo Worker**: menu *Compute (Workers)* → *Workers & Pages* → **Create** → chọn mẫu *Hello World*
   → đặt tên `vn2000-thongke` → **Deploy**. Sau đó bấm **Edit code**, xoá hết mã mẫu, dán toàn bộ
   `worker.js` → **Deploy**.
5. **Nối Worker với cơ sở dữ liệu**: trong trang Worker → tab **Bindings** → **Add binding** → *D1 database*
   → *Variable name*: `DB` (đúng chữ hoa) → chọn `vn2000_thongke` → **Add binding**.
6. **Đặt khoá quản trị**: trang Worker → **Settings** → *Variables and Secrets* → **Add** → *Type*: **Secret**,
   *Variable name*: `ADMIN_KEY`, *Value*: một chuỗi dài khó đoán (≥ 20 ký tự, ví dụ ghép 4–5 từ và số)
   → **Deploy**. Ghi khoá này lại — dùng để xem thống kê; Cloudflare không cho xem lại giá trị Secret.
7. *(Tuỳ chọn)* Nếu ứng dụng chạy ở địa chỉ khác `https://guitarkhongem.github.io`, thêm biến *Text*
   `ALLOWED_ORIGIN` = địa chỉ đó (nhiều địa chỉ cách nhau dấu phẩy, ví dụ
   `https://guitarkhongem.github.io,http://localhost:8000`).
8. **Kiểm tra**: mở địa chỉ Worker (dạng `https://vn2000-thongke.<tên-tài-khoản>.workers.dev`) — phải thấy
   `{"ok":true,"ten":"VN2000-WGS84 thống kê truy cập"}`.

## Bật thống kê trong ứng dụng

1. Điền địa chỉ Worker vào `docs/js/thongke-config.js`:
   ```js
   window.VN_THONGKE_API = "https://vn2000-thongke.<tên-tài-khoản>.workers.dev";
   ```
   rồi commit, đẩy lên `main`. Để trống `""` là tắt hẳn (ứng dụng không gửi gì).
2. Mở ứng dụng bằng đường dẫn có `?thongke`, ví dụ
   <https://guitarkhongem.github.io/vn2000-to-wgs84-Plus/?thongke> — dòng chữ **📊 Thống kê truy cập** hiện ở cuối
   bảng điều khiển (máy đó nhớ cho các lần sau). Bấm vào chữ để mở bảng thống kê; trong bảng có nút
   **Ẩn mục thống kê trên máy này**.
3. Nhập `ADMIN_KEY` → **Xem**. Khoá được nhớ trên trình duyệt của máy đó — đừng làm việc này trên máy dùng chung.
4. Tick **Không đếm máy này** trên các máy/điện thoại của chính bạn.

Trong bảng thống kê: tổng lượt xem và lượt khách, biểu đồ cột theo ngày (rê chuột xem số), bảng theo **quốc gia** hoặc
**thành phố**, khoảng thời gian (hôm nay, 7 / 30 / 90 ngày, 12 tháng, từ đầu, tuỳ chọn), **Hiện trên bản đồ**
(đóng bảng, phóng bản đồ tới các vòng tròn tím tại thành phố, to theo số lượt), **Tải CSV** (mở được bằng Excel).

*Lượt khách* = số máy (trình duyệt) khác nhau trong ngày, cộng các ngày — không phải số người duy nhất của cả khoảng.

## Giới hạn gói miễn phí

- Workers Free: 100 000 yêu cầu/ngày (tính lại lúc 0 giờ UTC = 7 giờ sáng giờ Việt Nam).
- D1 Free: 5 triệu dòng đọc/ngày, 100 000 dòng ghi/ngày, 5 GB lưu trữ.

Mỗi lần mở ứng dụng tốn 1 yêu cầu + 1–2 dòng ghi; mỗi lần xem thống kê đọc vài trăm – vài nghìn dòng.
Bảng chỉ có 1 dòng cho mỗi (ngày × thành phố) nên dung lượng rất nhỏ. Vượt giới hạn thì lượt hôm đó không được đếm,
ứng dụng vẫn chạy bình thường.

## Lưu ý

- Kiểm tra `Origin` chỉ ngăn trang web khác gửi lượt; ai cố ý dùng công cụ dòng lệnh vẫn có thể gửi lượt giả —
  số liệu dùng để tham khảo xu hướng, không phải số kiểm toán.
- Một số trình chặn quảng cáo / theo dõi có thể chặn yêu cầu gửi lượt → lượt thật có thể cao hơn số đếm.
- Xoá số liệu cũ: Console của D1, ví dụ `DELETE FROM luot WHERE ngay < '2026-01-01';`
- Đổi khoá: sửa Secret `ADMIN_KEY` (Settings → Variables and Secrets), rồi nhập khoá mới trong tab.

## Ảnh vệ tinh Google (Secret `GOOGLE_MAPS_KEY`)

Nút **Google** trên bản đồ dùng **Google Maps Platform — Map Tiles API** (cách chính thức, hợp lệ). Khoá API để trong
Worker, không nằm trong mã nguồn GitHub; nút chỉ hiện khi Worker đã có khoá.

1. <https://console.cloud.google.com> → tạo dự án (vd `vn2000-ban-do`).
2. **Billing** (Thanh toán): gắn tài khoản thanh toán (thẻ) — Google bắt buộc, kể cả khi chỉ dùng mức miễn phí.
   Nên tạo **Budget** (ngân sách) vài USD có cảnh báo email.
3. **APIs & Services → Library** → tìm **Map Tiles API** → **Enable**.
4. **APIs & Services → Credentials → Create credentials → API key**. Bấm vào khoá vừa tạo:
   - *Application restrictions*: **Websites** → thêm `https://guitarkhongem.github.io/*`
   - *API restrictions*: **Restrict key** → chỉ chọn **Map Tiles API** → **Save**.
5. **Hạn mức theo ngày** (để không vượt mức miễn phí 100 000 ô ảnh/tháng): *Google Maps Platform → Quotas* → chọn
   **Map Tiles API** → mục số yêu cầu 2D Tiles **mỗi ngày** → *Edit* → đặt **3000** → *Submit*. Hết hạn mức trong ngày,
   ứng dụng tự quay về ảnh Esri.
6. Cloudflare → Worker `vn2000-thongke` → *Settings → Variables and Secrets → Add* → **Secret** `GOOGLE_MAPS_KEY`
   = khoá API ở bước 4 → **Deploy**. Mở lại ứng dụng: nút **Google** hiện cạnh *Bản đồ | Vệ tinh*.

Hiển thị theo chính sách Map Tiles API: chữ **Google Maps** và chuỗi bản quyền ảnh của khung nhìn (lấy từ viewport
info) ở góc dưới trái; không tải trước / lưu ảnh. Mỗi ô ảnh 256 px tải về là 1 lượt tính phí; một lần xem bản đồ vệ
tinh thường tốn vài chục đến vài trăm ô.

## Nguồn

- Cloudflare D1 — *Getting started* (tạo cơ sở dữ liệu, Console, binding): <https://developers.cloudflare.com/d1/get-started/>
- Cloudflare D1 — *Pricing* (giới hạn gói Free): <https://developers.cloudflare.com/d1/platform/pricing/>
- Cloudflare Workers — *Limits* (100 000 yêu cầu/ngày, tính lại 0 giờ UTC): <https://developers.cloudflare.com/workers/platform/limits/>
- Cloudflare Workers — *Request* / `IncomingRequestCfProperties` (country, city, region, latitude, longitude):
  <https://developers.cloudflare.com/workers/runtime-apis/request/>
- Cloudflare Workers — *Secrets*: <https://developers.cloudflare.com/workers/configuration/secrets/>
- Google Maps Platform — Map Tiles API, *2D Tiles overview* (session token, viewport info, copyright):
  <https://developers.google.com/maps/documentation/tile/2d-tiles-overview>
- Google Maps Platform — *Map Tiles API Policies* (logo / chữ Google Maps, bản quyền, không lưu ảnh):
  <https://developers.google.com/maps/documentation/tile/policies>
- Google Maps Platform — *Pricing* (Map Tiles API: 2D Map Tiles miễn phí 100 000 lượt/tháng):
  <https://developers.google.com/maps/billing-and-pricing/pricing>
- Google Maps Platform — *Usage and billing* của Map Tiles API (hạn mức theo ngày, cách sửa quota):
  <https://developers.google.com/maps/documentation/tile/usage-and-billing>
