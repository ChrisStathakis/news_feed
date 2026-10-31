# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec για το autonomous build του pipeline.

Χρήση (από τον φάκελο newspaper):
    pyinstaller hmerisia.spec --noconfirm --distpath ../pipeline-dist --workpath ../build/pyinstaller
"""
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

datas = [("templates", "templates"), ("schedule.ps1", ".")]
datas += collect_data_files("trafilatura")
datas += collect_data_files("charset_normalizer")

hiddenimports = (
    collect_submodules("trafilatura")
    + collect_submodules("youtube_transcript_api")
    + [
        "lxml._elementpath",
        "lxml.etree",
        "jinja2.ext",
        "PIL._tkinter_finder",
        "qrcode.image.pil",
        "qrcode.image.base",
        "zoneinfo",
        "tzdata",
    ]
)

a = Analysis(
    ["run.py"],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tkinter",
        "matplotlib",
        "numpy",
        "pandas",
        "scipy",
        "IPython",
        "pymupdf",
        "fitz",
        "PyQt5",
        "PySide6",
        "test",
    ],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="hmerisia",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    contents_directory=".",
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="hmerisia",
)
