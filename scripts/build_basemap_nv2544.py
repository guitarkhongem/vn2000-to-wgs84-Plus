"""
Tạo nền bản đồ hành chính Việt Nam cho WebGIS (docs/data/nen_hanhchinh.geojson)
từ bộ dữ liệu của đề tài NV25-44.

NGUỒN DỮ LIỆU (ghi lại nguyên văn vào file kết quả, mục "nguon"):
    - Bản đồ hành chính Việt Nam tỷ lệ 1:1.000.000, Cục Đo đạc, Bản đồ và Thông tin địa lý
      Việt Nam (Bộ Nông nghiệp và Môi trường) cung cấp, 02/2025.
    - Ranh giới 34 tỉnh, thành phố theo Nghị quyết 202/2025/QH15.
    - Biên tập: đề tài KH&CN cấp cơ sở NV25-44 "Xây dựng chuỗi bản đồ hành chính Việt Nam tỷ lệ
      nhỏ phục vụ công bố khoa học của Trường Đại học Mỏ - Địa chất", chủ nhiệm TS Trần Trung Anh, 10/2025.
    Bộ dữ liệu gốc KHÔNG nằm trong repo (máy tác giả: Desktop\\Trung Anh\\NV25-44 QGIS\\...\\Data).

Đầu vào: thư mục shapefile "Data" của dự án QGIS NV25-44:
    HanhChinhTinh.shp      34 tỉnh / thành phố (vùng)
    RG_QuocGia_merge.shp   lãnh thổ Việt Nam, phần thứ nhất = các đảo xa bờ (Hoàng Sa, Trường Sa…)
    RG_QuocGia_Line.shp    đường: id 1 = biên giới quốc gia trên đất liền, id 4 = biên giới các nước láng giềng
    QuocGiaLanCan.shp      bản ghi 0 = biển trong khung, bản ghi 1 = đất liền các nước láng giềng

Hệ toạ độ đầu vào: "BD1trieu_VN2000" — Lambert Conformal Conic 2 vĩ tuyến chuẩn trên VN-2000
    (elip WGS84, kinh tuyến trục 108°, vĩ tuyến chuẩn 11° và 21°, vĩ độ gốc 4°, False Easting 1 000 000 m).

Chuyển hệ (KHÔNG sửa thuật toán của app):
    1. Lambert ngược → toạ độ địa lý VN-2000 (công thức Snyder, 1987, USGS PP 1395, tr. 107–109).
    2. Địa lý VN-2000 → phẳng VN-2000 TM-3 với kinh tuyến trục gần nhất (bội số 0,25°), k0 = 0,9999
       (chuỗi Krüger bậc 6, Karney 2011) — để điểm luôn ở sát kinh tuyến trục.
    3. Gọi NGUYÊN hàm functions.converter.vn2000_to_wgs84_baibao → WGS84.
    → nền khớp cùng một phép chuyển với các điểm người dùng nhập.

Không cần thư viện ngoài (đọc shapefile bằng struct). Chạy:
    python scripts/build_basemap_nv2544.py "đường/dẫn/Data" [docs/data/nen_hanhchinh.geojson]
"""
import json
import math
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from functions.converter import vn2000_to_wgs84_baibao  # noqa: E402

NGUON = {
    "du_lieu": "Bản đồ hành chính Việt Nam tỷ lệ 1:1.000.000 — Cục Đo đạc, Bản đồ và Thông tin địa lý "
               "Việt Nam (Bộ Nông nghiệp và Môi trường), 02/2025",
    "ranh_gioi_tinh": "34 tỉnh, thành phố theo Nghị quyết 202/2025/QH15 của Quốc hội",
    "bien_tap": "Đề tài KH&CN cấp cơ sở NV25-44 \"Xây dựng chuỗi bản đồ hành chính Việt Nam tỷ lệ nhỏ phục vụ "
                "công bố khoa học của Trường Đại học Mỏ - Địa chất\", chủ nhiệm TS Trần Trung Anh, 10/2025",
    "chuyen_he": "Lambert (BD1trieu_VN2000) → VN-2000 → WGS84 bằng 7 tham số của ứng dụng "
                 "(functions/converter.py); đơn giản hoá ranh ~{tol} m cho hiển thị",
    "luu_y": "Tỷ lệ 1:1.000.000 — chỉ để xem tổng quan; ranh giới có thể lệch vài trăm mét, "
             "không dùng để xác định ranh thửa đất.",
}

# ---------------------------------------------------------------- đọc shapefile
def read_dbf(path):
    b = Path(path).read_bytes()
    n, hlen, rlen = struct.unpack("<IHH", b[4:12])
    fields, o = [], 32
    while b[o] != 0x0D:
        fields.append((b[o:o + 11].split(b"\0")[0].decode(), b[o + 16]))
        o += 32
    rows = []
    for i in range(n):
        rec, p, row = b[hlen + i * rlen + 1: hlen + (i + 1) * rlen], 0, {}
        for name, ln in fields:
            row[name] = rec[p:p + ln].decode("utf-8", "replace").strip()
            p += ln
        rows.append(row)
    return rows


def read_shp(path):
    """Trả về danh sách hình: list các phần (part), mỗi phần là list (x, y)."""
    b = Path(path).read_bytes()
    o, out = 100, []
    while o < len(b):
        rlen = struct.unpack(">i", b[o + 4:o + 8])[0] * 2
        c = o + 8
        stype = struct.unpack("<i", b[c:c + 4])[0]
        if stype in (3, 5):
            nparts, npts = struct.unpack("<ii", b[c + 36:c + 44])
            idx = list(struct.unpack(f"<{nparts}i", b[c + 44:c + 44 + 4 * nparts])) + [npts]
            base = c + 44 + 4 * nparts
            pts = [struct.unpack("<2d", b[base + 16 * i: base + 16 * i + 16]) for i in range(npts)]
            out.append([pts[idx[k]:idx[k + 1]] for k in range(nparts)])
        elif stype == 1:
            out.append([[struct.unpack("<2d", b[c + 4:c + 20])]])
        else:
            out.append([])
        o += 8 + rlen
    return out

# ---------------------------------------------------------------- toán học
A_ELL = 6378137.0
F_ELL = 1 / 298.257223563
E2 = F_ELL * (2 - F_ELL)
E = math.sqrt(E2)

# Lambert 2 vĩ tuyến chuẩn — tham số của "BD1trieu_VN2000"
LCC = dict(lon0=108.0, lat1=11.0, lat2=21.0, lat0=4.0, fe=1_000_000.0, fn=0.0)


def _m(phi):
    return math.cos(phi) / math.sqrt(1 - E2 * math.sin(phi) ** 2)


def _t(phi):
    s = math.sin(phi)
    return math.tan(math.pi / 4 - phi / 2) / ((1 - E * s) / (1 + E * s)) ** (E / 2)


_p1, _p2, _p0 = (math.radians(LCC[k]) for k in ("lat1", "lat2", "lat0"))
_N = (math.log(_m(_p1)) - math.log(_m(_p2))) / (math.log(_t(_p1)) - math.log(_t(_p2)))
_F = _m(_p1) / (_N * _t(_p1) ** _N)
_RHO0 = A_ELL * _F * _t(_p0) ** _N


def lcc_forward(lat, lon):
    """Địa lý VN-2000 (độ) → Lambert (Đông, Bắc) m. Dùng cho kiểm tra."""
    rho = A_ELL * _F * _t(math.radians(lat)) ** _N
    theta = _N * math.radians(lon - LCC["lon0"])
    return LCC["fe"] + rho * math.sin(theta), LCC["fn"] + _RHO0 - rho * math.cos(theta)


def lcc_inverse(east, north):
    """Lambert (Đông, Bắc) m → địa lý VN-2000 (vĩ độ, kinh độ) độ."""
    x, y = east - LCC["fe"], _RHO0 - (north - LCC["fn"])
    rho = math.copysign(math.hypot(x, y), _N)
    theta = math.atan2(x, y)
    t = (rho / (A_ELL * _F)) ** (1 / _N)
    phi = math.pi / 2 - 2 * math.atan(t)
    for _ in range(15):
        s = math.sin(phi)
        phi = math.pi / 2 - 2 * math.atan(t * ((1 - E * s) / (1 + E * s)) ** (E / 2))
    return math.degrees(phi), LCC["lon0"] + math.degrees(theta / _N)


# Krüger (bậc 6) — thuận TM
_n = F_ELL / (2 - F_ELL)
_A = A_ELL / (1 + _n) * (1 + _n ** 2 / 4 + _n ** 4 / 64 + _n ** 6 / 256)
_ALPHA = [
    _n / 2 - 2 * _n ** 2 / 3 + 5 * _n ** 3 / 16 + 41 * _n ** 4 / 180 - 127 * _n ** 5 / 288 + 7891 * _n ** 6 / 37800,
    13 * _n ** 2 / 48 - 3 * _n ** 3 / 5 + 557 * _n ** 4 / 1440 + 281 * _n ** 5 / 630 - 1983433 * _n ** 6 / 1935360,
    61 * _n ** 3 / 240 - 103 * _n ** 4 / 140 + 15061 * _n ** 5 / 26880 + 167603 * _n ** 6 / 181440,
    49561 * _n ** 4 / 161280 - 179 * _n ** 5 / 168 + 6601661 * _n ** 6 / 7257600,
    34729 * _n ** 5 / 80640 - 3418889 * _n ** 6 / 1995840,
    212378941 * _n ** 6 / 319334400,
]


def tm3_forward(lat, lon, lon0, k0=0.9999, fe=500_000.0):
    """Địa lý VN-2000 → phẳng TM (Bắc x, Đông y) theo quy ước VN-2000."""
    phi, lam = math.radians(lat), math.radians(lon - lon0)
    tau = math.sinh(math.atanh(math.sin(phi)) - E * math.atanh(E * math.sin(phi)))
    xi = math.atan2(tau, math.cos(lam))
    eta = math.atanh(math.sin(lam) / math.sqrt(1 + tau * tau))
    x = xi + sum(a * math.sin(2 * j * xi) * math.cosh(2 * j * eta) for j, a in enumerate(_ALPHA, 1))
    y = eta + sum(a * math.cos(2 * j * xi) * math.sinh(2 * j * eta) for j, a in enumerate(_ALPHA, 1))
    return k0 * _A * x, fe + k0 * _A * y


def lcc_to_wgs84(east, north):
    """Lambert VN-2000 → (kinh độ, vĩ độ) WGS84 qua hàm chuyển đổi của app."""
    lat, lon = lcc_inverse(east, north)
    lon0 = round(lon * 4) / 4                      # kinh tuyến trục gần nhất → |lon - lon0| ≤ 0,125°
    x, y = tm3_forward(lat, lon, lon0)
    lat_w, lon_w, _ = vn2000_to_wgs84_baibao(x, y, 0.0, lon0)
    return lon_w, lat_w

# ---------------------------------------------------------------- hình học
def simplify(points, tol):
    """Douglas–Peucker (không đệ quy). points: list (x, y) đơn vị độ; tol: độ."""
    n = len(points)
    if n < 3:
        return points
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        (x1, y1), (x2, y2) = points[i], points[j]
        dx, dy = x2 - x1, y2 - y1
        d2 = dx * dx + dy * dy
        best, idx = -1.0, -1
        for k in range(i + 1, j):
            px, py = points[k]
            if d2 == 0:
                dist = (px - x1) ** 2 + (py - y1) ** 2
            else:
                t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / d2))
                dist = (px - x1 - t * dx) ** 2 + (py - y1 - t * dy) ** 2
            if dist > best:
                best, idx = dist, k
        if idx > 0 and best > tol * tol:
            keep[idx] = True
            stack += [(i, idx), (idx, j)]
    return [p for p, k in zip(points, keep) if k]


def ring_area(ring):
    return sum(ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1] for i in range(len(ring) - 1)) / 2


def point_in_ring(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def label_point(polygons):
    """Điểm đặt nhãn: trong vùng lớn nhất, xa ranh nhất trên lưới 40×40 (gần đúng 'polylabel')."""
    ring = max((p[0] for p in polygons), key=lambda r: abs(ring_area(r)))
    xs, ys = [p[0] for p in ring], [p[1] for p in ring]
    best, best_d = None, -1.0
    steps = 40
    for i in range(1, steps):
        for j in range(1, steps):
            x = min(xs) + (max(xs) - min(xs)) * i / steps
            y = min(ys) + (max(ys) - min(ys)) * j / steps
            if not point_in_ring(x, y, ring):
                continue
            d = min((x - px) ** 2 + ((y - py) * 1.0) ** 2 for px, py in ring[::4])
            if d > best_d:
                best, best_d = (x, y), d
    return best or (sum(xs) / len(xs), sum(ys) / len(ys))


def to_polygons(parts, cache, tol, min_area=0.0):
    """Các phần (vòng) shapefile → list polygon GeoJSON [[vòng ngoài], lỗ…] theo WGS84.
    Shapefile: vòng ngoài theo chiều kim đồng hồ, lỗ ngược chiều."""
    rings = []
    for part in parts:
        ring = []
        for x, y in part:
            key = (x, y)
            if key not in cache:
                lon, lat = lcc_to_wgs84(x, y)
                cache[key] = (lon, lat)
            ring.append(cache[key])
        ring = simplify(ring, tol)
        if len(ring) >= 4:
            rings.append(ring)
    polys = []
    for r in rings:
        if ring_area(r) < 0:                         # chiều kim đồng hồ (lon/lat) → vòng ngoài
            if abs(ring_area(r)) >= min_area:
                polys.append([r])
    for r in rings:
        if ring_area(r) > 0 and polys:               # lỗ → gắn vào vòng ngoài chứa nó
            for p in polys:
                if point_in_ring(r[0][0], r[0][1], p[0]):
                    p.append(r)
                    break
    return [[[[round(x, 5), round(y, 5)] for x, y in r] for r in p] for p in polys]


def to_lines(parts, cache, tol):
    out = []
    for part in parts:
        line = []
        for x, y in part:
            key = (x, y)
            if key not in cache:
                cache[key] = lcc_to_wgs84(x, y)
            line.append(cache[key])
        line = simplify(line, tol)
        if len(line) >= 2:
            out.append([[round(x, 5), round(y, 5)] for x, y in line])
    return out


def feature(lop, geom_type, coords, **props):
    return {"type": "Feature", "properties": {"lop": lop, **props},
            "geometry": {"type": geom_type, "coordinates": coords}}

# ---------------------------------------------------------------- chính
TOL_M = 30                    # đơn giản hoá ~30 m: không thấy được ở zoom ≤ 10 (1 px ≈ 150 m)
TOL_DEG = TOL_M / 111_000


def main(src, dst):
    src = Path(src)
    prj = (src / "HanhChinhTinh.prj").read_text(encoding="utf-8", errors="replace")
    for key in ("Lambert_Conformal_Conic", '"Central_Meridian",108', '"Standard_Parallel_1",11',
                '"Standard_Parallel_2",21', '"Latitude_Of_Origin",4', '"False_Easting",1000000'):
        if key not in prj.replace(".0]", "]").replace(".0,", ","):
            sys.exit(f"Hệ toạ độ không như mong đợi (thiếu {key}) — kiểm tra lại tham số LCC.")

    cache, feats = {}, []

    # Nước láng giềng. Bản ghi 0 (filter = 1) là vùng BIỂN trong khung bản đồ (đất liền là lỗ);
    # bản ghi 1 (filter = NULL) là ĐẤT LIỀN các nước → lấy bản ghi 1. Biển = màu nền bản đồ.
    lc = read_shp(src / "QuocGiaLanCan.shp")[1]
    feats.append(feature("lan_can", "MultiPolygon", to_polygons(lc, cache, TOL_DEG * 3, 1e-4)))

    # 34 tỉnh
    tinh_shp, tinh_dbf = read_shp(src / "HanhChinhTinh.shp"), read_dbf(src / "HanhChinhTinh.dbf")
    labels = []
    for parts, row in zip(tinh_shp, tinh_dbf):
        polys = to_polygons(parts, cache, TOL_DEG)
        ten = row["ten"]
        # Không lấy "dienTich": ở tỉnh đã sáp nhập, giá trị này vẫn là diện tích tỉnh cũ
        # (vd Quảng Trị ghi 4 657,5 km² trong khi ranh đã gồm cả Quảng Bình).
        props = dict(ten=ten, ma=row["maDonViHan"], vung=row["Vung"])
        feats.append(feature("tinh", "MultiPolygon", polys, **props))
        lx, ly = label_point(polys)
        labels.append(feature("nhan_tinh", "Point", [round(lx, 4), round(ly, 4)], ten=ten))

    # Quần đảo xa bờ (phần thứ nhất của RG_QuocGia_merge): vẽ riêng để vẫn thấy ở zoom nhỏ
    dao = read_shp(src / "RG_QuocGia_merge.shp")[0]
    dao_polys = to_polygons(dao, cache, TOL_DEG / 3)
    feats.append(feature("quan_dao", "MultiPolygon", dao_polys))

    # Biên giới
    lines = read_shp(src / "RG_QuocGia_Line.shp")
    line_ids = [r["id"] for r in read_dbf(src / "RG_QuocGia_Line.dbf")]
    for parts, lid in zip(lines, line_ids):
        if lid == "1":
            feats.append(feature("bien_gioi", "MultiLineString", to_lines(parts, cache, TOL_DEG)))
        elif lid == "4":
            feats.append(feature("bien_gioi_lc", "MultiLineString", to_lines(parts, cache, TOL_DEG * 3)))

    # Nhãn quần đảo: tâm các đảo phía bắc (> 13°N) là Hoàng Sa, phía nam là Trường Sa
    def center(pts):
        return [round(sum(p[0] for p in pts) / len(pts), 3), round(sum(p[1] for p in pts) / len(pts), 3)]
    outer = [pt for p in dao_polys for pt in p[0]]
    hs = [pt for pt in outer if pt[1] > 13 and pt[0] > 110]
    ts = [pt for pt in outer if pt[1] < 13 and pt[0] > 111]
    labels += [
        feature("nhan_bien", "Point", center(hs), ten="QĐ. Hoàng Sa", phu="(TP. Đà Nẵng – Việt Nam)"),
        feature("nhan_bien", "Point", center(ts), ten="QĐ. Trường Sa", phu="(Khánh Hòa – Việt Nam)"),
    ]
    # Nhãn biển và nước láng giềng: vị trí đặt tay theo bố cục bản đồ NV25-44 (chỉ để ghi chú, không phải dữ liệu)
    for ten, lon, lat, lop in [
        ("BIỂN ĐÔNG", 112.6, 13.6, "nhan_bien"),
        ("TRUNG QUỐC", 108.6, 23.6, "nhan_nuoc"), ("LÀO", 102.9, 19.6, "nhan_nuoc"),
        ("THÁI LAN", 101.6, 15.6, "nhan_nuoc"), ("CAMPUCHIA", 104.9, 12.9, "nhan_nuoc"),
        ("Đ. Hải Nam", 109.7, 19.2, "nhan_nuoc"),
    ]:
        labels.append(feature(lop, "Point", [lon, lat], ten=ten, vi_tri="đặt tay"))
    # Đảo, quần đảo luôn ghi chú (theo bản đồ NV25-44 và góp ý của TS Trần Trung Anh). Toạ độ: vị trí đảo
    # (gần đúng, đặt tay); đơn vị hành chính theo Nghị quyết 202/2025/QH15.
    for ten, phu, y_nghia, lon, lat in [
        ("Đ. Bạch Long Vĩ", "(TP. Hải Phòng – Việt Nam)", "Điểm chủ quyền quan trọng ở Vịnh Bắc Bộ", 107.727, 20.133),
        ("Đ. Phú Quốc", "(An Giang – Việt Nam)", "Đảo lớn nhất Việt Nam, quan trọng ở vùng biển Tây Nam", 103.96, 10.23),
        ("QĐ. Thổ Chu", "(An Giang – Việt Nam)", "Cực Tây Nam vùng biển Việt Nam", 103.47, 9.30),
        ("QĐ. Côn Sơn", "(TP. Hồ Chí Minh – Việt Nam)", "Côn Đảo — vùng biển phía Nam", 106.61, 8.69),
        ("Đ. Phú Quý", "(Lâm Đồng – Việt Nam)", "Vùng biển Nam Trung Bộ", 108.94, 10.52),
        ("Đ. Lý Sơn", "(Quảng Ngãi – Việt Nam)", "Vùng biển miền Trung", 109.12, 15.38),
        ("Đ. Cồn Cỏ", "(Quảng Trị – Việt Nam)", "Đảo tiền tiêu của tỉnh Quảng Trị", 107.34, 17.16),
    ]:
        labels.append(feature("nhan_dao", "Point", [lon, lat], ten=ten, phu=phu, y_nghia=y_nghia, vi_tri="đặt tay"))
    feats += labels

    out = {
        "type": "FeatureCollection",
        "name": "nen_hanhchinh",
        "nguon": {k: v.format(tol=TOL_M) for k, v in NGUON.items()},
        "features": feats,
    }
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    Path(dst).write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    n_pts = sum(len(json.dumps(f["geometry"]["coordinates"])) for f in feats)
    print(f"{len(tinh_shp)} tỉnh, {len(feats)} đối tượng, {len(cache)} đỉnh gốc đã chuyển; "
          f"file {Path(dst).stat().st_size / 1e6:.2f} MB ({n_pts} ký tự toạ độ)")
    if len(tinh_shp) != 34:
        sys.exit("Số tỉnh khác 34 — kiểm tra dữ liệu.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else ROOT / "docs" / "data" / "nen_hanhchinh.geojson")
