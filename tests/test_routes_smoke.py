# pyright: reportMissingImports=false
# (portfolio_app lives one dir up; conftest.py puts it on sys.path at runtime.)
"""Smoke: every route renders (200 + full HTML / valid JSON), no Jinja
UndefinedError. raise_server_exceptions surfaces template errors as tracebacks."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import portfolio_app

APP_DIR = Path(str(portfolio_app.__file__)).parent
client = TestClient(portfolio_app.app, raise_server_exceptions=True)


def _routes() -> list[str]:
    out: list[str] = []
    for r in portfolio_app.app.routes:
        methods = getattr(r, "methods", None)
        path = getattr(r, "path", "")
        if not methods or "GET" not in methods:
            continue
        if path.startswith("/static") or "{" in path or path == "/":
            continue
        out.append(path)
    return sorted(set(out))


ALL = _routes()
# /healthz (Render health check, added at public deploy) speaks JSON but has
# no .json suffix — classify it with the JSON routes, not the HTML pages.
HTML = [p for p in ALL if not p.endswith((".json", ".pdf")) and p != "/healthz"]
JSONR = [p for p in ALL if p.endswith(".json") or p == "/healthz"]
PDF = [p for p in ALL if p.endswith(".pdf")]


@pytest.mark.parametrize("path", HTML)
def test_html_route_renders(path: str) -> None:
    r = client.get(path, follow_redirects=True)
    assert r.status_code == 200, f"{path} -> {r.status_code}"
    body = r.text.lower()
    assert len(body) > 500, f"{path} body too short ({len(body)})"
    assert "<html" in body and "</html>" in body, f"{path} not a full HTML doc"


@pytest.mark.parametrize("path", JSONR)
def test_json_route_valid(path: str) -> None:
    r = client.get(path)
    assert r.status_code == 200, f"{path} -> {r.status_code}"
    json.loads(r.text)  # raises on invalid JSON


def test_source_json_projects_slice() -> None:
    r = client.get("/portfolio-source.json?page=projects")
    assert r.status_code == 200
    assert "projects" in json.loads(r.text)


def test_source_json_bad_page_is_400() -> None:
    r = client.get("/portfolio-source.json?page=__nonsense__")
    assert r.status_code == 400


@pytest.mark.parametrize("path", PDF)
def test_pdf_route(path: str) -> None:
    name = path.lstrip("/")
    if not (APP_DIR / "data" / name).exists():
        pytest.skip(f"{name} absent")
    r = client.get(path)
    assert r.status_code == 200
    assert r.content[:4] == b"%PDF", f"{path} not a PDF"


def test_root_redirects_to_portfolio() -> None:
    r = client.get("/", follow_redirects=False)
    assert r.status_code in (307, 308)
    assert r.headers["location"] == "/portfolio"


def test_deep_dive_routes_render_project_content() -> None:
    # Phase B added 4 deep-dive pages. A 200 alone is not enough: if the
    # __id lookup falls through, current_project=None and the page renders a
    # blank body (nav+footer only) that still 200s. The "Back to projects"
    # link lives INSIDE {% if current_project %}, so its presence proves the
    # project actually resolved.
    for slug in ("money-compass", "edge-factory", "karaoke", "trading-journal"):
        r = client.get(f"/portfolio/projects/{slug}", follow_redirects=True)
        assert r.status_code == 200, f"deep-dive {slug} -> {r.status_code}"
        assert "back to projects" in r.text.lower(), (
            f"deep-dive {slug} rendered no project (current_project=None)"
        )


def test_unknown_url_renders_styled_404() -> None:
    # A mistyped URL should return the styled 404 page (status 404, HTML), not
    # the raw {"detail":"Not Found"} JSON. The attacker-controlled path must be
    # HTML-escaped (Jinja autoescape) — a <script> in the path must not appear raw.
    r = client.get("/portfolio/does-not-exist-xyz", follow_redirects=True)
    assert r.status_code == 404
    assert "text/html" in r.headers.get("content-type", "")
    assert "not found" in r.text.lower()
    xss = client.get("/portfolio/<script>alert(1)</script>", follow_redirects=True)
    assert xss.status_code == 404
    assert "<script>alert(1)</script>" not in xss.text
