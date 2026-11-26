"""Test lớp quy hoạch bằng dữ liệu giả nhỏ (không đọc file 42MB thật)."""
import json

import folium
import pytest

from functions.converter import wgs84_to_vn2000_baibao
from functions.planning_layer import LAYER_LON0, PlanningLayer, add_planning_to_map

LAT, LON = 16.70, 106.60


def square(east, north, half):
    return {
        "type": "Feature",
        "properties": {"blank": ""},
        "geometry": {"type": "Polygon", "coordinates": [[
            [east - half, north - half], [east + half, north - half],
            [east + half, north + half], [east - half, north + half],
            [east - half, north - half],
        ]]},
    }


@pytest.fixture
def layer(tmp_path):
    north, east, _ = wgs84_to_vn2000_baibao(LAT, LON, 0.0, LAYER_LON0)
    data = {
        "type": "FeatureCollection",
        "features": [
            square(east + 100, north, 10),   # 0: gần, không chứa điểm
            square(east, north, 10),         # 1: chứa điểm (20 m x 20 m)
            square(east + 5000, north, 10),  # 2: xa 5 km
        ],
    }
    path = tmp_path / "qh.geojson"
    path.write_text(json.dumps(data), encoding="utf-8")
    return PlanningLayer.load(path)


def test_chi_lay_thua_gan_va_danh_dau_thua_chua_diem(layer):
    fc, total, truncated = layer.nearby([("A", LAT, LON)], radius_m=300)
    assert total == 2 and not truncated
    first = fc["features"][0]["properties"]
    assert first["chua_diem"] == "A"                     # thửa chứa điểm xếp đầu
    assert first["dien_tich"] == "400.0 m²"
    assert fc["features"][1]["properties"]["chua_diem"] == ""
    assert "blank" not in first


def test_cat_bot_van_giu_thua_chua_diem(layer):
    fc, total, truncated = layer.nearby([("A", LAT, LON)], radius_m=300, limit=1)
    assert total == 2 and truncated
    assert fc["features"][0]["properties"]["chua_diem"] == "A"


def test_hinh_hoc_doi_sang_lon_lat(layer):
    fc, _, _ = layer.nearby([("A", LAT, LON)], radius_m=50)
    ring = fc["features"][0]["geometry"]["coordinates"][0][0]
    for lon, lat in ring:
        assert lon == pytest.approx(LON, abs=0.001)
        assert lat == pytest.approx(LAT, abs=0.001)


def test_khong_co_diem(layer):
    fc, total, truncated = layer.nearby([])
    assert fc["features"] == [] and total == 0 and not truncated


def test_ve_len_ban_do(layer):
    m = folium.Map(location=[LAT, LON])
    fc, _, _ = layer.nearby([("A", LAT, LON)])
    add_planning_to_map(m, fc)
    html = m.get_root().render()   # không lỗi khi dựng HTML
    assert "Di\\u1ec7n t\\u00edch" in html or "Diện tích" in html
