"""Read the dataset's NIfTI volumes and cut planes out of them. numpy only.

All coordinates are DICOM patient millimetres (LPS: +x patient left, +y posterior, +z superior).
"""
import gzip
import struct

import numpy as np


class Volume:
    def __init__(self, path):
        with gzip.open(path, "rb") as f:
            h = f.read(352)
            dim = struct.unpack("<8h", h[40:56])
            dtype = struct.unpack("<h", h[70:72])[0]
            vox_offset, slope, inter = struct.unpack("<3f", h[108:120])
            sform_code = struct.unpack("<h", h[254:256])[0]
            if dtype != 4 or sform_code == 0 or dim[0] != 3:
                raise SystemExit("unexpected NIfTI header in " + path)
            aff = np.eye(4)
            aff[:3] = np.array(struct.unpack("<12f", h[280:328]), dtype=float).reshape(3, 4)
            f.read(int(vox_offset) - 352)
            raw = np.frombuffer(f.read(), dtype="<i2")
        v = raw.reshape(dim[1:4], order="F").astype(np.float32)
        self.v = v * slope + inter if slope != 0 else v          # the scaled values the scanner stored
        self.lps = np.diag([-1.0, -1.0, 1.0, 1.0]) @ aff           # voxel index -> LPS mm (NIfTI itself is RAS)
        self.inv = np.linalg.inv(self.lps)
        self.shape = self.v.shape

    def centre(self):
        return (self.lps @ np.array([(n - 1) / 2 for n in self.shape] + [1.0]))[:3]

    def at(self, P):
        """Trilinear samples at LPS points P (..., 3). Outside the volume = 0."""
        P = np.asarray(P, dtype=np.float64)
        ijk = P @ self.inv[:3, :3].T + self.inv[:3, 3]
        i0 = np.floor(ijk).astype(np.int64)
        f = (ijk - i0).astype(np.float32)
        out = np.zeros(P.shape[:-1], dtype=np.float32)
        ok = np.ones(P.shape[:-1], dtype=bool)
        for a in range(3):
            ok &= (i0[..., a] >= 0) & (i0[..., a] < self.shape[a] - 1)
        i0 = i0[ok]
        f = f[ok]
        acc = np.zeros(len(i0), dtype=np.float32)
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    w = ((f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2]))
                    acc += w * self.v[i0[:, 0] + dx, i0[:, 1] + dy, i0[:, 2] + dz]
        out[ok] = acc
        return out

    def plane(self, ipp, row, col, ps, cols, rows, thick=0.0, sub=1):
        """Image whose first pixel centre is ipp; row = direction along a row, col = direction down a column.
        thick > 0 averages `sub` planes spread across that slice thickness."""
        ipp, row, col = (np.asarray(a, dtype=np.float64) for a in (ipp, row, col))
        nrm = np.cross(row, col)
        x = np.arange(cols) * ps
        y = np.arange(rows) * ps
        P = ipp + x[None, :, None] * row + y[:, None, None] * col
        if sub <= 1 or thick <= 0:
            return self.at(P)
        acc = np.zeros((rows, cols), dtype=np.float32)
        for s in range(sub):
            acc += self.at(P + nrm * ((s + 0.5) / sub - 0.5) * thick)
        return acc / sub


def centred(c, row, col, ps, cols, rows):
    """ipp of the image centred on point c."""
    c, row, col = (np.asarray(a, dtype=np.float64) for a in (c, row, col))
    return c - row * ps * (cols - 1) / 2 - col * ps * (rows - 1) / 2
