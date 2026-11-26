import os
import re
import tempfile

import streamlit as st
import pandas as pd
import folium
from streamlit_folium import st_folium
from PIL import Image

# --- Custom functions ---
from functions.background import set_background
from functions.parse import parse_coordinates, parse_wgs84
from functions.kml import df_to_kml
from functions.footer import show_footer
from functions.converter import vn2000_to_wgs84_baibao, wgs84_to_vn2000_baibao
from functions.edges import add_edge_lengths
from functions.markers import add_numbered_markers
from functions.polygon import draw_polygon
from functions.area import compare_areas
from functions.lon0_selector import select_lon0
from functions.sort_utils import sort_point_name
from functions.EdgeLengths import compute_edge_lengths
from functions.export_dxf import export_to_dxf
from functions.planning_layer import LAYER_PATH, PlanningLayer, add_planning_to_map


@st.cache_resource(show_spinner="Đang nạp lớp quy hoạch Hướng Hóa (lần đầu hơi lâu)…")
def get_planning_layer():
    """Nạp 1 lần cho cả server, dùng chung cho mọi người dùng."""
    if not LAYER_PATH.exists():
        return None
    return PlanningLayer.load(LAYER_PATH)

# =========================
# Page setup
# =========================
st.set_page_config(page_title="VN2000 ⇄ WGS84 Converter", layout="wide")
set_background("assets/background.png")

st.markdown("""
<style>
div.stButton > button, div.stDownloadButton > button {
    color: #B30000;
    font-weight: bold;
}
iframe {
    height: 400px !important;
}
</style>
""", unsafe_allow_html=True)

# =========================
# Header
# =========================
col1, col2 = st.columns([1, 5])
with col1:
    st.image("assets/logo.jpg", width=90)
with col2:
    st.title("VN2000 ⇄ WGS84 Converter")
    st.markdown("### BẤT ĐỘNG SẢN HUYỆN HƯỚNG HÓA")

# =========================
# Longitude selector
# =========================
lon0 = select_lon0()

# =========================
# Layout
# =========================
col_left, col_mid, col_map = st.columns([1, 1, 2])

# =========================
# Input
# =========================
with col_left:
    uploaded_file = st.file_uploader("📄 Upload TXT / CSV", ["txt", "csv"])
    content = uploaded_file.read().decode("utf-8") if uploaded_file else ""
    coords_input = st.text_area("Toạ độ", content, height=180)

    st.markdown("### 🔄 Chuyển đổi")
    tab1, tab2 = st.tabs(["VN2000 ➜ WGS84", "WGS84 ➜ VN2000"])

# =========================
# VN2000 ➜ WGS84
# =========================
with tab1:
    if st.button("➡️ Chuyển sang WGS84"):
        parsed, _ = parse_coordinates(coords_input)

        if parsed:
            df = pd.DataFrame(
                [(t, *vn2000_to_wgs84_baibao(x, y, h, lon0)) for t, x, y, h in parsed],
                columns=["Tên điểm", "Vĩ độ (Lat)", "Kinh độ (Lon)", "H (m)"]
            )

            st.session_state.df = df
            # Lưu XY VN2000 gốc, cùng thứ tự (index) với df, để tính diện tích
            st.session_state.xy = [(x, y) for _, x, y, _ in parsed]

            st.session_state.textout = "\n".join(
                f"{r['Tên điểm']} {r['Vĩ độ (Lat)']} {r['Kinh độ (Lon)']} {r['H (m)']}"
                for _, r in df.iterrows()
            )

        else:
            st.error("Không có dữ liệu hợp lệ")


# =========================
# WGS84 ➜ VN2000
# =========================
with tab2:
    if st.button("⬅️ Chuyển sang VN2000"):
        pts, wgs_errors = parse_wgs84(coords_input)

        if wgs_errors:
            st.warning(
                "⚠️ Bỏ qua các dòng không hợp lệ:\n\n"
                + "\n".join(f"- `{e[0]}` — {e[1]}" for e in wgs_errors)
            )

        if pts:
            df = pd.DataFrame(
                [
                    (name, *wgs84_to_vn2000_baibao(lat, lon, h, lon0))
                    for name, lat, lon, h in pts
                ],
                columns=["Tên điểm", "X (m)", "Y (m)", "H (m)"]
            )

            # ✅ GÁN SESSION STATE ĐÚNG CHỖ
            st.session_state.df = df
            st.session_state.pop("xy", None)

            st.session_state.textout = "\n".join(
                f"{r['Tên điểm']} {r['X (m)']} {r['Y (m)']} {r['H (m)']}"
                for _, r in df.iterrows()
            )

        else:
            st.error("⚠️ Không có dữ liệu hợp lệ để chuyển sang VN2000")


# =========================
# Output + CAD
# =========================
with col_mid:
    if "df" in st.session_state:
        df = st.session_state.df
        st.dataframe(df)

        st.download_button(
            "📀 CSV",
            df.to_csv(index=False),
            "points.csv"
        )

    if "textout" in st.session_state:
        st.text_area(
            "📄 Text kết quả (copy nhanh)",
            st.session_state.textout,
            height=200
        )


        kml = df_to_kml(df)
        if kml:
            st.download_button("🌍 KML", kml, "points.kml")

        st.markdown("### 🧱 Xuất CAD (DXF)")
        if st.button("📐 Xuất DXF"):
            pts = []

            if {"X (m)", "Y (m)"} <= set(df.columns):
                pts = [(r["Tên điểm"], r["X (m)"], r["Y (m)"]) for _, r in df.iterrows()]
            else:
                parsed, _ = parse_coordinates(coords_input)
                pts = [(t, x, y) for t, x, y, _ in parsed]

            if pts:
                with tempfile.NamedTemporaryFile(delete=False, suffix=".dxf") as tmp:
                    tmp_path = tmp.name
                try:
                    export_to_dxf(pts, tmp_path)
                    with open(tmp_path, "rb") as f:
                        dxf_bytes = f.read()
                finally:
                    os.remove(tmp_path)
                st.download_button("⬇️ Tải DXF", dxf_bytes, "toado_vn2000.dxf")

# =========================
# Map
# =========================
# =========================
# Map
# =========================
with col_map:
    if "df" in st.session_state and {"Vĩ độ (Lat)", "Kinh độ (Lon)"} <= set(st.session_state.df.columns):
        dfm = st.session_state.df.sort_values(
            "Tên điểm", key=lambda c: c.map(sort_point_name)
        )

        col_btn1, col_btn2, col_btn3 = st.columns(3)

        # --- Nối điểm ---
        with col_btn1:
            if st.button("🔵 Nối điểm"):
                st.session_state.join_points = not st.session_state.get("join_points", False)

        # --- Tính diện tích ---
        with col_btn2:
            if st.button("📐 Tính diện tích"):
                # Lấy XY VN2000 theo CÙNG thứ tự với dfm (đã sắp theo tên điểm)
                # để hai cách tính diện tích dùng cùng một đa giác
                xy_all = st.session_state.get("xy", [])
                xy_points = [xy_all[i] for i in dfm.index if i < len(xy_all)]

                latlon_points = [
                    (r["Vĩ độ (Lat)"], r["Kinh độ (Lon)"])
                    for _, r in dfm.iterrows()
                ]

                if len(xy_points) != len(latlon_points):
                    st.warning("⚠️ Dữ liệu đã thay đổi, hãy bấm Chuyển sang WGS84 lại")
                elif len(xy_points) >= 3:
                    # A1, A2 là m²; không dùng ha1/ha2 vì compare_areas làm tròn ha 1 chữ số (0.22 → 0.2)
                    A1, A2, _, _, _ = compare_areas(xy_points, latlon_points)
                    st.info(
                        f"📐 Diện tích VN2000: {A1:,.1f} m² ({A1 / 10000:.4f} ha) | "
                        f"WGS84: {A2:,.1f} m² ({A2 / 10000:.4f} ha)"
                    )
                else:
                    st.warning("⚠️ Cần tối thiểu 3 điểm để tính diện tích")

        # --- Hiện chiều dài cạnh ---
        with col_btn3:
            if st.button("📏 Hiện cạnh"):
                st.session_state.show_lengths = not st.session_state.get("show_lengths", False)
        map_type = st.selectbox(
    "Chế độ bản đồ",
    ["Giao Thông", "Vệ tinh"]
)
        tileset = "OpenStreetMap" if map_type == "Giao Thông" else "Esri.WorldImagery"

        # --- Lớp quy hoạch ---
        col_qh1, col_qh2 = st.columns([2, 1])
        with col_qh1:
            show_planning = st.checkbox("🗺️ Hiện lớp quy hoạch Hướng Hóa", key="show_planning")
        with col_qh2:
            planning_radius = st.number_input(
                "Bán kính (m)", min_value=50, max_value=2000, value=300, step=50,
                key="planning_radius", disabled=not show_planning
            )
        # --- Vẽ bản đồ ---
        m = folium.Map(
    location=[dfm.iloc[0]["Vĩ độ (Lat)"], dfm.iloc[0]["Kinh độ (Lon)"]],
    zoom_start=15,
    tiles=tileset
)

        pts = [(r["Vĩ độ (Lat)"], r["Kinh độ (Lon)"]) for _, r in dfm.iterrows()]

        if show_planning:
            layer = get_planning_layer()
            if layer is None:
                st.warning("⚠️ Không tìm thấy file data/QHHUONGHOA_30.geojson")
            else:
                named_pts = [
                    (r["Tên điểm"], r["Vĩ độ (Lat)"], r["Kinh độ (Lon)"])
                    for _, r in dfm.iterrows()
                ]
                fc, total, truncated = layer.nearby(named_pts, radius_m=planning_radius)
                add_planning_to_map(m, fc)
                n_in = sum(1 for f in fc["features"] if f["properties"]["chua_diem"])
                msg = f"🗺️ {total} thửa quy hoạch trong bán kính {planning_radius} m, {n_in} thửa chứa điểm (tô cam)."
                if truncated:
                    msg += f" Chỉ vẽ {len(fc['features'])} thửa — giảm bán kính để xem đủ."
                st.caption(msg)

        if st.session_state.get("join_points", False):
            draw_polygon(m, pts)
            if st.session_state.get("show_lengths", False):
                add_edge_lengths(m, pts)

        add_numbered_markers(m, dfm)
        st_folium(m, width="100%", height=400)


# =========================
# Footer
# =========================
show_footer()
