/*
 * Tiện ích hình học + bảng kinh tuyến trục — chép từ functions/area.py,
 * edges.py, sort_utils.py, lon0_selector.py.
 * Cần thư viện geographiclib-geodesic (biến toàn cục `geodesic`) cho các phép tính WGS84.
 */
(function (root) {
  "use strict";

  // Kinh tuyến trục VN-2000 theo tỉnh (danh sách 63 tỉnh cũ, trước 01/07/2025)
  const LON0_BY_PROVINCE = {
    "Lai Châu": 103.0, "Sơn La": 104.0, "Kiên Giang": 104.5, "Cà Mau": 104.5,
    "Lào Cai": 104.75, "Yên Bái": 104.75, "Nghệ An": 104.75, "Phú Thọ": 104.75, "An Giang": 104.75,
    "Thanh Hóa": 105.0, "Vĩnh Phúc": 105.0, "Hà Tây": 105.0, "Đồng Tháp": 105.0, "Cần Thơ": 105.0,
    "Bạc Liêu": 105.0, "Hà Nội": 105.0, "Ninh Bình": 105.0, "Hà Nam": 105.0,
    "Hà Giang": 105.5, "Hải Dương": 105.5, "Hà Tĩnh": 105.5, "Bắc Ninh": 105.5, "Hưng Yên": 105.5,
    "Thái Bình": 105.5, "Nam Định": 105.5, "Tây Ninh": 105.5, "Vĩnh Long": 105.5, "Sóc Trăng": 105.5,
    "Trà Vinh": 105.5,
    "Cao Bằng": 105.75, "Long An": 105.75, "Tiền Giang": 105.75, "Bến Tre": 105.75, "Hải Phòng": 105.75,
    "TP. Hồ Chí Minh": 105.75, "Bình Dương": 105.75,
    "Tuyên Quang": 106.0, "Hòa Bình": 106.0, "Quảng Bình": 106.0,
    "Quảng Trị": 106.25, "Bình Phước": 106.25,
    "Bắc Kạn": 106.5, "Thái Nguyên": 106.5,
    "Bắc Giang": 107.0, "Thừa Thiên Huế": 107.0,
    "Lạng Sơn": 107.25, "Kon Tum": 107.5,
    "Quảng Ninh": 107.75, "Đồng Nai": 107.75, "Bà Rịa – Vũng Tàu": 107.75, "Quảng Nam": 107.75,
    "Lâm Đồng": 107.75, "Đà Nẵng": 107.75,
    "Quảng Ngãi": 108.0,
    "Ninh Thuận": 108.25, "Khánh Hòa": 108.25, "Bình Định": 108.25,
    "Đắk Lắk": 108.5, "Phú Yên": 108.5, "Gia Lai": 108.5, "Bình Thuận": 108.5,
  };

  // Sắp tên điểm: tên có số → theo số tăng dần; sau đó tới tên chữ (như sort_utils.py)
  function pointNameKey(name) {
    const s = String(name).trim();
    const m = s.match(/\d+/);
    return m ? [0, parseInt(m[0], 10)] : [1, s.toLowerCase()];
  }
  function comparePointNames(a, b) {
    const ka = pointNameKey(a), kb = pointNameKey(b);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (ka[1] < kb[1]) return -1;
    if (ka[1] > kb[1]) return 1;
    return 0;
  }

  // Diện tích phẳng (Shoelace) cho toạ độ VN-2000 [[x, y], ...]
  function shoelaceArea(points) {
    const n = points.length;
    if (n < 3) return 0;
    const xc = points.reduce((s, p) => s + p[0], 0) / n;
    const yc = points.reduce((s, p) => s + p[1], 0) / n;
    let area = 0;
    for (let i = 0; i < n; i++) {
      const [x0, y0] = [points[i][0] - xc, points[i][1] - yc];
      const [x1, y1] = [points[(i + 1) % n][0] - xc, points[(i + 1) % n][1] - yc];
      area += x0 * y1 - x1 * y0;
    }
    return Math.abs(area) / 2;
  }

  // Diện tích trên elipxoit WGS84 cho [[lat, lon], ...]
  function geodesicArea(points) {
    if (points.length < 3) return 0;
    const poly = root.geodesic.Geodesic.WGS84.Polygon(false);
    for (const [lat, lon] of points) poly.AddPoint(lat, lon);
    return Math.abs(poly.Compute(false, true).area);
  }

  // Độ dài cạnh trắc địa WGS84 (m)
  function geodesicDistance(lat1, lon1, lat2, lon2) {
    return root.geodesic.Geodesic.WGS84.Inverse(lat1, lon1, lat2, lon2).s12;
  }

  // Vòng tròn trắc địa (mọi điểm trên vòng cách tâm đúng `radius` mét trên elipxoit WGS84).
  // Trả về vòng khép kín [[lon, lat], …] gồm n + 1 điểm.
  function geodesicCircle(lat, lon, radius, n = 128) {
    const g = root.geodesic.Geodesic.WGS84;
    const ring = [];
    for (let i = 0; i <= n; i++) {
      const d = g.Direct(lat, lon, (360 * i) / n, radius);
      ring.push([d.lon2, d.lat2]);
    }
    return ring;
  }

  // Điểm (x, y) có nằm trong Polygon/MultiPolygon GeoJSON không (quy tắc chẵn–lẻ, lỗ được tính đúng)
  function pointInGeometry(x, y, geometry) {
    const polys = geometry.type === "Polygon" ? [geometry.coordinates]
      : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
    for (const rings of polys) {
      let inside = false;
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i], [xj, yj] = ring[j];
          if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        }
      }
      if (inside) return true;
    }
    return false;
  }

  // Đối tượng (Polygon/MultiPolygon GeoJSON) đầu tiên chứa điểm (lon, lat); không có → null.
  // Lọc nhanh bằng khung bao (tính một lần, lưu vào feature._bbox).
  function findFeature(lon, lat, features) {
    for (const f of features) {
      if (!f._bbox) {
        const b = [Infinity, Infinity, -Infinity, -Infinity];
        const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
        for (const poly of polys) for (const [x, y] of poly[0]) {
          if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
        }
        Object.defineProperty(f, "_bbox", { value: b, enumerable: false });
      }
      const b = f._bbox;
      if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
      if (pointInGeometry(lon, lat, f.geometry)) return f;
    }
    return null;
  }

  root.VN = root.VN || {};
  Object.assign(root.VN, {
    LON0_BY_PROVINCE, comparePointNames, shoelaceArea, geodesicArea, geodesicDistance, pointInGeometry,
    geodesicCircle, findFeature,
  });
})(typeof window !== "undefined" ? window : globalThis);
