# Credits

Marker: **You’ve Got Some Nerve**

## MRI imaging

**Adapted from:** Filimonova E, Pashkov A, Martirosyan A, Kurilov V, Moysak G, Rzaev J (2024).
*A large-scale dataset of pre- and post-surgical MRI data in patients with chronic trigeminal neuralgia*
(Version 2.0.3) [dataset]. OpenNeuro. <https://doi.org/10.18112/openneuro.ds005713.v2.0.3> — released under **CC0**.

Dataset page: <https://openneuro.org/datasets/ds005713/versions/2.0.3>

The authors ask that this article is cited:

> Filimonova, E., Pashkov, A., Tiutiunnik, A. et al. A large-scale dataset of pre- and postsurgical MRI data from
> patients with chronic trigeminal neuralgia. Sci Data (2025). <https://doi.org/10.1038/s41597-025-06311-y>

One de-identified research participant (dataset subject `sub-050`), one pre-surgical brain MRI study on a
Philips Ingenia 3 T. Volumes used:

- `sT1W_3D_SAG` (`sub-050_T1w.nii.gz`) — sagittal 3D T1 TFE, TR 6.6 ms, TE 3.0 ms, flip 8°, 1 mm slices reconstructed
  every 0.5 mm → the **localiser**, the **sagittal 3D T1** and the thin **T1** axial and coronal images
- `3D_T2_1mm` (`sub-050_T2w.nii.gz`) — 3D T2 TSE, TR 3500 ms, TE 300 ms, 1 mm slices reconstructed every 0.5 mm → the
  thin **T2** axial and coronal images

The dataset's diffusion and resting-state fMRI series for this subject are **not used**.

The clinical request in the simulator (attacks of electric-shock facial pain) is **fictional**. Nothing in the
simulator describes or interprets what the images show. (The dataset's participants file records for this subject:
trigeminal neuralgia, left-sided pain, "left NVC, empty sella", Sindou grade 2.)

### Before this goes public

- **Radiologist / radiographer review is outstanding** for the brainstem line, the landmarks, the read-out names and
  the planning rules taught (axial block square to the brainstem, coronal block along it). Sites differ on these.
- The dataset is CC0, so no permission is needed; the citation above is kept so the source of the images stays
  traceable.

### Changes made

1. **Every image is cut out of one of the two volumes** with trilinear interpolation (`tools/gen_assets.py`). The
   dataset holds no scout and no separate axial or coronal series for this subject.
   - **Localiser.** Three images through the T1 volume along the scanner axes: 256 mm FOV, 256 matrix, 5 mm thick
     (five planes averaged).
   - **Sagittal 3D T1.** Sagittal images, 1 mm thick, 256 mm FOV at 320 pixels, one every 2.5 mm (69 images).
   - **Axial 3D T2 / 3D T1.** Images square to the brainstem line, 1 mm thick, 180 mm FOV: T2 every 1 mm (53 images,
     384 pixels), T1 every 2 mm (27 images, 320 pixels).
   - **Coronal T2 / T1.** Images along the brainstem line, 2 mm thick (four planes averaged), 180 mm FOV, every 2 mm
     (32 images each).
2. Pixel values were windowed to 8-bit and saved as JPEG (series) and PNG (localiser). Nothing was retouched.
3. **Brainstem line.** The reference for both thin blocks is the back of the pons (the floor of the fourth
   ventricle) on the mid-line sagittal: it leans 6.6° (its upper end further back), measured by hand on gridded
   views (`tools/landmarks.json`). The axial block is graded square to it and the coronal block along it, ± 5°.
4. **Landmarks.** The mid-line, the middle, top and bottom of the pons, both trigeminal root entry zones, both
   Meckel's caves, the fourth ventricle and the outline points of the brain were picked by hand (± 3 mm). They
   drive the coverage ticks and the text read-outs ("mid-pons · trigeminal nerve roots", "Meckel's cave", …);
   nothing is drawn on the images.
5. The geometry of every image (position, orientation, pixel size) is kept in `assets/calib.json` and drives the
   planning overlays. The patient was lying with the head a few degrees off straight; the images are shown as
   they lay.
6. In the browser: the localiser k-space animation is a real Fourier transform of the localiser images; each scan
   shows the prepared images that fall inside your stack, cropped to your FOV. Your angle doesn't re-slice the
   images. The patient position chosen at set-up doesn't change the images.
7. The anatomical scans were defaced by the dataset authors (pydeface), which is why the face is missing.
8. The 3-D room shows a generic closed-bore magnet and head coil, not the real system.
9. Sequences other than those listed above are named for teaching only. There are no images for them.

Educational simulation. It isn't a medical device and isn't for clinical use.
