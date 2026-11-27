-- Thống kê truy cập VN2000 ⇄ WGS84 — cơ sở dữ liệu Cloudflare D1 (SQLite)
-- Mỗi dòng = một ngày (giờ Việt Nam) × một thành phố. KHÔNG lưu địa chỉ IP hay mã định danh người xem.
CREATE TABLE IF NOT EXISTS luot (
  ngay      TEXT NOT NULL,              -- YYYY-MM-DD theo giờ Việt Nam (UTC+7)
  quoc_gia  TEXT NOT NULL DEFAULT '',   -- mã quốc gia 2 chữ (VN, US…) do Cloudflare xác định
  thanh_pho TEXT NOT NULL DEFAULT '',   -- tên thành phố do Cloudflare xác định (có thể trống)
  vung      TEXT NOT NULL DEFAULT '',   -- tỉnh / bang
  lat       REAL,                       -- toạ độ gần đúng của thành phố (Cloudflare)
  lon       REAL,
  so_luot   INTEGER NOT NULL DEFAULT 0, -- số lượt mở ứng dụng
  so_moi    INTEGER NOT NULL DEFAULT 0, -- số lượt là lần đầu trong ngày trên trình duyệt đó (≈ số người)
  PRIMARY KEY (ngay, quoc_gia, thanh_pho)
);
CREATE INDEX IF NOT EXISTS luot_ngay ON luot (ngay);
