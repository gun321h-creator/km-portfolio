# km-portfolio — public career portfolio

Standalone public deployment of Kanokpon Mettasat's career portfolio. Extracted
from a private dashboard's `/portfolio` routes into a self-contained FastAPI app
with **zero money / trading / live-state code**.

## Run locally

```bash
pip install -r requirements-dev.txt
uvicorn portfolio_app:app --reload      # http://127.0.0.1:8000/portfolio
pytest                                   # leak-guard + smoke tests
```

## Deploy (Render free web service)

Connect this repo in the Render dashboard. `render.yaml` supplies the build
(`pip install -r requirements.txt`) and start
(`uvicorn portfolio_app:app --host 0.0.0.0 --port $PORT`) commands. Free tier
cold-starts in ~30–50s after idle.

> After the Render service name is known, update the `og:url` + JSON-LD `url` in
> `templates/portfolio_base.html` (currently `https://km-portfolio.onrender.com`).

## Isolation invariants (enforced by `tests/test_no_money_leak.py`)

This app is public. It must never leak the owner's live trading P&L. Guaranteed by:

- **`chrome` context is a permanently-empty dict** (`EMPTY_CHROME`) — the shell
  dereferences money fields only inside `px_hud/px_left/px_right/px_bottom`, all
  overridden empty by `portfolio_base.html`. Because `chrome` carries no money
  data at all, a future un-suppression could at worst render an empty string,
  never a real figure. (Templates use Jinja's default `Undefined`, not
  `StrictUndefined`, so legitimately-absent optional fields don't 500 — fail-closed
  on money is enforced by the leak-guard tests, not by undefined-handling.)
- **No money/state modules imported** (`chrome`, `smart_money`, `wealth*`, `BOT.*`,
  `MetaTrader5`, `requests`/`httpx`). Only data read is `data/portfolio*`.
- **Two dashboard JS files dropped** (`cmdk.js`, `aurora_flip.js`) — they fetch
  internal `/api/*` endpoints. `nav.html` (internal route map) is not shipped.
- **Leak-guard test** renders every route and asserts no money tokens / signed-`$`
  P&L pattern / private hostname appears in the output or the shipped data files.
