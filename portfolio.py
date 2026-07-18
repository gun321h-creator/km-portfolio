"""Public `/portfolio` page -- pure content loader.

Reads BOT/dashboard/data/portfolio.json, validates a small set of
required keys, and renders a tiny subset of inline markdown
(`**bold**` -> `<strong>`) on user-edited prose fields so the
template can use `| safe` without re-introducing XSS.

No FastAPI imports here -- this module stays a pure data layer so
the route in server.py can map errors to HTTP responses without
this file depending on the web framework.

The public entry point `load_portfolio_content()` is wrapped in
functools.lru_cache so the JSON read happens once per process;
callers MUST NOT mutate the returned dict. Tests call
.cache_clear() between scenarios that monkeypatch the source path.
"""

from __future__ import annotations

import functools
import html
import json
import re
from datetime import date, datetime
from pathlib import Path
from typing import Any

from atomic_io import read_json

ROOT = Path(__file__).parent
PORTFOLIO_JSON_PATH = ROOT / "data" / "portfolio.json"
PORTFOLIO_CHANGELOG_PATH = ROOT / "data" / "portfolio_changelog.json"
PORTFOLIO_NOW_PATH = ROOT / "data" / "portfolio_now.json"
PORTFOLIO_ACTIVITY_PATH = ROOT / "data" / "portfolio_activity.json"
PORTFOLIO_LATEST_MD_PATH = ROOT / "data" / "portfolio_latest.md"

_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
_CODE_RE = re.compile(r"`([^`]+?)`")

_PROJECT_IDS = (
    "proj-dashboard",
    "proj-linebot",
    "proj-quant",
    "proj-suri",
    # Phase B (public deploy): deep-dive pages for the 4 projects added in
    # Phase A. Order MUST match projects[] order in portfolio.json (verified:
    # idx 4-7 = Money Compass, Edge Factory, Karaoke, Trading Journal).
    "proj-money-compass",
    "proj-edge-factory",
    "proj-karaoke",
    "proj-journal",
)
_PROJECT_FILENAMES = (
    "dashboard.ts",
    "line-bot.py",
    "quant-research/README.md",
    "suri/README.md",
    "money-compass.py",
    "edge-factory.py",
    "karaoke-web.ts",
    "trading-journal.py",
)
# v1.3 (E3 + B5): static illustration + deep-dive route per project.
# Index-aligned with _PROJECT_IDS so a future 4th project that lands without
# a matching asset simply renders without one (the template uses {% if %}).
# v1.6 Wave B-office: dashboard entry is a real /office Playwright PNG
# (1200x800) captured via scripts/capture_office_screenshot.py; the
# original dashboard.svg is preserved on disk as a fallback.
# v1.6 Wave B-quant: real equity-curve PNG (rendered by
# scripts/render_quant_equity_chart.py from the D1 Donchian PF 2.822
# CANDIDATE trade CSV). Replaces the v1.3 hand-drawn SVG placeholder;
# the .svg file is retained on disk for reference but no longer linked.
_PROJECT_SVGS = (
    # 2026-07-17: the three illustration PNGs were never shipped in the
    # PUBLIC build (no static/projects/ dir) -- every page load logged three
    # 404s and showed broken-image icons. None => template renders the card
    # without an image ({% if %} gate). Restore paths only when the assets
    # actually ship in this repo.
    None,
    None,
    None,
    None,
    # Phase B: no illustration asset for idx 4-7 yet; template gates on a
    # truthy value so None renders the deep-dive without an image.
    None,
    None,
    None,
    None,
)
_PROJECT_DEEP_DIVE_SLUGS = (
    "dashboard",
    "line-bot",
    "quant",
    "suri",
    "money-compass",
    "edge-factory",
    "karaoke",
    "trading-journal",
)

_REQUIRED_KEYS = (
    "name",
    "tagline",
    "hero_subtitle_lines",
    "contact_email",
    "contact_location",
    "about",
    "education",
    "projects",
    "footer_note",
)

# Fields whose user-edited string content is passed through
# `_render_inline` so `**bold**` becomes `<strong>` in the template.
# Everything else uses Jinja's default auto-escape and is rendered
# verbatim.
_INLINE_STRING_TOP_FIELDS = ("about", "tagline", "footer_note")


class PortfolioContentError(RuntimeError):
    """Raised when portfolio.json is missing, malformed, or lacks
    a required key. The route maps this to HTTP 503 with the
    message body."""


def _render_inline(text: str) -> str:
    """Render a small subset of inline markdown to SAFE HTML.

    Pipeline (order matters):
      1. HTML-escape the raw text (quote=False keeps `'` and `"`
         readable in body text; the result is only injected inside
         element bodies via `| safe`).
      2. Convert `**bold**` -> `<strong>bold</strong>`.
      3. Convert `` `code` `` -> `<code>code</code>`.

    Returned string is HTML-safe by construction: the only un-escaped
    `<`/`>` are the tags this function inserts. Callers can pass the
    result through Jinja's `| safe` filter without XSS risk even if
    `text` originated from a hand-edited JSON file.

    Mirrors `anchor._render_inline` deliberately; do NOT import from
    anchor so the two pages evolve independently.
    """
    escaped = html.escape(text, quote=False)
    with_bold = _BOLD_RE.sub(r"<strong>\1</strong>", escaped)
    with_code = _CODE_RE.sub(r"<code>\1</code>", with_bold)
    return with_code


def _validate_required(doc: dict) -> None:
    missing = [k for k in _REQUIRED_KEYS if k not in doc]
    if missing:
        raise PortfolioContentError(
            f"portfolio.json missing required key(s): {', '.join(missing)}"
        )
    if not isinstance(doc["education"], list) or not doc["education"]:
        raise PortfolioContentError(
            "portfolio.json key 'education' must be a non-empty list"
        )
    if not isinstance(doc["projects"], list) or not doc["projects"]:
        raise PortfolioContentError(
            "portfolio.json key 'projects' must be a non-empty list"
        )
    if not isinstance(doc["hero_subtitle_lines"], list):
        raise PortfolioContentError(
            "portfolio.json key 'hero_subtitle_lines' must be a list"
        )


def _render_top_inline_fields(doc: dict) -> None:
    for k in _INLINE_STRING_TOP_FIELDS:
        v = doc.get(k)
        if isinstance(v, str):
            doc[k] = _render_inline(v)


def _render_project_summaries(doc: dict) -> None:
    for proj in doc["projects"]:
        if isinstance(proj.get("summary"), str):
            proj["summary"] = _render_inline(proj["summary"])


def _attach_project_meta(doc: dict) -> None:
    """Inject `__id` + `__filename` on each project dict so the template
    can render them without parallel Jinja list literals.

    Beyond the hardcoded mapping, falls back to `proj-<index>` /
    `file-<index>.md` so adding a future 4th+ project does not crash the
    page render. Sidebar file-tree still only links to the first three;
    operator must extend the template + sidebar when adding a project.
    """
    for i, proj in enumerate(doc.get("projects", [])):
        if not isinstance(proj, dict):
            continue
        proj["__id"] = _PROJECT_IDS[i] if i < len(_PROJECT_IDS) else f"proj-{i}"
        proj["__filename"] = (
            _PROJECT_FILENAMES[i] if i < len(_PROJECT_FILENAMES) else f"file-{i}.md"
        )
        # v1.3 E3 + B5: deep-dive route + per-project SVG illustration.
        # Both are index-aligned with _PROJECT_IDS; a 4th+ project that ships
        # without an SVG renders without one (template gates on truthy value).
        proj["svg_illustration"] = _PROJECT_SVGS[i] if i < len(_PROJECT_SVGS) else None
        proj["deep_dive_route"] = (
            f"/portfolio/projects/{_PROJECT_DEEP_DIVE_SLUGS[i]}"
            if i < len(_PROJECT_DEEP_DIVE_SLUGS)
            else None
        )


_VALID_PAGE_IDS = (
    "home",
    "about",
    "education",
    "projects",
    "contact",
    # v1.3 E3: per-project deep-dive pages share one template
    # (portfolio_project_detail.html); the page_id selects which project.
    "proj-dashboard",
    "proj-linebot",
    "proj-quant",
    "proj-suri",
    # Phase B (public deploy): deep-dive pages for Phase A's 4 new projects.
    "proj-money-compass",
    "proj-edge-factory",
    "proj-karaoke",
    "proj-journal",
    # v1.4 E1 + E2: audience-specific share-only routes (NOT in tabs bar).
    "grad-school",
    "recruit",
    # v1.5 W2: content surfaces (NOT in tabs bar; reachable from home links).
    "blog",
    "reading",
    "internship",
    # v1.6: PA-specific audience route (NOT in tabs bar; share-only).
    "pa",
)


def slice_for_view_source(doc: dict[str, Any], page_id: str) -> str:
    """v1.2: return the JSON text the F3 view-source modal renders for a
    given page. Pure function.

    Precondition: `doc` must be the output of `load_portfolio_content()`
    (or another dict with the same shape: `education` and `projects`
    are lists, the string fields are strings). Callers that synthesise a
    doc directly must keep those invariants -- the "home" branch calls
    `len(doc[...])` on education/projects and will raise TypeError if
    either is None. The route in server.py only feeds the loader output,
    so the invariant holds in production.

    Raises ValueError on unknown `page_id`; the B2 route maps that to a
    400 response so a typo'd `?page=` query is surfaced clearly.

    On `home`, return a synthesised overview (top-level scalars +
    section-length stubs) so the user sees the same data they'd see by
    eyeballing the page. The full file is reachable only by passing
    `page_id` of one of the section pages.
    """
    if page_id == "home":
        return json.dumps(
            {
                "name": doc.get("name"),
                "tagline": doc.get("tagline"),
                "hero_subtitle_lines": doc.get("hero_subtitle_lines"),
                "contact_email": doc.get("contact_email"),
                "contact_location": doc.get("contact_location"),
                "education": f"<{len(doc.get('education', []))} items>",
                "projects": f"<{len(doc.get('projects', []))} items>",
                "footer_note": doc.get("footer_note"),
            },
            indent=2,
        )
    if page_id == "about":
        return json.dumps({"about": doc.get("about", "")}, indent=2)
    if page_id == "education":
        return json.dumps({"education": doc.get("education", [])}, indent=2)
    if page_id == "projects":
        return json.dumps({"projects": doc.get("projects", [])}, indent=2)
    if page_id == "contact":
        return json.dumps(
            {
                "contact_email": doc.get("contact_email"),
                "contact_location": doc.get("contact_location"),
            },
            indent=2,
        )
    if page_id.startswith("proj-"):
        # v1.3 E3 / Phase B: deep-dive view-source slice = the single project
        # dict. `startswith` covers all 8 projects (proj-dashboard..proj-journal)
        # without re-listing ids; matches by the __id attached
        # by _attach_project_meta. Falls back to a sentinel error blob so the
        # F3 modal stays well-formed JSON.
        for proj in doc.get("projects", []):
            if isinstance(proj, dict) and proj.get("__id") == page_id:
                return json.dumps(proj, indent=2)
        return json.dumps({"error": f"project not found: {page_id}"}, indent=2)
    # v1.4 E1 + E2: audience pages slice = the single audience dict.
    if page_id == "grad-school":
        return json.dumps({"grad_school": doc.get("grad_school", {})}, indent=2)
    if page_id == "recruit":
        return json.dumps({"recruit": doc.get("recruit", {})}, indent=2)
    # v1.5 W2: content surface slices = the single content dict.
    if page_id == "blog":
        return json.dumps({"blog": doc.get("blog", {})}, indent=2)
    if page_id == "reading":
        return json.dumps({"reading": doc.get("reading", {})}, indent=2)
    if page_id == "internship":
        return json.dumps({"internship": doc.get("internship", {})}, indent=2)
    # v1.6: PA audience slice = the single audience dict.
    if page_id == "pa":
        return json.dumps({"pa": doc.get("pa", {})}, indent=2)
    raise ValueError(f"unknown page_id: {page_id!r}; valid: {_VALID_PAGE_IDS}")


@functools.lru_cache(maxsize=1)
def load_portfolio_content() -> dict[str, Any]:
    """Public entry. Returns the parsed + validated + inline-rendered
    portfolio dict. Cached per process.

    Raises PortfolioContentError on any failure -- the route in
    server.py catches and maps to HTTP 503.
    """
    try:
        raw = PORTFOLIO_JSON_PATH.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        # UnicodeDecodeError (⊂ ValueError, not OSError): invalid UTF-8 from a
        # partial write -> route-caught PortfolioContentError (503), not a 500.
        raise PortfolioContentError(
            f"cannot read {PORTFOLIO_JSON_PATH.name}: {exc}"
        ) from exc
    try:
        doc = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise PortfolioContentError(
            f"{PORTFOLIO_JSON_PATH.name} is not valid JSON: {exc}"
        ) from exc
    if not isinstance(doc, dict):
        raise PortfolioContentError(
            f"{PORTFOLIO_JSON_PATH.name} root must be a JSON object"
        )
    _validate_required(doc)
    _render_top_inline_fields(doc)
    _render_project_summaries(doc)
    _attach_project_meta(doc)
    return doc


@functools.lru_cache(maxsize=1)
def load_portfolio_changelog() -> list[dict[str, Any]]:
    """F1.1 v1.1: Agent panel changelog. Returns [] if file absent or
    malformed -- never raises, since the panel is decorative-but-honest.

    Callers MUST NOT mutate the returned value -- it is shared across
    the process."""
    doc = read_json(PORTFOLIO_CHANGELOG_PATH)
    if not isinstance(doc, dict):
        return []
    entries = doc.get("entries", [])
    if not isinstance(entries, list):
        return []
    return [e for e in entries if isinstance(e, dict) and "date" in e and "file" in e]


@functools.lru_cache(maxsize=1)
def load_portfolio_now() -> dict[str, Any] | None:
    """F5: 'Now Playing' status. Returns None if file absent, malformed,
    or `since` is older than 30 days. Caller renders fallback when None.

    Callers MUST NOT mutate the returned value -- it is shared across
    the process."""
    doc = read_json(PORTFOLIO_NOW_PATH)
    if not isinstance(doc, dict):
        return None
    status = doc.get("status")
    since = doc.get("since")
    if not isinstance(status, str) or not isinstance(since, str):
        return None
    # 30-day stale-data guard
    try:
        since_date = datetime.strptime(since, "%Y-%m-%d").date()
        if (date.today() - since_date).days > 30:
            return None
    except (ValueError, TypeError):
        return None
    return {"status": status, "since": since}


@functools.lru_cache(maxsize=1)
def load_portfolio_activity() -> list[dict[str, Any]]:
    """F2: 365-day commit-grid data. Returns [] when absent/malformed.
    Caller filters to the rolling 365-day window.

    Callers MUST NOT mutate the returned value -- it is shared across
    the process."""
    # portfolio_activity.json is rewritten by portfolio_activity_regen.py on
    # every deploy -> a partial write splitting a multi-byte char yields invalid
    # UTF-8 (UnicodeDecodeError ⊂ ValueError). read_json degrades on that (plus
    # missing/unreadable/invalid-JSON); without it the unwrapped
    # /portfolio-activity.json route 500s AND the lru_cache latches the raise.
    doc = read_json(PORTFOLIO_ACTIVITY_PATH)
    if not isinstance(doc, list):
        return []
    return [
        e
        for e in doc
        if isinstance(e, dict)
        and isinstance(e.get("date"), str)
        and isinstance(e.get("commits"), int)
    ]


def load_portfolio_activity_capped_365() -> list[dict[str, Any]]:
    """F2 caller: returns only entries from the rolling 365-day window.

    Window semantics: cutoff = today - 365 days, inclusive. A file written
    by `scripts/portfolio_activity_regen.py` spans `[today - 365, today]`
    (366 calendar points), so all entries pass the filter on the day of
    regen. After 24h without a re-run the oldest entry falls out, and
    after 365d the file is fully aged out. Name says "365" for caller
    clarity even though up to 366 points may be returned the instant
    after a fresh regen -- this matches GitHub-style heatmap convention.

    Not lru_cached: wraps `load_portfolio_activity` (which IS cached) but
    the date cutoff is wall-clock-relative, so caching here would pin a
    stale cutoff for the life of the process. Cheap O(N) filter over
    <= 366 entries -- recompute per call is fine.
    """
    from datetime import date, datetime, timedelta

    cutoff = date.today() - timedelta(days=365)
    out: list[dict[str, Any]] = []
    for e in load_portfolio_activity():
        try:
            d = datetime.strptime(e["date"], "%Y-%m-%d").date()
        except (ValueError, TypeError, KeyError):
            continue
        if d >= cutoff:
            out.append(e)
    return out


@functools.lru_cache(maxsize=1)
def load_portfolio_latest_md() -> str | None:
    """v1.1: optional 2024-2026 update payload. Returns None when
    absent so the template can render the placeholder block."""
    try:
        return PORTFOLIO_LATEST_MD_PATH.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None


def _render_md_blocks(raw: str) -> str:
    """Render latest.md's small markdown subset to SAFE block HTML.

    v3 (2026-07-17): the old path fed the whole file through
    `_render_inline`, so `##` headings printed literally and every
    paragraph collapsed into one blob inside `.md-body`. This renders
    blocks (split on blank lines) into <h3>/<h4>/<ul>/<p>.

    Safety: every text fragment still goes through `_render_inline`,
    which HTML-escapes FIRST -- the only un-escaped tags are the ones
    this function and `_render_inline` insert. No raw-HTML passthrough.
    """
    out: list[str] = []
    for block in re.split(r"\n\s*\n", raw.strip()):
        lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
        if not lines:
            continue
        # Heading line (blocks in latest.md keep headings on their own
        # line; tolerate trailing lines by re-queueing them as a <p>).
        first = lines[0]
        if first.startswith("### "):
            out.append(f"<h4>{_render_inline(first[4:])}</h4>")
            lines = lines[1:]
        elif first.startswith("## "):
            out.append(f"<h3>{_render_inline(first[3:])}</h3>")
            lines = lines[1:]
        if not lines:
            continue
        if all(ln.startswith("- ") for ln in lines):
            items = "".join(f"<li>{_render_inline(ln[2:])}</li>" for ln in lines)
            out.append(f"<ul>{items}</ul>")
        else:
            out.append(f"<p>{_render_inline(' '.join(lines))}</p>")
    return "".join(out)


@functools.lru_cache(maxsize=1)
def load_portfolio_latest_md_rendered() -> str | None:
    """v1.1: optional 2024-2026 update payload, with markdown rendered
    to safe HTML (v3: block-level -- headings/lists/paragraphs -- not
    just inline bold/code). Returns None when latest.md is absent.

    Wraps `load_portfolio_latest_md` + `_render_md_blocks` so the route
    does not call private helpers across modules.

    Callers MUST NOT mutate the returned value -- it is shared across
    the process.
    """
    raw = load_portfolio_latest_md()
    if raw is None:
        return None
    return _render_md_blocks(raw)
