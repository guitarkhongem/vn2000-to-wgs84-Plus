"""
Lớp quy hoạch Hướng Hóa (data/QHHUONGHOA_30.geojson).

Dữ liệu gốc:
- CRS: EPSG:9212 (VN-2000 / TM-3, kinh tuyến trục 106°15' = 106.25), toạ độ dạng [Đông, Bắc].
- ~19 800 polygon, ~1 triệu đỉnh, thuộc tính ma_dat, ten_dat, mau, nguon
  (tạo bởi scripts/extract_landuse_mapinfo.py từ bản MapInfo của bản đồ quy hoạch).

Vì file rất nặng, chỉ những polygon gần các điểm người dùng nhập mới được
chuyển sang WGS84 và vẽ lên bản đồ. Không import streamlit ở đây — cache nằm ở app.py.
"""
import json
from pathlib import Path

import folium
from shapely.geometry import Point, box, shape
from shapely.strtree import STRtree

from functions.converter import vn2000_to_wgs84_baibao, wgs84_to_vn2000_baibao

LAYER_PATH = Path(__file__).resolve().parent.parent / "data" / "QHHUONGHOA_30.geojson"
LAYER_LON0 = 106.25  # kinh tuyến trục của EPSG:9212


class PlanningLayer:
    def __init__(self, geoms, props, lon0=LAYER_LON0):
        self.geoms = geoms              # shapely, toạ độ (Đông, Bắc) VN-2000
        self.props = props              # thuộc tính không rỗng của từng polygon
        self.lon0 = lon0
        self.tree = STRtree(geoms)
        self._wgs_cache = {}            # index → geometry GeoJSON đã đổi sang lon/lat

    @classmethod
    def load(cls, path=LAYER_PATH, lon0=LAYER_LON0):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        geoms, props = [], []
        for feat in data.get("features", []):
            if not feat.get("geometry"):
                continue
            geoms.append(shape(feat["geometry"]))
            props.append({k: v for k, v in (feat.get("properties") or {}).items()
                          if v not in ("", None) and k != "blank"})
        return cls(geoms, props, lon0)

    # ---------- chuyển hệ ----------
    def _to_layer_xy(self, lat, lon):
        """WGS84 → (Đông, Bắc) theo CRS của lớp (không phụ thuộc lon0 người dùng chọn)."""
        north, east, _ = wgs84_to_vn2000_baibao(lat, lon, 0.0, self.lon0)
        return east, north

    def _ring_to_lonlat(self, ring):
        out = []
        for east, north in ring.coords:
            lat, lon, _ = vn2000_to_wgs84_baibao(north, east, 0.0, self.lon0)
            out.append([lon, lat])
        return out

    def _geom_to_geojson(self, idx):
        if idx not in self._wgs_cache:
            g = self.geoms[idx]
            polys = list(g.geoms) if g.geom_type == "MultiPolygon" else [g]
            coords = [
                [self._ring_to_lonlat(p.exterior)] + [self._ring_to_lonlat(r) for r in p.interiors]
                for p in polys
            ]
            self._wgs_cache[idx] = {"type": "MultiPolygon", "coordinates": coords}
        return self._wgs_cache[idx]

    # ---------- truy vấn ----------
    def nearby(self, points, radius_m=300, limit=400):
        """
        points: danh sách (tên, lat, lon) theo WGS84.
        Trả về (FeatureCollection lon/lat, số polygon tìm thấy, có bị cắt bớt không).
        Polygon chứa điểm được xếp trước nên luôn được vẽ.
        """
        if not points:
            return {"type": "FeatureCollection", "features": []}, 0, False

        pts = [(name, Point(*self._to_layer_xy(lat, lon))) for name, lat, lon in points]
        xs = [p.x for _, p in pts]
        ys = [p.y for _, p in pts]
        query = box(min(xs) - radius_m, min(ys) - radius_m,
                    max(xs) + radius_m, max(ys) + radius_m)
        hits = [int(i) for i in self.tree.query(query)]

        rows = []
        for i in hits:
            try:
                inside = [name for name, p in pts if self.geoms[i].covers(p)]
            except Exception:   # polygon lỗi hình học trong dữ liệu gốc
                inside = []
            rows.append((i, inside))
        rows.sort(key=lambda r: (not r[1], r[0]))   # có điểm bên trong lên trước

        total = len(rows)
        truncated = total > limit
        features = []
        for i, inside in rows[:limit]:
            p = self.props[i]
            properties = {   # mọi thửa có đủ các khoá này (tooltip folium cần khoá giống nhau)
                "chua_diem": ", ".join(map(str, inside)),
                "dien_tich": f"{self.geoms[i].area:,.1f} m²",
                "ma_dat": str(p.get("ma_dat") or "—"),
                "ten_dat": str(p.get("ten_dat") or "Chưa xác định"),
                "mau": str(p.get("mau") or ""),
            }
            features.append({
                "type": "Feature",
                "properties": properties,
                "geometry": self._geom_to_geojson(i),
            })
        return {"type": "FeatureCollection", "features": features}, total, truncated


def add_planning_to_map(map_obj, feature_collection):
    """Vẽ lớp quy hoạch: tô theo màu quy hoạch gốc (thuộc tính mau); thửa chứa điểm viền cam đậm."""
    if not feature_collection["features"]:
        return

    def style(feat):
        p = feat["properties"]
        fill = p.get("mau") or "#ffd600"
        if p.get("chua_diem"):
            return {"color": "#ff3d00", "weight": 4, "fillColor": fill, "fillOpacity": 0.75}
        return {"color": "#8d6e00", "weight": 1, "fillColor": fill, "fillOpacity": 0.5}

    folium.GeoJson(
        feature_collection,
        name="Quy hoạch Hướng Hóa",
        style_function=style,
        highlight_function=lambda _: {"weight": 4, "color": "#00e5ff"},
        tooltip=folium.GeoJsonTooltip(
            fields=["ten_dat", "ma_dat", "dien_tich", "chua_diem"],
            aliases=["Loại đất:", "Mã:", "Diện tích:", "Chứa điểm:"],
            sticky=True,
        ),
    ).add_to(map_obj)
