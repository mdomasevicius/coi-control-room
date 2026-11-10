# Control Room

A fast, auto-refreshing stats dashboard for **Captain of Industry**, built on the game's built-in web API.

- **Overview**: pollution, pinned products with trends.
- **Settlements**: what settlements use (stock, months it lasts) and give back (waste, storage), their modules, monthly charts.
- **Products**: every unlocked product, searchable, filterable by kind, sortable, pin/unpin in game.
- **Product detail**: history charts (days to 25-year periods), where it comes from and goes to (by machine and
  recipe), all 17 flow categories.
- **Unity** (needs the ControlRoom mod): Unity on hand vs cap, net per month, generated and spent per category with
  monthly or yearly charts, this month's itemized ledger with unmet needs.
- **Food & farms**: food produced vs eaten by settlements, stock and how long it lasts, share of diet, farm
  water (incl. rain collected by farms) and fertilizer use, harvests per crop and farm.
- **Console**: run game console commands, browse and send any input command, live camera screenshot.
- Updates live every 2 s while the game runs; pause and speed controls in the header.

Svelte 5 + Vite + TypeScript + uPlot, compiled to a static SPA (~58 KB gzipped). The ControlRoom mod (the repo root)
embeds the build and serves it from the game's own web API server at `/control-room`, so it shares the API's origin
(the API has no CORS). See [docs/api.md](docs/api.md) for what's known about the API.

## Prerequisites

In the game, start the web API from the console: `web_api_start` (it listens on `127.0.0.1:3073`).
Check it with `curl http://127.0.0.1:3073/api/v1/game-info`.

## Build for the mod

From the repo root, `make install` runs `vite build --base=/control-room/` into `../web/` and builds the mod around
it. See the root README.

## Develop

```sh
pnpm install
pnpm dev        # http://localhost:5173, proxies the API to GAME_API_URL (default http://localhost:3073)
pnpm dev:safe   # the same, read-only and reachable from your network (see below)
pnpm check      # svelte-check + tsc
pnpm build      # -> dist/ (served at /; the mod build uses base /control-room/)
```

### Read-only (sharing with others)

`pnpm dev:safe` starts the dev server with `VITE_READ_ONLY=true` and `--host`, so other machines can open it
but nobody can change the game:

- The server answers only GET and HEAD and refuses `/command` (403), so pause, speed, pins, reordering and
  console commands can't get through, not even with curl.
- The app hides those controls: speed shows as text, stars are display-only, the Console page is just the
  live camera.

It's still a dev server (hot reload, source files served), so keep it on a network you trust. The firewall
may need port 5173 open for other machines to reach it.

## Keyboard shortcuts

`Space` pause/resume · `1` `2` `3` speed (1×, 2×, 3×), `4` the game's faster speed when it offers one · `/` search products · `o` overview · `p` products · `f` food & farms · `u` unity · `c` console ·
`?` help

## Layout

```
src/
  App.svelte                 shell: header, routing, shortcuts; owns GameClock + GameData
  pages/                     Overview, Products, ProductDetail/ and Console/ (page + its parts), Food
  components/<Name>/         one folder per component: TopBar, ProductTable, Chart, Sparkline, …
  logic/api/                 typed client, types, game-calendar helpers
  logic/GameStore.svelte.ts  single poller holding all game data in memory (Slice per endpoint)
  lib/live/                  old per-view polling (GameClock, LiveResource, GameData), being replaced
  lib/analysis.ts            net, months of stock left
  lib/food.ts                food / crop / farm-input classification
  lib/router.svelte.ts       hash router
```

Imports use `@/` for `src/`.

The app sends `POST /command`, so it can control the game: pause/speed, pins, console commands (cheats
included) and any input command. `pnpm dev` passes these through its proxy, so anyone who can reach port 5173 can do
the same; use `pnpm dev:safe` when sharing.
