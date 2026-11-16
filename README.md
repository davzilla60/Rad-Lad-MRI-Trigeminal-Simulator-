# MR-I Ready — Trigeminal Nerve

An embeddable, single-file teaching simulator for the Rad-Lad website, built on the same engine and layout as the
other MR-I Ready simulators (thoracic spine, shoulder, elbow, ankle, femur, tibia + fibula). Every image is cut from
**one real, de-identified brain MRI** in a public research dataset (OpenNeuro ds005713, CC0 — see `CREDITS.md`), shown
with its true geometry. **It's a demonstration only.**

Marker: **You’ve Got Some Nerve** — the sagittal 3D T1 straight on the mid-line over the whole head, the thin axial
block square to the brainstem through the whole pons, the thin coronal block along the brainstem from Meckel's cave to
the fourth ventricle, with the head straight and padded in the head coil.

Source images: <https://doi.org/10.18112/openneuro.ds005713.v2.0.3>

## Flow

1. **Patient set-up.** Supine, **head first**, head in the head coil, landmark on the nasion. Choose how the head lies
   (the 3-D room changes pose):
   - head straight, foam pads either side — correct;
   - head straight, no pads — the head can roll: motion blurs sub-millimetre 3D images;
   - head turned to one side — the two nerves fall in different slices.
2. **Localiser.** A 3-plane scout (256 mm FOV, 5 mm) is "acquired" line by line from its k-space with an inverse FFT.
   **Any localiser in any box.** The tray lists every localiser and every completed series. Drag any of them into any
   of the four boxes of the planning grid — the fourth box normally shows the preview — to plan on several at once;
   the plan is drawn on each in its true position. Tapping a thumbnail puts it in its usual box, and ↺ puts a box back.
3. **Sagittal 3D T1 first.** Centre the stack on the mid-line on the coronal and axial localisers, keep it straight,
   cover the brain from side to side, and place the FOV (≈ 256 mm) over the whole brain.
4. **Thin axial block.** Unlocks once the sagittal is scanned. Drag the sagittal series from the tray into any box (or
   tap it) to unlock the tilt handle — the tilt is set on a diagnostic sagittal, not on a localiser — then tilt the
   block square to the brainstem (at right angles to the back of the pons; reference −7°, graded ± 5°: a straight
   block just fails) and cover the whole pons with a ≈ 180 mm FOV. 3D T2 and 3D T1.
5. **Thin coronal block.** Tilted on the same sagittal, along the brainstem (parallel to the back of the pons), from
   the front of Meckel's cave back to the fourth ventricle. T2 and T1.
6. **Scan → images.** Each scan shows the prepared images inside your stack, cropped to your FOV.
7. **Debrief.** Coverage and angle per plan, position, hero images (the sagittal shows your axial and coronal blocks
   against the brainstem line), a sequences-to-consider table and the marker.

CLI: `pads | loose | turned`, `load`, `loc`, `plan sag|ax|cor`, `auto`, `slices`, `thick`, `gap`, `fov`, `tilt`,
`straight`, `use <item> [box]` (items: `locsag`, `loccor`, `locax`, or a series such as `sag_t1`; boxes `1`–`4`),
`restore <1-4>`, `scan`, `back`, `finish`, `help`.

## Files

- `trigeminal.embed.html` is the self-contained deliverable (~5 MB, every image inlined). `index.html` is an
  identical copy for one-drop hosting.
- `trigeminal.html` + `app.js` + `room3d.js` + `assets/` are the editable sources. `trigeminal.html` also runs straight
  from disk: the localisers are repeated as data URIs in `assets/calib.js` so the k-space step works under `file://`.
  After editing, rebuild with `python inline.py`.
- `tools/gen_assets.py` rebuilds `assets/` (images, localiser, geometry, landmarks) from the two NIfTI volumes of the
  dataset's `sub-050` (`anat/sub-050_T1w.nii.gz`, `anat/sub-050_T2w.nii.gz`); `tools/vol.py` reads them and cuts the
  planes; `tools/landmarks.json` holds the brainstem line and the hand-picked landmarks. Needs only numpy + pillow:
  `python -I tools/gen_assets.py "<folder holding the two .nii.gz files>"`.
- The 3-D room loads three.js 0.160 from jsDelivr; without it the set-up step falls back to a flat drawing.

## Outstanding

- Radiologist / radiographer review of the brainstem line, the landmarks behind the coverage ticks, the read-out
  names and the teaching text (including the planning rules for the axial and coronal blocks, which vary by site).
- The dataset holds only two 3D volumes for this subject, so the localiser and the axial / coronal series are
  reformats of them, not separate acquisitions; there is no 3D TOF MRA and no post-contrast series.

Educational simulation — not a medical device, not for clinical use.
