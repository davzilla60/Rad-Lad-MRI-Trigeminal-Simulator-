"""Build ../assets from the two 3D volumes of OpenNeuro ds005713, sub-050 (sagittal 3D T1 TFE and 3D T2).

    python -I tools/gen_assets.py "<folder holding sub-050_T1w.nii.gz and sub-050_T2w.nii.gz>"

Needs numpy + pillow only (tools/vol.py reads the NIfTI files).
Every image the simulator shows is cut out of one of the two volumes with trilinear interpolation:
  loc_sag/cor/ax.png  one 5 mm image per plane through the T1 volume, 256 mm FOV, along the scanner axes -> the localiser
  sag_t1_NN.jpg       sagittal images of the T1 volume, 1 mm thick, one every 2.5 mm
  ax_t2 / ax_t1       thin axial images square to the brainstem (see tools/landmarks.json), 1 mm thick
  cor_t2 / cor_t1     coronal images along the brainstem, 2 mm thick
calib.json / calib.js hold the geometry (IPP / IOP / pixel spacing, DICOM patient LPS mm) of every image and the
landmarks. Every label comes from SERIES below, not from the dataset.
"""
import base64, json, os, sys
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vol as V

ROOT = sys.argv[1]
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT, QA = os.path.join(HERE, "assets"), os.path.join(HERE, "qa")
os.makedirs(OUT, exist_ok=True); os.makedirs(QA, exist_ok=True)
LMJ = json.load(open(os.path.join(HERE, "tools", "landmarks.json")))
T1 = V.Volume(os.path.join(ROOT, "sub-050_T1w.nii.gz"))
T2 = V.Volume(os.path.join(ROOT, "sub-050_T2w.nii.gz"))

X0 = LMJ["midline_x"]
PONS = np.array(LMJ["pons"])
PHI = np.radians(LMJ["brainstem_tilt_deg"])
UP = np.array([0.0, -np.sin(PHI), np.cos(PHI)])       # along the brainstem, toward the midbrain
BACK = np.array([0.0, np.cos(PHI), np.sin(PHI)])      # square to it, toward the fourth ventricle
RX = np.array([1.0, 0.0, 0.0])

# id, volume, task, plane, label, params, row, col, first slice centre, step along the normal, slices, thickness,
# averaged planes, FOV, shipped size, seconds per planned slice, window percentile, gamma
SERIES = [
    ("sag_t1", T1, "sag", "sag", "3D T1", "3D TFE · TR 6.6 / TE 3.0 · 1 mm (shown every 2.5 mm)",
     np.array([0, 1.0, 0]), np.array([0, 0, -1.0]), np.array([X0 + 85.0, -17.0, -45.0]), 2.5, 69, 1.0, 2, 256, 320, 1.6, 99.7, 1.0),
    ("ax_t2", T2, "ax", "ax", "3D T2", "3D TSE · TR 3500 / TE 300 · 1 mm",
     RX, BACK, PONS + np.array([0, -4.0, 0]) - UP * 26.0, 1.0, 53, 1.0, 2, 180, 384, 6.0, 99.6, 0.8),
    ("ax_t1", T1, "ax", "ax", "3D T1", "3D TFE · TR 6.6 / TE 3.0 · 1 mm (shown every 2 mm)",
     RX, BACK, PONS + np.array([0, -4.0, 0]) - UP * 26.0, 2.0, 27, 1.0, 2, 180, 320, 4.0, 99.7, 1.0),
    ("cor_t2", T2, "cor", "cor", "T2", "from the 3D TSE · TR 3500 / TE 300 · 2 mm",
     RX, -UP, PONS - BACK * 32.0, 2.0, 32, 2.0, 4, 180, 384, 7.0, 99.6, 0.8),
    ("cor_t1", T1, "cor", "cor", "T1", "from the 3D TFE · TR 6.6 / TE 3.0 · 2 mm",
     RX, -UP, PONS - BACK * 32.0, 2.0, 32, 2.0, 4, 180, 320, 5.0, 99.7, 1.0),
]

r5 = lambda v: [round(float(x), 5) for x in v]
r2 = lambda v: [round(float(x), 2) for x in v]
calib = {"ser": {}}
for sid, vol, task, plane, label, params, row, col, c0, step, n, thk, sub, fov, size, spl, pct, gam in SERIES:
    nrm = np.cross(row, col)
    ps = fov / size
    hi = np.percentile(vol.v[::4, ::4, ::4][vol.v[::4, ::4, ::4] > vol.v.max() * 0.02], pct)
    ipps, kb = [], 0
    for k in range(n):
        ipp = V.centred(c0 + nrm * step * k, row, col, ps, size, size)
        a = vol.plane(ipp, row, col, ps, size, size, thk, sub)
        a8 = (np.clip(a / hi, 0, 1) ** gam * 255).round().astype(np.uint8)
        name = os.path.join(OUT, "%s_%02d.jpg" % (sid, k))
        Image.fromarray(a8).save(name, quality=80, optimize=True)
        kb += os.path.getsize(name) / 1024
        ipps.append(r2(ipp))
    calib["ser"][sid] = {"task": task, "plane": plane, "seq": label, "params": params, "n": n, "ipp": ipps,
                         "row": r5(row), "col": r5(col), "ps": round(ps, 6), "cols": size, "rows": size, "nrm": r5(nrm),
                         "sp": step, "thk": thk, "spl": spl, "pad": 2}
    print(sid, n, "images · %.0f KB · normal" % kb, np.round(nrm, 3))

# ---- the 3-plane localiser: one 5 mm image per plane through the T1 volume (256 mm FOV, 256 matrix) ----
LOC = {"sag": (np.array([0, 1.0, 0]), np.array([0, 0, -1.0]), np.array([-6.0, -17.0, -45.0])),
       "cor": (RX, np.array([0, 0, -1.0]), np.array([-5.0, 6.0, -45.0])),
       "ax":  (RX, np.array([0, 1.0, 0]), np.array([-5.0, -17.0, -42.0]))}
calib["loc"] = {"n": 256, "fov": 256.0}
locimg = {}
hi = np.percentile(T1.v[::4, ::4, ::4][T1.v[::4, ::4, ::4] > T1.v.max() * 0.02], 99.6)
for p, (row, col, c) in LOC.items():
    ipp = V.centred(c, row, col, 1.0, 256, 256)
    a = T1.plane(ipp, row, col, 1.0, 256, 256, 5.0, 5)
    name = os.path.join(OUT, "loc_%s.png" % p)
    Image.fromarray((np.clip(a / hi, 0, 1) ** 0.85 * 255).round().astype(np.uint8)).save(name, optimize=True)
    locimg[p] = "data:image/png;base64," + base64.b64encode(open(name, "rb").read()).decode()
    calib["loc"][p] = {"ipp": r2(ipp), "row": r5(row), "col": r5(col), "ps": 1.0, "cols": 256, "rows": 256}

# ---- landmarks ----
calib["lm"] = {k: r2(v) for k, v in LMJ["lm"].items()}
calib["lm"]["conf"] = r2(LMJ["isocentre"])
calib["lm"]["pons"] = r2(PONS)
calib["x0"] = X0
calib["up"] = r5(UP)
calib["back"] = r5(BACK)
calib["real"] = {"tilt": round(LMJ["brainstem_tilt_deg"], 1)}
json.dump(calib, open(os.path.join(OUT, "calib.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
open(os.path.join(OUT, "calib.js"), "w", encoding="utf-8").write(
    "window.MRS_CALIB=" + json.dumps(calib, separators=(",", ":"), ensure_ascii=False) + ";\n" +
    "window.MRS_LOCIMG=" + json.dumps(locimg, separators=(",", ":")) + ";\n")     # localisers as data URIs: k-space works from file://

# ---- QA: landmarks and the brainstem line drawn on the nearest shipped slices ----
def qa(sid, names, out, line=None):
    s = calib["ser"][sid]; ipp = np.array(s["ipp"]); r = np.array(s["row"]); c = np.array(s["col"]); nrm = np.array(s["nrm"])
    pts = [(nm, np.array(calib["lm"][nm])) for nm in names]
    k = int(np.argmin(np.abs((pts[0][1] - ipp) @ nrm)))
    im = Image.open(os.path.join(OUT, "%s_%02d.jpg" % (sid, k))).convert("RGB"); z = 1024 // im.width
    im = im.resize((im.width * z, im.height * z), Image.BILINEAR); d = ImageDraw.Draw(im)
    xy = lambda P: ((P - ipp[k]) @ r / s["ps"] * z, (P - ipp[k]) @ c / s["ps"] * z)
    for nm, P in pts:
        x, y = xy(P)
        d.ellipse([x - 5, y - 5, x + 5, y + 5], outline=(255, 60, 60)); d.text((x + 8, y - 5), nm, fill=(255, 255, 0))
    if line is not None:
        for a, b, colr in line:
            d.line([xy(a), xy(b)], fill=colr, width=1)
    im.save(os.path.join(QA, out))
back_of_pons = PONS + BACK * 10.0
qa("sag_t1", ["pons", "pons_top", "pons_bot", "v4", "pons_front", "vertex", "fmag", "front", "back"], "qa_sag.png",
   [(back_of_pons - UP * 30, back_of_pons + UP * 30, (95, 224, 138)), (PONS - BACK * 40, PONS + BACK * 40, (240, 163, 94))])
qa("ax_t2", ["rez_r", "rez_l", "mc_r", "mc_l", "v4", "pons"], "qa_ax.png")
qa("cor_t2", ["mc_r", "mc_l", "temp_r", "temp_l"], "qa_cor_mc.png")
qa("cor_t2", ["rez_r", "rez_l", "pons_top", "pons_bot"], "qa_cor_rez.png")
loc3 = Image.new("L", (768, 256))
for i, p in enumerate(("sag", "cor", "ax")): loc3.paste(Image.open(os.path.join(OUT, "loc_%s.png" % p)), (i * 256, 0))
loc3.save(os.path.join(QA, "loc3.png"))
print("ok", {k: v["n"] for k, v in calib["ser"].items()}, calib["real"])
