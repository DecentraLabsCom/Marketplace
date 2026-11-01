"""Validate and create deterministic static webapp archives."""

from __future__ import annotations

import argparse
import os
from pathlib import Path, PurePosixPath
import stat
import sys
import tempfile
import zipfile


def _source_files(source: Path) -> tuple[Path, list[Path]]:
    try:
        source_mode = source.lstat().st_mode
    except OSError as exc:
        raise ValueError(f"webapp source directory is unavailable: {source}") from exc
    if stat.S_ISLNK(source_mode) or not stat.S_ISDIR(source_mode):
        raise ValueError(f"webapp source must be a real directory: {source}")

    resolved_source = source.resolve(strict=True)
    files: list[Path] = []
    for item in source.rglob("*"):
        mode = item.lstat().st_mode
        if stat.S_ISLNK(mode):
            raise ValueError(f"webapp contains a symbolic link: {item}")
        if stat.S_ISREG(mode):
            files.append(item)
        elif not stat.S_ISDIR(mode):
            raise ValueError(f"webapp contains a non-regular filesystem entry: {item}")

    if not any(item.relative_to(source).as_posix() == "index.html" for item in files):
        raise ValueError("webapp source must contain a root index.html")

    ordered_files = sorted(files, key=lambda item: item.relative_to(source).as_posix())
    return resolved_source, ordered_files


def create_webapp_archive(source_directory: str | Path, destination_path: str | Path) -> Path:
    """Write a symlink-free, reproducible ZIP for a static webapp directory."""
    source = Path(source_directory)
    destination = Path(destination_path)
    resolved_source, files = _source_files(source)
    resolved_destination = destination.resolve(strict=False)
    if (
        resolved_destination == resolved_source
        or resolved_source in resolved_destination.parents
    ):
        raise ValueError("webapp archive destination cannot be inside the source directory")
    if destination.is_symlink():
        raise ValueError(f"webapp archive destination cannot be a symbolic link: {destination}")

    destination.parent.mkdir(parents=True, exist_ok=True)
    file_descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.",
        suffix=".tmp",
        dir=destination.parent,
    )
    os.close(file_descriptor)
    temporary_path = Path(temporary_name)
    try:
        with zipfile.ZipFile(
            temporary_path,
            "w",
            compression=zipfile.ZIP_DEFLATED,
            compresslevel=9,
        ) as archive:
            for item in files:
                name = item.relative_to(source).as_posix()
                archive_path = PurePosixPath(name)
                if archive_path.is_absolute() or ".." in archive_path.parts:
                    raise ValueError(f"webapp contains an invalid archive path: {name}")
                entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                entry.compress_type = zipfile.ZIP_DEFLATED
                entry.create_system = 3
                entry.external_attr = (stat.S_IFREG | 0o644) << 16
                archive.writestr(entry, item.read_bytes())

        temporary_path.chmod(0o644)
        os.replace(temporary_path, destination)
        return destination
    finally:
        temporary_path.unlink(missing_ok=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_directory", type=Path)
    parser.add_argument("destination_path", type=Path)
    args = parser.parse_args(argv)
    try:
        archive_path = create_webapp_archive(args.source_directory, args.destination_path)
    except (OSError, ValueError) as exc:
        print(f"webapp archive error: {exc}", file=sys.stderr)
        return 1
    print(f"Created {archive_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
