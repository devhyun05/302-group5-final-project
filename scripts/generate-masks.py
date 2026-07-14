#!/usr/bin/env python3
"""MediaPipe canonical face mesh에서 메이크업 마스크 PNG를 생성한다.

taran/ellipse 근사(MaskGenerator.cs 폴백) 대신, canonical_face_model.obj의
실제 UV와 MediaPipe 공식 랜드마크 윤곽 인덱스로 정확한 마스크를 만든다.

- lips.png      : 입술 외곽 윤곽 채움 − 입 안(내곽) 제외 → 치아에 안 묻음
- eyeshadow.png : 윗눈꺼풀~눈썹 아래 영역, 눈 자체는 제외, 위로 페더링
- blush.png     : 광대 중심(랜드마크 50/280) 가우시안 falloff

출력: unity/Assets/Resources/Masks/{lips,blush,eyeshadow}.png (1024², grayscale)
미리보기: scripts/out/mask_preview.png (와이어프레임 + 컬러 오버레이)

실행: python3 scripts/generate-masks.py
의존성: pillow, numpy
"""

import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
OBJ_PATH = os.path.join(ROOT, "unity/Assets/StreamingAssets/canonical_face_model.obj")
OUT_DIR = os.path.join(ROOT, "unity/Assets/Resources/Masks")
PREVIEW_DIR = os.path.join(os.path.dirname(__file__), "out")

# ---- MediaPipe face_mesh_connections 기준 윤곽 루프 (0-index, 순서 보장) ----
LIPS_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291,
              375, 321, 405, 314, 17, 84, 181, 91, 146]
LIPS_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308,
              324, 318, 402, 317, 14, 87, 178, 88, 95]

# 입꼬리 — 위·아래 입술 라인이 예각 V로 만나는 코너. uniform Catmull-Rom의
# 코너 접선은 V를 가로질러 곡선이 코너 밖으로 부풀거나 되감긴다(입꼬리
# 우글거림 — 실기기 확인). 코너에 닿는 구간은 건너편 제어점을 코너로 복제해
# 접선을 코드 방향으로 눕힌다. 메시(CanonicalFaceMesh.IsLipCorner)와 동일 규칙.
LIP_CORNERS = {61, 291, 78, 308}

RIGHT_EYE = [33, 246, 161, 160, 159, 158, 157, 173, 133,
             155, 154, 153, 145, 144, 163, 7]          # 위(33→133)+아래(→33)
LEFT_EYE = [263, 466, 388, 387, 386, 385, 384, 398, 362,
            382, 381, 380, 374, 373, 390, 249]

RIGHT_EYE_UPPER = [33, 246, 161, 160, 159, 158, 157, 173, 133]
RIGHT_BROW_LOWER = [46, 53, 52, 65, 55]                # 바깥→안쪽
LEFT_EYE_UPPER = [263, 466, 388, 387, 386, 385, 384, 398, 362]
LEFT_BROW_LOWER = [276, 283, 282, 295, 285]

BLUSH_CENTERS = [50, 280]                              # 광대 중심
BLUSH_RADII_UV = (0.075, 0.055)                        # (rx, ry) UV 단위

# 아이섀도 밴드 범위 (눈꺼풀→눈썹 거리 비율).
# UNDERLAP: 시작점을 눈 안쪽으로 살짝 내려서 블러 후 최대 농도가
#   속눈썹 라인 바로 위(쌍커풀)에 오게 한다. 눈알은 아래에서 따로 뺀다.
# HEIGHT는 눈을 감았을 때 기준으로 잡아야 한다: 감으면 눈꺼풀이 화면에서
# 커지며 UV상 더 높은 영역까지 늘어나므로, 뜬 눈만 보고 낮추면
# 감았을 때 쌍커풀 위쪽이 빈다.
# UNDERLAP을 깊게 잡는 이유: 밴드를 눈 안쪽까지 밀어 넣으면 블러 후에도
# 속눈썹 라인 위치에서 이미 100% 농도가 된다 (라인에서 경사가 시작되면
# 눈 감을 때 눈꺼풀이 늘어나며 그 경사가 옅은 띠로 확대되어 보인다).
# 눈알 안쪽은 아래의 eyes 차감이 라인에서 정확히 잘라낸다.
SHADOW_UNDERLAP = -0.3
SHADOW_HEIGHT = 0.65

# 립 외곽 경계 리맵: 블러된 경계값 v를 (v-ZERO)/RAMP로 콘트라스트 스트레치.
# ZERO=0.5 → 립 라인(v=0.5)에서 정확히 0. 라인을 살짝 넘겨 칠하고 싶으면
# 0.45쯤으로, 더 안쪽에서 자르고 싶으면 0.55쯤으로 (실기기 튜닝 노브).
# RAMP는 램프 폭: 0.35 ≈ UV 2.2px (화면 ~6px AA). 줄이면 더 하드한 엣지.
LIP_EDGE_ZERO = 0.5
LIP_EDGE_RAMP = 0.35


def load_uvs(path):
    """OBJ에서 버텍스 인덱스 → UV 매핑을 만든다 (f의 v/vt 페어 기준)."""
    uvs_raw, vt_of_vertex, vertex_count = [], {}, 0
    with open(path, encoding="utf-8") as f:
        for line in f:
            parts = line.split()
            if not parts:
                continue
            if parts[0] == "v":
                vertex_count += 1
            elif parts[0] == "vt":
                uvs_raw.append((float(parts[1]), float(parts[2])))
            elif parts[0] == "f":
                for token in parts[1:4]:
                    pair = token.split("/")
                    v = int(pair[0]) - 1
                    if len(pair) > 1 and pair[1]:
                        vt_of_vertex[v] = int(pair[1]) - 1

    uv = np.zeros((vertex_count, 2), dtype=np.float64)
    for v, vt in vt_of_vertex.items():
        uv[v] = uvs_raw[vt]
    return uv


def load_triangles(path):
    tris = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            parts = line.split()
            if parts and parts[0] == "f":
                tris.append([int(t.split("/")[0]) - 1 for t in parts[1:4]])
    return tris


def to_px(uv_pt):
    """UV(원점 좌하단) → 이미지 픽셀(원점 좌상단). Unity 임포트 시 방향 일치."""
    u, v = uv_pt
    return (u * (SIZE - 1), (1.0 - v) * (SIZE - 1))


def polygon_mask_points(points_uv, blur=0.0, dilate=0):
    img = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(img).polygon([to_px(p) for p in points_uv], fill=255)
    if dilate > 0:
        img = img.filter(ImageFilter.MaxFilter(dilate * 2 + 1))
    if blur > 0:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(img, dtype=np.float64) / 255.0


def polygon_mask(uv, indices, blur=0.0, dilate=0):
    return polygon_mask_points([uv[i] for i in indices], blur, dilate)


def lerp_pt(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def catmull_rom(pts, samples=8, closed=True, corners=()):
    """랜드마크 폴리곤을 Catmull-Rom 스플라인으로 곡선 보간.
    직선 연결로 그리면 입술선이 팔각형처럼 각져 보인다 (실기기 확인).
    corners(pts 내 위치 집합)에 닿는 구간은 건너편 제어점을 코너로 복제해
    코너를 뾰족하게 유지한다 (LIP_CORNERS 주석 참고)."""
    pts = [np.asarray(p, dtype=float) for p in pts]
    n = len(pts)
    corners = set(corners)
    out = []
    segments = range(n) if closed else range(n - 1)
    for i in segments:
        j = (i + 1) % n if closed else min(i + 1, n - 1)
        p1 = pts[i]
        p2 = pts[j]
        p0 = p1 if i in corners else (pts[(i - 1) % n] if closed else pts[max(i - 1, 0)])
        p3 = p2 if j in corners else (pts[(i + 2) % n] if closed else pts[min(i + 2, n - 1)])
        for t in np.linspace(0.0, 1.0, samples, endpoint=False):
            t2, t3 = t * t, t * t * t
            point = 0.5 * ((2.0 * p1) + (-p0 + p2) * t
                           + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2
                           + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3)
            out.append((point[0], point[1]))
    if not closed:
        out.append((pts[-1][0], pts[-1][1]))
    return out


def smooth_loop(uv, indices):
    corners = [k for k, i in enumerate(indices) if i in LIP_CORNERS]
    return catmull_rom([uv[i] for i in indices], closed=True, corners=corners)


def polyline_sample(pts, t):
    """폴리라인을 아크길이 0~1로 파라미터화해 t 위치의 점을 반환."""
    dists = [float(np.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]))
             for i in range(len(pts) - 1)]
    total = sum(dists) or 1.0
    target, acc = t * total, 0.0
    for i, d in enumerate(dists):
        if acc + d >= target or i == len(dists) - 1:
            local = (target - acc) / d if d > 0 else 0.0
            return lerp_pt(pts[i], pts[i + 1], min(max(local, 0.0), 1.0))
        acc += d
    return pts[-1]


def gaussian_spot(center_uv, rx, ry):
    cx, cy = to_px(center_uv)
    y, x = np.mgrid[0:SIZE, 0:SIZE]
    dx = (x - cx) / (rx * SIZE)
    dy = (y - cy) / (ry * SIZE)
    return np.exp(-(dx * dx + dy * dy) * 1.8)


def save_gray(arr, path):
    Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), "L").save(path)
    print(f"  wrote {os.path.relpath(path, ROOT)}")


def save_rg(r, g, path):
    rgb = np.zeros((SIZE, SIZE, 3), dtype=np.uint8)
    rgb[..., 0] = (np.clip(r, 0, 1) * 255).astype(np.uint8)
    rgb[..., 1] = (np.clip(g, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(rgb, "RGB").save(path)
    print(f"  wrote {os.path.relpath(path, ROOT)} (R=open-safe, G=closed-extension)")


def main():
    if not os.path.exists(OBJ_PATH):
        sys.exit(f"canonical obj 없음: {OBJ_PATH} — scripts/setup-mediapipe.sh 먼저 실행")

    uv = load_uvs(OBJ_PATH)
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    print(f"[generate-masks] canonical UV {len(uv)} verts")

    # 립 2채널 (셰이더가 _MouthOpen으로 블렌딩):
    #   R = 입을 벌려도 안전한 영역 — 입안 보호를 넉넉히 뺀 버전
    #   G = 안쪽 확장 — 다물었을 때만 나타나 안쪽 라인까지 칠해지는 영역
    # 정적 마스크로는 "다물면 안쪽까지 / 벌리면 치아 보호"가 양립 불가라
    # 동적으로 전환한다. 입안 보호는 팽창으로 블러 피크 손실을 보상하고
    # ×2.2 클립 → 중심부 완전 차단(잔값 없음).
    # 외곽 경계: dilate+blur 조합은 50% 지점이 라인 밖 +2.5~4px, 꼬리가
    # +5~8px까지 새는 프로파일을 만든다 — 입 벌려 피부가 화면에서 2.5~4배로
    # 늘어나면 15px+ 번짐("먹물")이 되고, 꼬리 두께가 구간마다 달라 경계
    # 등고선이 우글거린다 (실기기 + 프로파일 실측). dilate 없이 굽고 리맵으로
    # 라인에서 정확히 0, 안쪽 LIP_EDGE_RAMP px에서 100%가 되게 한다.
    outer = polygon_mask_points(smooth_loop(uv, LIPS_OUTER), blur=2.5)
    # Gaussian σ2.5: 라인 위 v=0.5, 안쪽으로 갈수록 상승. (v-0.5)/0.35 리맵
    # → 라인 밖 잔값 제거 + 안쪽 ~2.2px 램프(화면에서 ~6px AA)만 남는다.
    outer = np.clip((outer - LIP_EDGE_ZERO) / LIP_EDGE_RAMP, 0, 1)
    protect_open = np.clip(
        polygon_mask_points(smooth_loop(uv, LIPS_INNER), blur=3, dilate=1) * 2.2, 0, 1)
    # 다문 입 보호선은 ~5px feather + 낮은 강도: 하드컷이면 접사에서 흰 줄로
    # 보이고, 강하게 빼면 덜 채워져 보인다. 중심에서도 절반쯤만 감쇠해
    # 입술 사이 음영 느낌만 남긴다 (치아는 셰이더 게이트가 백업).
    protect_closed = np.clip(
        polygon_mask_points(smooth_loop(uv, LIPS_INNER), blur=4) * 1.0, 0, 1)
    lips_open = np.clip(outer * (1.0 - protect_open), 0, 1)   # R
    lips_closed = np.clip(outer * (1.0 - protect_closed), 0, 1)
    lips_ext = np.clip(lips_closed - lips_open, 0, 1)         # G
    lips = np.clip(lips_open + lips_ext, 0, 1)                # 미리보기용 합성

    # 아이섀도: 윗눈꺼풀 라인에서 눈썹 방향으로 SHADOW_HEIGHT 비율까지만
    # 밴드를 채운다 (쌍커풀 라인 근처에 집중, 위로 갈수록 블러로 페이드).
    shadow = np.zeros((SIZE, SIZE))
    for upper, brow in ((RIGHT_EYE_UPPER, RIGHT_BROW_LOWER),
                        (LEFT_EYE_UPPER, LEFT_BROW_LOWER)):
        lid = [tuple(uv[i]) for i in upper]
        brow_pts = [tuple(uv[i]) for i in brow]
        # 눈꺼풀 각 점의 아크길이 파라미터로 눈썹 라인의 대응점을 찾는다
        seg = [float(np.hypot(lid[i + 1][0] - lid[i][0], lid[i + 1][1] - lid[i][1]))
               for i in range(len(lid) - 1)]
        total = sum(seg) or 1.0
        acc, params = 0.0, [0.0]
        for d in seg:
            acc += d
            params.append(acc / total)
        low = [lerp_pt(lid[k], polyline_sample(brow_pts, params[k]), SHADOW_UNDERLAP)
               for k in range(len(lid))]
        high = [lerp_pt(lid[k], polyline_sample(brow_pts, params[k]), SHADOW_HEIGHT)
                for k in range(len(lid))]
        band = (catmull_rom(low, samples=6, closed=False)
                + catmull_rom(high, samples=6, closed=False)[::-1])
        # dilate 3: 눈꼬리(밴드 폴리곤이 좁아지는 양끝)까지 꽉 채운다
        shadow += polygon_mask_points(band, blur=8, dilate=3)
    # 눈알만 빼되 halo를 최소화한다: 눈을 감으면 눈꺼풀이 화면에서 크게
    # 늘어나 차감 halo 몇 px이 속눈썹 위 빈 띠로 확대되어 보인다.
    eyes = (polygon_mask_points(smooth_loop(uv, RIGHT_EYE), blur=1)
            + polygon_mask_points(smooth_loop(uv, LEFT_EYE), blur=1))
    shadow = np.clip(shadow - eyes * 1.25, 0, 1)

    # 블러셔: 광대 중심 가우시안
    blush = np.zeros((SIZE, SIZE))
    for i in BLUSH_CENTERS:
        blush += gaussian_spot(uv[i], *BLUSH_RADII_UV)
    blush = np.clip(blush, 0, 1)

    save_rg(lips_open, lips_ext, os.path.join(OUT_DIR, "lips.png"))
    save_gray(blush, os.path.join(OUT_DIR, "blush.png"))
    save_gray(shadow, os.path.join(OUT_DIR, "eyeshadow.png"))

    # ---- 검수용 미리보기: 와이어프레임 + 마스크 컬러 오버레이 ----
    preview = Image.new("RGB", (SIZE, SIZE), (255, 255, 255))
    draw = ImageDraw.Draw(preview)
    for a, b, c in load_triangles(OBJ_PATH):
        pa, pb, pc = to_px(uv[a]), to_px(uv[b]), to_px(uv[c])
        draw.line([pa, pb], fill=(215, 215, 215))
        draw.line([pb, pc], fill=(215, 215, 215))
        draw.line([pc, pa], fill=(215, 215, 215))

    base = np.asarray(preview, dtype=np.float64) / 255.0
    for mask, color in ((lips, (0.85, 0.15, 0.35)),
                        (blush, (0.95, 0.55, 0.65)),
                        (shadow, (0.55, 0.35, 0.75))):
        a = (mask * 0.8)[..., None]
        base = base * (1 - a) + np.array(color) * a
    preview_path = os.path.join(PREVIEW_DIR, "mask_preview.png")
    Image.fromarray((base * 255).astype(np.uint8)).save(preview_path)
    print(f"  wrote {os.path.relpath(preview_path, ROOT)} (검수용)")


if __name__ == "__main__":
    main()
