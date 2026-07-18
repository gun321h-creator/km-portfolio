"""Atomic file writes for dashboard data files.

Background tasks / crons rewrite JSON snapshots that live HTTP request handlers
read on the same request thread. A plain ``path.write_text()`` truncates the
file then writes — leaving a window where a concurrent reader observes partial
or empty content (page 500/503; order-shuffled test flakiness). Writing to a
tmp file in the SAME directory then ``os.replace()``-ing it onto the target is
atomic on POSIX and on Windows/NTFS (os.replace -> MoveFileExW with
MOVEFILE_REPLACE_EXISTING), so a reader only ever sees the whole OLD or the
whole NEW file.

This consolidates the per-module ``_atomic_write`` helpers that had been copied
into llm_model_check_task.py / office_live_activity.py / office_tasks.py /
wealth_prices_fetcher.py. New writers should import from here.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any


def atomic_write_text(path: Path, text: str, *, encoding: str = "utf-8") -> None:
    """Write ``text`` to ``path`` atomically (tmp in the same dir + os.replace).

    A concurrent reader observes either the previous file or the new one in
    full — never a truncated intermediate. If serialization/write raises, the
    pre-existing file at ``path`` is left untouched and the tmp is cleaned up.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding=encoding) as f:
            f.write(text)
        os.replace(tmp, path)
    except BaseException:
        # Clean up on failure only — on success os.replace already moved tmp
        # away. Cleanup errors are swallowed locally so the ORIGINAL exception
        # (the one the caller needs) propagates unshadowed. os.close covers the
        # case where os.fdopen itself raised before the `with` took ownership of
        # the fd (a held fd would otherwise block os.remove on Windows).
        try:
            os.close(fd)
        except OSError:
            pass
        try:
            os.remove(tmp)
        except FileNotFoundError:
            pass
        raise


def read_json(path: Path, default: Any = None) -> Any:
    """Read + parse JSON from ``path``, returning ``default`` on any failure.

    The read-side companion to the atomic writers: a concurrent atomic write is
    seen whole, but a file that is absent, unreadable, or holds invalid JSON /
    invalid UTF-8 (a partial write elsewhere, or hand-editing) must degrade, not
    raise. ``(OSError, ValueError)`` covers missing/unreadable files,
    JSONDecodeError, AND UnicodeDecodeError (a ValueError subclass — the invalid
    UTF-8 case a bare OSError catch would miss).

    New JSON readers SHOULD use this instead of a bespoke try/except so the
    UnicodeDecodeError-safe behavior is uniform.
    """
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def atomic_write_json(path: Path, obj: Any, **dumps_kwargs: Any) -> None:
    """Serialize ``obj`` to JSON and write it to ``path`` atomically.

    ``dumps_kwargs`` are passed through to ``json.dumps`` (e.g. ``indent=2``,
    ``ensure_ascii=False``). Serialization happens BEFORE any file is touched,
    so a non-serializable ``obj`` raises without disturbing the existing file.
    """
    text = json.dumps(obj, **dumps_kwargs)
    atomic_write_text(path, text)
