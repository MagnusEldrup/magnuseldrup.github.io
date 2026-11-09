"""Build assets/data/jmp-curves.json from the matplotlib SVGs in _viz/source/.

The homepage visualization (assets/js/jmp-viz.js) redraws the JMP figures from
this file. Matplotlib writes each line as a plain "M x y L x y ..." path in pixel
space, so we read the axis tick positions from the same file and map every point
back to data units (Ksh/year, marginal tax rate).

Run from the repository root after regenerating the figures:

    python _viz/build_curves.py

Jekyll does not publish folders that start with "_", so the sources and this
script stay out of the built site.
"""

import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "source"
OUT = ROOT.parent / "assets" / "data" / "jmp-curves.json"

SVG_NS = "{http://www.w3.org/2000/svg}"
X_MAX = 700_000          # x-axis runs 0 .. 700,000 Ksh in both figures
X_TICKS = 8              # 0, 100k, ..., 700k
Y_TICKS = 6              # 0.0, 0.2, ..., 1.0

# Kenya 2021 PAYE schedule (statutory values; the relief makes the first
# 288,000 Ksh effectively zero-rated, then 25% and 30%). Hard-coded rather than
# traced so the kinks sit exactly on the statutory thresholds.
KENYA_2021 = [[0, 0], [288_000, 0], [288_000, 0.25], [388_000, 0.25],
              [388_000, 0.30], [X_MAX, 0.30]]


def axis_mapping(root):
    """Return functions mapping SVG pixels to data units, read from the ticks."""
    def tick_positions(prefix, attr):
        pos = []
        for g in root.iter(f"{SVG_NS}g"):
            if re.fullmatch(prefix + r"_\d+", g.get("id", "")):
                use = g.find(f".//{SVG_NS}use")
                pos.append(float(use.get(attr)))
        return pos

    xs = tick_positions("xtick", "x")
    ys = tick_positions("ytick", "y")
    assert len(xs) == X_TICKS and len(ys) == Y_TICKS, (len(xs), len(ys))
    x0, x1 = xs[0], xs[-1]          # 0 and 700,000
    y0, y1 = ys[0], ys[-1]          # 0.0 and 1.0
    return (lambda px: (px - x0) / (x1 - x0) * X_MAX,
            lambda py: (y0 - py) / (y0 - y1))


def path_points(path_el):
    d = path_el.get("d")
    assert not re.search(r"[CcQqSsTtAaHhVv]", d), "expected only M/L/z commands"
    v = [float(t) for t in re.findall(r"-?\d+(?:\.\d+)?(?:e-?\d+)?", d)]
    return list(zip(v[0::2], v[1::2]))


def styled_paths(svg_file):
    """Yield (style dict, points in data units) for every path in axes_1."""
    root = ET.parse(svg_file).getroot()
    to_x, to_y = axis_mapping(root)
    axes = next(g for g in root.iter(f"{SVG_NS}g") if g.get("id") == "axes_1")
    for g in axes:
        p = g.find(f"{SVG_NS}path")
        if p is None:
            continue
        style = dict(
            kv.split(": ", 1) for kv in p.get("style", "").split("; ") if ": " in kv
        )
        style["_id"] = g.get("id", "")
        pts = [(to_x(x), to_y(y)) for x, y in path_points(p)]
        yield style, pts


def pick(paths, stroke, dashed=None, kind="line2d"):
    """Find the single path with this stroke colour and dash pattern."""
    hits = []
    for style, pts in paths:
        if not style["_id"].startswith(kind) or style.get("stroke") != stroke:
            continue
        dash = style.get("stroke-dasharray")
        if dashed is None and dash is None:
            hits.append(pts)
        elif dashed is not None and dash is not None and dash.startswith(dashed):
            hits.append(pts)
    assert len(hits) == 1, (stroke, dashed, len(hits))
    return hits[0]


def clean(pts):
    """Clip to the plotted range and round. Keeps vertical jumps intact."""
    out = []
    for x, y in pts:
        if x < -1 or x > X_MAX + 2_000:
            continue
        out.append([int(round(min(max(x, 0), X_MAX))), round(min(max(y, 0), 1), 4)])
    # drop exact duplicates that clipping can create
    dedup = [out[0]]
    for p in out[1:]:
        if p != dedup[-1]:
            dedup.append(p)
    # Series that start on the zero baseline are zero from 0 Ksh as well.
    if dedup[0][1] == 0 and dedup[0][0] > 0:
        dedup.insert(0, [0, 0])
    return dedup


def rdp(points, eps):
    """Ramer-Douglas-Peucker on normalised coordinates (x / X_MAX, y)."""
    if len(points) < 3:
        return points
    (ax, ay), (bx, by) = points[0], points[-1]
    ax, bx = ax / X_MAX, bx / X_MAX
    dx, dy = bx - ax, by - ay
    norm = (dx * dx + dy * dy) ** 0.5 or 1e-12
    best_i, best_d = 0, -1.0
    for i in range(1, len(points) - 1):
        px, py = points[i][0] / X_MAX, points[i][1]
        d = abs(dy * px - dx * py + bx * ay - by * ax) / norm
        if d > best_d:
            best_i, best_d = i, d
    if best_d <= eps:
        return [points[0], points[-1]]
    return rdp(points[: best_i + 1], eps)[:-1] + rdp(points[best_i:], eps)


def threshold(pts, eps=0.005):
    """First income at which the marginal rate leaves zero."""
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if y0 <= eps < y1:
            return int(round(x0 if x0 == x1 else x0 + (eps - y0) * (x1 - x0) / (y1 - y0)))
    return 0


def main():
    expost = list(styled_paths(SRC / "3_Optimal_Taxes_Ex_Post_Weights.svg"))
    main_fig = list(styled_paths(SRC / "MainResult_extensive_single_panel.svg"))

    series = {
        "kenya": KENYA_2021,
        "naive": clean(pick(expost, "#003f5c")),
        "hu": clean(pick(expost, "#ffa600")),
        "ha": clean(pick(expost, "#ff6361")),
        "hu_ext": clean(pick(main_fig, "#ffa600", dashed="12.95")),
        "hu_high": clean(pick(main_fig, "#ffa600", dashed="3.5")),
        "ha_ext": clean(pick(main_fig, "#ff6361", dashed="12.95")),
        "ha_high": clean(pick(main_fig, "#ff6361", dashed="3.5")),
    }

    # fill_between polygon: start point, N points along one edge, end point,
    # N points back along the other edge.
    poly = pick(expost, "#ff6361", kind="PolyCollection")
    n = (len(poly) - 2) // 2
    edge_a = poly[1 : n + 1]
    edge_b = list(reversed(poly[n + 2 : 2 * n + 2]))
    edge_a, edge_b = clean(edge_a), clean(edge_b)
    upper, lower = (edge_a, edge_b) if sum(y for _, y in edge_a) >= sum(y for _, y in edge_b) else (edge_b, edge_a)
    band = {"lower": rdp(lower, 4e-4), "upper": rdp(upper, 4e-4)}

    t2020 = pick(expost, "#000000", dashed="3")
    marks = {
        "kenya2021": 288_000,
        "t2020": int(round(t2020[0][0])),
        **{k: threshold(series[k]) for k in ("ha", "hu_ext", "hu_high", "ha_ext", "ha_high")},
    }

    data = {
        "_source": "Generated by _viz/build_curves.py from _viz/source/*.svg. Do not edit by hand.",
        "xMax": X_MAX,
        "series": series,
        "band": {"ha_ci": band},
        "marks": marks,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")

    print(f"wrote {OUT.relative_to(ROOT.parent)} ({OUT.stat().st_size / 1024:.1f} KB)")
    for k, v in series.items():
        print(f"  {k:8s} {len(v):4d} pts   max {max(y for _, y in v):.3f}")
    print(f"  ha_ci    {len(band['lower'])}+{len(band['upper'])} pts   max {max(y for _, y in band['upper']):.3f}")
    print("  marks", marks)


if __name__ == "__main__":
    main()
