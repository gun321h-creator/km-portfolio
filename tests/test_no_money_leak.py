"""Leak-guard: prove the public portfolio never renders the owner's live money
state, private infra hostnames, or ships secrets. Fail-closed.

Distinguishes PUBLIC project content (trading journal, wealth aggregator, equity
curve — all intentionally in portfolio.json) from LIVE MONEY STATE (the chrome
P&L fields, forward_v2 state, Tailscale hostname). Only the latter are forbidden.
"""

# pyright: reportMissingImports=false
# (portfolio_app lives one dir up; conftest.py puts it on sys.path at runtime.)
from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import portfolio_app

APP_DIR = Path(str(portfolio_app.__file__)).parent
client = TestClient(portfolio_app.app)


def _get_routes() -> list[str]:
    paths: list[str] = []
    for r in portfolio_app.app.routes:
        methods = getattr(r, "methods", None)
        path = getattr(r, "path", "")
        if not methods or "GET" not in methods:
            continue
        if path.startswith("/static") or "{" in path:
            continue
        paths.append(path)
    return sorted(set(paths))


ROUTES = _get_routes()

# Live-money / private-infra markers + live-money campaign codenames. The
# "wealth"/"equity"/"holdings" words appear legitimately in the career prose,
# but the "learn11" codename must never render on this public surface (§3b) —
# the project is showcased under its public-safe name "Trading Journal".
FORBIDDEN_TOKENS = [
    "learn11",
    "today_usd",
    "week_usd",
    "month_usd",
    "dd_pct",
    "dd_cap_pct",
    "dd_fill_pct",
    "edges_open",
    "last_cycle_utc",
    "px-hud",
    "px-agents",
    "px-right",
    "px-console",
    "px-lofi",
    "px-coins",
    "chrome.coins",
    "forward_v2",
    "smart_money",
    "tailaa08bf",
    "mmbot",
    ".ts.net",
    # Dropped dashboard assets must NOT be loaded, and internal API paths must
    # NOT appear (including inside HTML comments — use Jinja {# #} not <!-- -->).
    "js/cmdk.js",
    "js/aurora_flip.js",
    "/api/cmdk",
    "/api/forward",
]

# Signed dollar P&L (chrome renders "$+123.45" / "-$5.00"). Unsigned career
# figures ("$6/lot", "$100/day") are intentionally allowed.
PNL_RE = re.compile(r"\$[+-]\d|[+-]\$\d")


@pytest.mark.parametrize("path", ROUTES)
def test_route_renders_without_money(path: str) -> None:
    resp = client.get(path, follow_redirects=True)
    assert resp.status_code == 200, f"{path} -> {resp.status_code}"
    if path.endswith(".pdf"):
        # PDFs are GUN-authored static resume files; they never pass through the
        # chrome context, and their binary bytes can spuriously match the
        # signed-$ regex. Verify they are real PDFs, not their money content.
        assert resp.content[:4] == b"%PDF", f"{path} not a PDF"
        return
    body = resp.text
    low = body.lower()
    for tok in FORBIDDEN_TOKENS:
        assert tok.lower() not in low, f"leak token {tok!r} in {path}"
    assert not PNL_RE.search(body), f"signed $P&L pattern in {path}"


def test_route_enumeration_is_not_empty() -> None:
    # Fail-closed: a silently-empty route list would make the parametrized test
    # pass vacuously. 21 dashboard-parity + 4 deep-dives ~= 26 handlers.
    assert len(ROUTES) >= 20, f"expected >=20 routes, got {len(ROUTES)}: {ROUTES}"


def test_import_isolation() -> None:
    loaded = set(sys.modules)
    forbidden = {"chrome", "smart_money", "server"}
    assert not (forbidden & loaded), f"forbidden modules imported: {forbidden & loaded}"
    bad = [
        m
        for m in loaded
        if m.startswith("BOT.") or m.startswith("wealth") or m == "MetaTrader5"
    ]
    assert not bad, f"forbidden modules imported: {bad}"


def test_source_has_no_forbidden_imports() -> None:
    banned = [
        "import chrome",
        "from chrome import",
        "import smart_money",
        "from smart_money",
        "from BOT",
        "import MetaTrader5",
        "import requests",
        "import httpx",
        "import wealth",
    ]
    for name in ("portfolio_app.py", "portfolio.py", "atomic_io.py"):
        text = (APP_DIR / name).read_text(encoding="utf-8")
        for frag in banned:
            assert frag not in text, f"{name} contains forbidden import {frag!r}"


def test_tree_has_no_secrets() -> None:
    assert not (APP_DIR / "key").exists(), "key/ dir shipped"
    _skip_dirs = {"__pycache__", ".pytest_cache", ".venv", ".git", "node_modules"}
    for p in APP_DIR.rglob("*"):
        if p.is_dir() or _skip_dirs & set(p.parts):
            continue
        name = p.name.lower()
        assert name != ".env", f"shipped .env: {p}"
        assert not name.endswith((".key", ".pem")), f"shipped secret: {p}"
        # A *state* JSON (e.g. forward_v2_state.json) must never ship; the only
        # allowed "state"-ish names are the portfolio data files + CSS.
        if name.endswith(".json") and "state" in name:
            assert name.startswith("portfolio"), f"suspicious state file: {p}"


def test_data_dir_only_allowed_files() -> None:
    allowed = {
        "portfolio.json",
        "portfolio_activity.json",
        "portfolio_changelog.json",
        "portfolio_now.json",
        "portfolio_latest.md",
        "portfolio.pdf",
        "portfolio-cv.pdf",
        "portfolio_pa.pdf",
    }
    present = {p.name for p in (APP_DIR / "data").iterdir() if p.is_file()}
    extra = present - allowed
    assert not extra, f"unexpected data files: {extra}"


def test_data_files_no_money_state() -> None:
    # Fable risk #2/#3: dashboard-generated snapshots (changelog/now/activity)
    # could carry internal money state or the private hostname.
    for p in (APP_DIR / "data").glob("*.json"):
        raw = p.read_text(encoding="utf-8", errors="ignore").lower()
        for tok in (
            "today_usd",
            "week_usd",
            "month_usd",
            "forward_v2",
            "tailaa08bf",
            "mmbot-dashboard",
        ):
            assert tok not in raw, f"{p.name} contains {tok!r}"
    md = APP_DIR / "data" / "portfolio_latest.md"
    if md.exists():
        assert "tailaa08bf" not in md.read_text(encoding="utf-8", errors="ignore")


def test_static_js_has_no_internal_endpoints() -> None:
    # HTML-body scans never see .js source; a shell script that fetches an
    # internal dashboard route (e.g. terminal_mode.js -> /api/forward) would
    # ship silently. Scan every static .js for internal endpoints/hosts.
    # portfolio.js legitimately fetches its own /portfolio-* routes via a
    # dynamic `dataset.src` / variable, so bare "fetch(" is NOT banned.
    banned = [
        "/api/",
        "/wealth",
        "/smart-money",
        "forward-11edge",
        "tailaa08bf",
        "mmbot-dashboard",
        ".ts.net",
    ]
    offenders: dict[str, list[str]] = {}
    for js in sorted((APP_DIR / "static").rglob("*.js")):
        low = js.read_text(encoding="utf-8", errors="ignore").lower()
        hits = [b for b in banned if b in low]
        if hits:
            offenders[js.name] = hits
    assert not offenders, (
        f"shell JS references internal endpoints — drop the file or the "
        f"reference: {offenders}"
    )


def test_static_css_has_no_internal_endpoints() -> None:
    # Sibling of the .js scan above. HTML-body scans never see stylesheet
    # source, so a dashboard component CSS carried over into the public build
    # (e.g. stripe_mesh_treemap.css -> "/wealth" in a header comment) would
    # ship its internal-route references silently. Scan every static .css for
    # the same internal endpoints/hosts the .js scan bans.
    banned = [
        "/api/",
        "/wealth",
        "/smart-money",
        "forward-11edge",
        "tailaa08bf",
        "mmbot-dashboard",
        ".ts.net",
    ]
    offenders: dict[str, list[str]] = {}
    for css in sorted((APP_DIR / "static").rglob("*.css")):
        low = css.read_text(encoding="utf-8", errors="ignore").lower()
        hits = [b for b in banned if b in low]
        if hits:
            offenders[css.name] = hits
    assert not offenders, (
        f"stylesheet references internal endpoints — drop the file or the "
        f"reference: {offenders}"
    )


def test_pdf_downloads_have_no_internal_tokens() -> None:
    # test_route_renders_without_money SKIPS .pdf routes (it only checks the
    # %PDF magic), so nothing ever scanned the *text* of the downloadable
    # resume PDFs. A PDF exported from a stale template can bake in the private
    # Tailscale hostname or a live-money codename (this exact gap shipped
    # mmbot-dashboard.tailaa08bf.ts.net inside portfolio-cv.pdf). Extract every
    # PDF's text and scan it with the same internal-token blocklist.
    pypdf = pytest.importorskip("pypdf", reason="pypdf needed to scan PDF text")
    banned = [
        "tailaa08bf",
        "mmbot-dashboard",
        ".ts.net",
        "/api/",
        "/wealth",
        "/smart-money",
        "forward-11edge",
        "learn11",
        "ftmo",
        "phase 1.5",
        "challenger",
    ]
    offenders: dict[str, list[str]] = {}
    for pdf in sorted((APP_DIR / "data").rglob("*.pdf")):
        reader = pypdf.PdfReader(str(pdf))
        text = " ".join(page.extract_text() or "" for page in reader.pages).lower()
        hits = [b for b in banned if b in text]
        if hits:
            offenders[pdf.name] = hits
    assert not offenders, (
        f"downloadable PDF leaks internal host/route/codename — re-export the "
        f"PDF from the current template: {offenders}"
    )


def test_portfolio_now_status_is_public_safe() -> None:
    # `now.status` renders verbatim in the public status bar. It must never
    # carry an internal project codename (e.g. "Phase 1.5 FTMO", "LEARN11").
    now = APP_DIR / "data" / "portfolio_now.json"
    if not now.exists():
        return
    import json

    doc = json.loads(now.read_text(encoding="utf-8"))
    status = str(doc.get("status") or "").lower()
    banned = [
        "ftmo",
        "learn11",
        "learn 11",
        "phase 1.5",
        "phase 1_5",
        "pyramid",
        "challenger",
        "carve",
        "live-money",
        "live money",
        "real money",
        "real-money",
        "prop firm",
        "prop-firm",
    ]
    bad = [b for b in banned if b in status]
    assert not bad, f"portfolio_now.json status leaks codename(s) {bad}: {status!r}"
