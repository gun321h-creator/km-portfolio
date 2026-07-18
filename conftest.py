"""Put this app dir on sys.path so `import portfolio_app` / `import portfolio`
resolve when pytest runs from the monorepo root. On Render the app dir IS the
repo root (cwd), so no path hack is needed there."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
