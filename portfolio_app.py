"""Standalone PUBLIC career-portfolio app (Render free web service).

Extracted from the private Tailscale dashboard's `/portfolio` routes into a
self-contained FastAPI app that ships ZERO money / trading / live-state code.

ISOLATION INVARIANTS (asserted by tests/test_no_money_leak.py):
  * NEVER import: chrome / chrome_mod, smart_money, wealth*, server, any
    BOT.* or e8_multimarket module, MetaTrader5, requests/httpx.
  * NEVER read: forward_v2_state.json, any *state*.json outside data/,
    .env, anything under key/. Only env read: PORT (uvicorn), BUILD_ID.
  * Only data source: ./data/portfolio*.json + ./data/portfolio_latest.md
    + the 3 PDFs.

The single historical leak risk was the shared `chrome` context (it carried
today_usd / week_usd / month_usd / coins / dd_* / edges_open). Here `chrome`
is a permanently-empty dict — see EMPTY_CHROME below.
"""

from __future__ import annotations

import html as _html
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import (
    FileResponse,
    HTMLResponse,
    JSONResponse,
    RedirectResponse,
    Response,
)
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.exceptions import HTTPException as StarletteHTTPException

# Make this app's own directory importable regardless of the process CWD. Render
# runs `uvicorn portfolio_app:app` from the repo root (which IS this dir when the
# folder is pushed as its own repo), but a defensive insert also covers the case
# where it is launched from a parent directory.
sys.path.insert(0, str(Path(__file__).resolve().parent))

import portfolio as portfolio_mod  # noqa: E402  (after sys.path bootstrap above)


def _noindex(resp: Response) -> Response:
    """Tell crawlers not to index a raw JSON data endpoint. HTML pages stay
    indexable (public career portfolio) — only the machine-readable JSON slices
    get noindex, matching the original dashboard behaviour."""
    resp.headers["X-Robots-Tag"] = "noindex, nofollow, noarchive"
    return resp


ROOT = Path(__file__).parent
DATA_DIR = ROOT / "data"
# Render injects PORT; BUILD_ID busts static caches. No money/state env read.
BUILD_ID = os.environ.get(
    "BUILD_ID", datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
)

# No API surface on a public site: disable /docs, /redoc, /openapi.json so the
# route table is not enumerable.
app = FastAPI(title="portfolio", docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")

templates = Jinja2Templates(directory=ROOT / "templates")
# NOTE (Phase B deviation from blueprint): the templates were authored for
# Jinja's DEFAULT Undefined and use `{% if obj.optional %}` guards on fields that
# are legitimately absent (image_portrait, contact_github, an unpopulated
# audience). StrictUndefined 500s those legit pages. It is NOT needed for money
# safety: the sole leak vector was chrome's live P&L, and here `chrome` carries
# NO money data at all (EMPTY_CHROME) — a template bug could at worst render an
# empty string, never a real figure. Fail-closed is enforced by the leak-guard
# test, not by undefined-handling. So we keep the default Undefined.


def _usd(value: object) -> str:
    """Parity shim for the dashboard's `usd` Jinja filter (which imported
    smart_money.format_currency). Reimplemented locally so this app never
    imports the money module. No portfolio template currently uses `|usd`
    (verified) — this exists only so the filter name resolves if referenced.
    """
    try:
        return f"${float(value):,.2f}"  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return "—"


templates.env.filters["usd"] = _usd

# SAFETY: the pixel shell dereferences chrome.* ONLY inside px_hud / px_left /
# px_right / px_bottom, all overridden to empty by portfolio_base.html. An
# empty dict means: if anyone ever un-suppresses one of those blocks, Jinja's
# StrictUndefined raises (500, fail-closed) instead of rendering money.
# NEVER populate this with money / live-state fields.
EMPTY_CHROME: dict = {}


def _portfolio_content_or_503() -> tuple[dict | None, HTMLResponse | None]:
    """Load portfolio content; on failure return a 503 HTMLResponse (mirrors
    the dashboard's behaviour so a bad JSON deploy degrades, not 500s)."""
    try:
        return portfolio_mod.load_portfolio_content(), None
    except portfolio_mod.PortfolioContentError as exc:
        return None, HTMLResponse(
            content=f"<h1>portfolio unavailable</h1><pre>{_html.escape(str(exc))}</pre>",
            status_code=503,
        )


def _render_portfolio_page(request: Request, page_id: str) -> Response:
    """Shared renderer — ported from server.py:1575-1658 with the money
    dependency removed (chrome=EMPTY_CHROME, no chrome_mod / BUILD_ID via env)."""
    content, err = _portfolio_content_or_503()
    if err is not None:
        return err
    assert content is not None

    latest_md = portfolio_mod.load_portfolio_latest_md()
    latest_md_rendered = portfolio_mod.load_portfolio_latest_md_rendered()
    latest_md_mtime = ""
    if latest_md:
        try:
            stat = portfolio_mod.PORTFOLIO_LATEST_MD_PATH.stat()
            latest_md_mtime = datetime.fromtimestamp(
                stat.st_mtime, tz=timezone.utc
            ).isoformat()
        except OSError:
            latest_md_mtime = ""

    if page_id in ("grad-school", "recruit", "internship", "pa"):
        template_name = "portfolio_audience.html"
    elif page_id == "blog":
        template_name = "portfolio_blog.html"
    elif page_id == "reading":
        template_name = "portfolio_reading.html"
    elif page_id.startswith("proj-"):
        template_name = "portfolio_project_detail.html"
    else:
        template_name = f"portfolio_{page_id}.html"

    current_project = None
    if page_id.startswith("proj-"):
        for proj in content.get("projects", []):
            if isinstance(proj, dict) and proj.get("__id") == page_id:
                current_project = proj
                break

    audience = None
    if page_id == "grad-school":
        audience = content.get("grad_school")
    elif page_id == "recruit":
        audience = content.get("recruit")
    elif page_id == "internship":
        audience = content.get("internship")
    elif page_id == "pa":
        audience = content.get("pa")

    return templates.TemplateResponse(
        request,
        template_name,
        {
            "build": BUILD_ID,
            "p": content,
            "changelog": portfolio_mod.load_portfolio_changelog(),
            "now": portfolio_mod.load_portfolio_now(),
            "latest_md": latest_md,
            "latest_md_rendered": latest_md_rendered,
            "latest_md_mtime": latest_md_mtime,
            "current_page_id": page_id,
            "current_project": current_project,
            "audience": audience,
            "chrome": EMPTY_CHROME,
        },
    )


# --- Root redirect ---------------------------------------------------------
@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse("/portfolio", status_code=308)


# --- HTML page routes ------------------------------------------------------
# path suffix (appended to /portfolio) -> page_id
_PAGE_ROUTES = {
    "": "home",
    "/about": "about",
    "/education": "education",
    "/projects": "projects",
    "/contact": "contact",
    "/projects/dashboard": "proj-dashboard",
    "/projects/line-bot": "proj-linebot",
    "/projects/quant": "proj-quant",
    "/projects/suri": "proj-suri",
    # Phase B: deep-dive pages for Phase A's 4 new projects.
    "/projects/money-compass": "proj-money-compass",
    "/projects/edge-factory": "proj-edge-factory",
    "/projects/karaoke": "proj-karaoke",
    "/projects/trading-journal": "proj-journal",
    "/grad-school": "grad-school",
    "/recruit": "recruit",
    "/internship": "internship",
    "/pa": "pa",
    "/blog": "blog",
    "/reading": "reading",
}


def _register_page_routes() -> None:
    for suffix, page_id in _PAGE_ROUTES.items():

        def _make(pid: str):
            def _handler(request: Request) -> Response:
                return _render_portfolio_page(request, pid)

            return _handler

        app.add_api_route(
            f"/portfolio{suffix}",
            _make(page_id),
            methods=["GET"],
            response_class=HTMLResponse,
            include_in_schema=False,
        )


_register_page_routes()


@app.exception_handler(StarletteHTTPException)
def http_exception_handler(request: Request, exc: StarletteHTTPException) -> Response:
    """Styled 404 instead of raw {"detail":"Not Found"} JSON for a mistyped URL.
    Non-404 HTTPExceptions keep the default JSON shape. Fail-soft: if content
    can't load, fall back to a plain 404 (never 500 the error page itself).
    `requested_path` is HTML-escaped by Jinja autoescape."""
    if exc.status_code != 404:
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
    content, err = _portfolio_content_or_503()
    if err is not None:
        return JSONResponse({"error": "not found"}, status_code=404)
    return templates.TemplateResponse(
        request,
        "portfolio_404.html",
        {
            "build": BUILD_ID,
            "p": content,
            "changelog": portfolio_mod.load_portfolio_changelog(),
            "now": portfolio_mod.load_portfolio_now(),
            "current_page_id": "404",
            "requested_path": request.url.path,
            "chrome": EMPTY_CHROME,
        },
        status_code=404,
    )


# --- Health check (lightweight — Render probes this, NOT the heavy /portfolio
#     page). Returns instantly with no file I/O so a slow content load can never
#     make Render mark the instance unhealthy and recycle it. --------------------
@app.get("/healthz", include_in_schema=False)
def healthz() -> Response:
    return JSONResponse({"ok": True})


# --- CV preview (standalone template, context is ONLY {build, p}) ----------
@app.get("/portfolio/cv-preview", response_class=HTMLResponse, include_in_schema=False)
def cv_preview(request: Request) -> Response:
    content, err = _portfolio_content_or_503()
    if err is not None:
        return err
    return templates.TemplateResponse(
        request, "portfolio_cv.html", {"build": BUILD_ID, "p": content}
    )


# --- PDF downloads ---------------------------------------------------------
def _pdf(name: str, download_name: str) -> Response:
    path = DATA_DIR / name
    if not path.is_file():
        # A missing pre-rendered PDF is a deploy defect, not a bad URL → 503
        # (parity with the dashboard). The files ship in data/ so this is rare.
        return JSONResponse({"error": f"{name} not rendered"}, status_code=503)
    # Recruiter-facing download name, not the raw storage name.
    return FileResponse(path, media_type="application/pdf", filename=download_name)


@app.get("/portfolio.pdf", include_in_schema=False)
def portfolio_pdf() -> Response:
    return _pdf("portfolio.pdf", "Kanokpon_Mettasat_Portfolio.pdf")


@app.get("/portfolio-cv.pdf", include_in_schema=False)
def portfolio_cv_pdf() -> Response:
    return _pdf("portfolio-cv.pdf", "Kanokpon_Mettasat_CV.pdf")


@app.get("/portfolio_pa.pdf", include_in_schema=False)
def portfolio_pa_pdf() -> Response:
    return _pdf("portfolio_pa.pdf", "Kanokpon_Mettasat_PA.pdf")


# --- JSON data endpoints (noindex: raw data, not pages) --------------------
@app.get("/portfolio-activity.json", include_in_schema=False)
def portfolio_activity_json() -> Response:
    return _noindex(JSONResponse(portfolio_mod.load_portfolio_activity_capped_365()))


@app.get("/portfolio-source.json", include_in_schema=False)
def portfolio_source_json(page: str | None = None) -> Response:
    content, err = _portfolio_content_or_503()
    if err is not None:
        # This route always speaks JSON — don't leak the HTML 503 helper here.
        return _noindex(
            JSONResponse({"error": "portfolio content unavailable"}, status_code=503)
        )
    assert content is not None
    if page is None:
        # v1.1 backward-compat: no ?page= → the full canonical doc.
        return _noindex(JSONResponse(content))
    try:
        body = portfolio_mod.slice_for_view_source(content, page)
    except ValueError:
        # Static message — never reflect the attacker-supplied ?page= value.
        return _noindex(JSONResponse({"error": "unknown page"}, status_code=400))
    # slice_for_view_source returns a JSON *string* already.
    return _noindex(Response(content=body, media_type="application/json"))
