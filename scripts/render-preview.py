#!/usr/bin/env python3
"""Gera uma imagem simples de um STL ASCII sem depender da interface do OpenSCAD."""

import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection


def read_ascii_stl(path: Path):
    vertices = []
    triangles = []
    with path.open("r", encoding="ascii", errors="ignore") as stream:
        for line in stream:
            fields = line.strip().split()
            if len(fields) == 4 and fields[0] == "vertex":
                vertices.append(tuple(float(value) for value in fields[1:]))
                if len(vertices) == 3:
                    triangles.append(vertices)
                    vertices = []
    if not triangles:
        raise ValueError(f"Nenhum triangulo encontrado em {path}")
    return triangles


def main():
    if len(sys.argv) != 3:
        raise SystemExit("uso: render-preview.py entrada.stl saida.png")

    triangles = read_ascii_stl(Path(sys.argv[1]))
    points = [point for triangle in triangles for point in triangle]
    mins = [min(point[i] for point in points) for i in range(3)]
    maxs = [max(point[i] for point in points) for i in range(3)]
    centers = [(low + high) / 2 for low, high in zip(mins, maxs)]
    radius = max(high - low for low, high in zip(mins, maxs)) / 2

    figure = plt.figure(figsize=(10, 7), facecolor="#f4f7fb")
    axis = figure.add_subplot(111, projection="3d", facecolor="#f4f7fb")
    mesh = Poly3DCollection(triangles, facecolor="#2878b5", edgecolor="#173f5f",
                            linewidth=0.12, alpha=0.82)
    axis.add_collection3d(mesh)
    axis.set_xlim(centers[0] - radius, centers[0] + radius)
    axis.set_ylim(centers[1] - radius, centers[1] + radius)
    axis.set_zlim(centers[2] - radius, centers[2] + radius)
    axis.set_box_aspect((1, 1, 1))
    axis.view_init(elev=20, azim=-48)
    axis.set_axis_off()
    axis.set_title("AquaRemind - prototipo 3D conceitual", pad=10, fontsize=16)
    figure.tight_layout()
    figure.savefig(sys.argv[2], dpi=150, bbox_inches="tight")


if __name__ == "__main__":
    main()
