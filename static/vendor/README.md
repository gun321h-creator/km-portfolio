# Vendored JS (public portfolio)

Copies of the dashboard's vendored motion libraries, byte-identical to
`BOT/dashboard/static/vendor/` in the monorepo. See that directory's README for the
full provenance notes and the upgrade recipes (including why `number-flow` has to be
bundled with esbuild before a browser can load it).

This tree ships to Render as a **public** site, so the original CDN argument — "the
VPS has no route to a CDN" — does not apply here. Two reasons it is vendored anyway:

1. `@number-flow/vanilla@0.5.4`, the package the old `polish_pack.js` requested, has
   **never existed on npm**. It 404'd on Render exactly as it did on the VPS, so the
   animated numbers on the public site had never once worked. A reachable CDN does
   not help you fetch a package that was never published.
2. These files are copied from `BOT/dashboard`, and a copy that drifts back to a CDN
   URL is a copy that silently stops matching the source it was taken from. The
   tripwire (`BOT/dashboard/tests/test_no_cdn_refs_tripwire.py`) now scans this tree
   too, so the two stay in step.

| File | Source | Version | SHA-256 | Why |
|---|---|---|---|---|
| number-flow.iife.min.js | npm `number-flow` (esbuild IIFE bundle) | 0.6.2 | `47b3c25b4f90313092cec9873d4fdcce25653734705a8ff13d9217609db1c20d` | odometer number transitions for `[data-mm-flow]` (polish_pack.js) |
| countUp.umd.js | npm `countup.js` | 2.8.0 | `a0923aef347fa5019045cd91db18bfe79b9de10c588d285b35ed50be3d4b4dbc` | `[data-countup]` count-up (sage_premium.js) |
| toastify/toastify.js | npm `toastify-js` | 1.12.0 | `42dd6d2bfdd7153d1a702b2b45e468b7c85eec7426bb1e72938397d9a5db396e` | `MM.toast()` notifications (polish_pack.js) |
| toastify/toastify.css | npm `toastify-js` | 1.12.0 | `dd168487b6e8ca4141ec79f407deace9c18ee7dcbd50a06f968fb009e3c89fec` | toast styles |
| confetti.browser.js | npm `canvas-confetti` | 1.9.3 | `e103ab02784339d56c93ca3debe2c5a299372cafc5215148d55283de046e86d1` | `MM.celebrate()` (polish_pack.js) |

## fonts/

Self-hosted Bricolage Grotesque + Anuphan + Inter + JetBrains Mono (woff2 + the
rewritten `css2` stylesheets). Vendored alongside the dashboard's copy so both trees
render in the same faces whether or not the host they run on can reach Google, and so
the tripwire has one rule to enforce instead of two. Files are
`<family>-<hash10>.woff2`, hashed from the gstatic URL — an upgraded face gets a new
filename rather than silently replacing a cached one.

## Upgrading

Do not upgrade a file here on its own. Upgrade it in
`BOT/dashboard/static/vendor/`, then re-copy so the SHA-256 in both tables stays the
same value. A version that exists only in this tree is a version nobody will
remember to patch.
