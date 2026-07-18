## 2024-2026 update

**Year 2 (VMI, Aug 2024 -- May 2025).** Coursework in the ECE core: Digital Systems Design, Electrical Circuit Analysis, Discrete Mathematics, multivariable Calculus. Closed Term 2 with a Term GPA of 4.00 (all-A semester).

**Summer 2025 (Bangkok).** Returned home; spent the off-term refining the personal quantitative-trading research workflow (multi-asset OHLCV in `pandas`, walk-forward out-of-sample validation, pre-registered hypotheses).

**Year 3 Term 1 (VMI, Aug 2025 -- Dec 2025).** Computer Architecture, Microcontrollers, Electronics, Modern Physics. Term GPA 3.81. **Tau Beta Pi** (Engineering Honor Society, Virginia Chapter) invitation in Nov 2025.

**Year 3 Term 2 / Spring 2026 in progress.** Honors-program coursework; competed at **IEEE SoutheastCon 2026** in Alabama and placed **4th in Undergraduate Circuit Design** (Mar 2026). Represented VMI at the **Tau Beta Pi national conference** the same month.

### Software shipping cadence (research-only, public-repo dates)

- **May 2026 -- LINE OA personal-secretary bot.** Multi-owner LINE Messaging API service with daily 18:00 BKK eve-of briefing, 1-hour pre-alerts, Sunday weekly digest, daily SQLite snapshot backup, Telegram-style task commands (`/list`, `/done`, `/retry`). Deployed unattended on a Windows VPS behind Tailscale. ~201 tests.
- **May 2026 -- Trading-research dashboard.** `FastAPI` + Jinja2 monitoring site with multiple pages: hub with a BKK/NY clock tower, project board with phase-locked Gantt rows, 30-agent organisation chart, pixel-art floor-plan view of active agents, and a decision-rules anchor page. Hard-restart deploy via PowerShell; reachable on a Tailscale Funnel URL. ~300+ tests.
- **May 2026 -- /portfolio public personal-introduction page.** This page. `FastAPI` + Jinja2 with an IDE-shell layout, multi-route split, view-source modal, Cmd-K command palette, keyboard-driven `vim`-style navigation, and a 365-day commit-activity grid. ~120 tests on this surface alone.

### Quantitative trading research

Continued the multi-asset backtest framework through 2026. Current state (per the project's own status doc):

- The single primary system in active research is **11-edge FLAT** -- eleven equal-weight signals across XAUUSD, GBPUSD, EURJPY, GBPJPY, USDJPY, US30, US100, ETHUSD with a UNION(C0, C7) selector and a flat (no-pyramid) ladder. Backtest Sharpe `~2.59` / lower-bound Sharpe `~2.27`.
- Decision principle is **Sharpe first, leverage last**: rank configurations by the block-bootstrap 5th-percentile Sharpe and pass three probability-of-edge gates (`SR_LB >= 1.0`, `PSR >= 0.95`, `DSR >= 0.95`) before any deployment label. Earlier high-CAGR ladders were retired after independent audits showed them tail-fragile.
- The forward-validation window runs on a demo broker via MetaTrader 5; a separate signed spec covers an isolated force-test on a small evaluation account. No claim of a profitable live edge -- the entire framework is research, code, and documentation.

A companion literature review followed a **PRISMA-style protocol** across **79 IEEE papers** (May 2026), with a multi-dimensional taxonomy used to guide the 2026 research backlog.
