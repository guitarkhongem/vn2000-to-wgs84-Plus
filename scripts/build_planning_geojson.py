"""
Chuyển lớp quy hoạch Hướng Hóa (VN-2000, EPSG:9212) sang WGS84 để tippecanoe làm PMTiles.

Dùng CHÍNH hàm vn2000_to_wgs84_baibao của app (không dùng PROJ/GDAL) để ranh thửa trên
WebGIS khớp tuyệt đối với điểm người dùng chuyển đổi.

Chạy:  python scripts/build_planning_geojson.py [vào.geojson] [ra.geojsonl]
Ra: GeoJSON mỗi dòng một feature (tippecanoe đọc nhanh), thuộc tính:
    id         — số thứ tự thửa trong file gốc (bắt đầu từ 1)
    dien_tich  — diện tích phẳng VN-2000 (m², Shoelace, trừ lỗ), giống cách app tính
"""
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from functions.area import shoelace_area                     # noqa: E402
from functions.converter import vn2000_to_wgs84_baibao      # noqa: E402

LAYER_LON0 = 106.25   # EPSG:9212 — VN-2000 / TM-3, kinh tuyến trục 106°15'


def ring_to_lonlat(ring, cache):
    out = []
    for east, north in ring:
        key = (east, north)
        if key not in cache:               # đỉnh chung giữa các thửa kề nhau chỉ tính 1 lần
            lat, lon, _ = vn2000_to_wgs84_baibao(north, east, 0.0, LAYER_LON0)
            cache[key] = [lon, lat]
        out.append(cache[key])
    return out


def polygon_area(rings):
    """Diện tích Shoelace: vòng ngoài trừ các lỗ. Toạ độ shoelace_area chỉ cần cặp (a, b)."""
    outer = shoelace_area([tuple(p) for p in rings[0]])
    holes = sum(shoelace_area([tuple(p) for p in r]) for r in rings[1:])
    return outer - holes


def main(src, dst):
    t0 = time.time()
    with open(src, encoding="utf-8") as f:
        data = json.load(f)

    crs = (data.get("crs") or {}).get("properties", {}).get("name", "")
    if crs and not crs.endswith("9212"):
        sys.exit(f"CRS không đúng: {crs} (cần EPSG:9212). Kiểm tra lại LAYER_LON0 trước khi chạy.")

    cache = {}
    n_in = n_out = n_vertices = 0
    lon_min = lat_min = 1e9
    lon_max = lat_max = -1e9

    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    with open(dst, "w", encoding="utf-8") as out:
        for idx, feat in enumerate(data.get("features", []), start=1):
            n_in += 1
            geom = feat.get("geometry") or {}
            gtype = geom.get("type")
            if gtype == "Polygon":
                polys = [geom["coordinates"]]
            elif gtype == "MultiPolygon":
                polys = geom["coordinates"]
            else:
                continue

            area = sum(polygon_area(p) for p in polys if p and len(p[0]) >= 3)
            new_polys = []
            for p in polys:
                rings = [ring_to_lonlat(r, cache) for r in p if len(r) >= 4]
                if rings:
                    new_polys.append(rings)
                    n_vertices += sum(len(r) for r in rings)
                    for lon, lat in rings[0]:
                        lon_min, lon_max = min(lon_min, lon), max(lon_max, lon)
                        lat_min, lat_max = min(lat_min, lat), max(lat_max, lat)
            if not new_polys:
                continue

            out_geom = ({"type": "Polygon", "coordinates": new_polys[0]} if len(new_polys) == 1
                        else {"type": "MultiPolygon", "coordinates": new_polys})
            out.write(json.dumps({
                "type": "Feature",
                "id": idx,
                "properties": {"id": idx, "dien_tich": round(area, 1)},
                "geometry": out_geom,
            }, separators=(",", ":")) + "\n")
            n_out += 1

    print(f"Đọc {n_in} thửa, ghi {n_out} thửa, {n_vertices} đỉnh "
          f"({len(cache)} đỉnh khác nhau) trong {time.time() - t0:.1f}s")
    print(f"Phạm vi WGS84: lon {lon_min:.5f}…{lon_max:.5f}, lat {lat_min:.5f}…{lat_max:.5f}")

    # Kiểm tra nhanh: Hướng Hóa nằm quanh 16.4–17.0°N, 106.4–106.9°E
    if not (106.0 < lon_min < lon_max < 107.2 and 16.0 < lat_min < lat_max < 17.5):
        sys.exit("Phạm vi toạ độ bất thường — dừng lại để kiểm tra.")


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else ROOT / "data" / "QHHUONGHOA_30.geojson"
    dst = sys.argv[2] if len(sys.argv) > 2 else ROOT / "build" / "quyhoach_wgs84.geojsonl"
    main(src, dst)
