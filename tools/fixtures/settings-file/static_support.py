"""Static byte and mode identities. This module never imports product code."""
import hashlib
import os
from pathlib import Path


def environment_path(path):
    return any(part == ".env" or part.startswith(".env.") or part == ".envrc" or part.endswith(".env")
               for part in Path(path).parts)


def identity(path):
    assert not path.is_symlink(), "source-symlink"
    data = path.read_bytes()
    return {"mode": "100755" if path.stat().st_mode & 0o111 else "100644",
            "gitBlob": hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest(),
            "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}


def git_tree(entries):
    root = {}
    for name, entry in entries.items():
        node = root
        parts = name.split("/")
        assert not name.startswith("/") and ".." not in parts
        for part in parts[:-1]:
            node = node.setdefault(part, {})
        node[parts[-1]] = (entry["mode"], entry["gitBlob"])

    def encode(node):
        body = bytearray()
        for name, child in sorted(node.items(), key=lambda pair: (pair[0] + ("/" if isinstance(pair[1], dict) else "")).encode()):
            mode, sha = ("40000", encode(child)) if isinstance(child, dict) else child
            body.extend(mode.encode() + b" " + name.encode() + b"\0" + bytes.fromhex(sha))
        return hashlib.sha1(b"tree " + str(len(body)).encode() + b"\0" + body).hexdigest()

    return encode(root)


def dependency_tree(root):
    root = root.resolve()
    paths = []
    skipped = []
    for directory, directories, files in os.walk(root, followlinks=False):
        for name in directories[:]:
            path = Path(directory) / name
            if environment_path(path.relative_to(root)):
                skipped.append(str(path.relative_to(root)))
                directories.remove(name)
            elif path.is_symlink():
                paths.append(path)
                directories.remove(name)
        for name in files:
            path = Path(directory) / name
            if environment_path(path.relative_to(root)):
                skipped.append(str(path.relative_to(root)))
            else:
                paths.append(path)
    digest = hashlib.sha256()
    byte_count = 0
    for path in sorted(paths, key=lambda path: path.relative_to(root).as_posix()):
        relative = path.relative_to(root).as_posix()
        if path.is_symlink():
            assert path.resolve().is_relative_to(root), "external-dependency-link"
            data = os.readlink(path).encode()
            mode = "120000"
            sha = hashlib.sha256(data).hexdigest()
            size = len(data)
        else:
            mode = "100755" if path.stat().st_mode & 0o111 else "100644"
            h = hashlib.sha256()
            size = 0
            with path.open("rb") as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    h.update(block)
                    size += len(block)
            sha = h.hexdigest()
        byte_count += size
        digest.update(f"{mode}\0{relative}\0{size}\0{sha}\n".encode())
    return {"algorithm": "sha256 of sorted mode-NUL-path-NUL-bytes-NUL-sha256-LF records",
            "sha256": digest.hexdigest(), "entries": len(paths), "bytes": byte_count,
            "environmentPathsSkippedUnopened": sorted(skipped)}
