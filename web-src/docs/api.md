# Captain of Industry web API — field notes

There are no official docs. This is what can be discovered from the running game (default
`http://127.0.0.1:3073`, started with the console command `web_api_start`), from `GET /routes`, and from the
game's own example page `GET /demo-dashboard` (view its source, it uses every route).

Typed client: `src/logic/api/client.ts`, types: `src/logic/api/types.ts`.

## Transport

- Binds to **127.0.0.1 only**, so other machines can't reach it without a proxy.
- JSON, `Cache-Control: no-store`, `Connection: close`. Responses take ~35 ms.
- `web_api_start isPersistent:true` (or `web_api_start 3073 true`) makes the server start by itself in every game
  on this machine, a global setting not stored in the save, until `web_api_stop`. It starts when a game loads, not
  in the main menu.
- **No CORS**: `server-info.otherOrigins` is `none` by default (`get` / `getAndPost` are possible via
  `web_api_start`), and `OPTIONS` returns 405. The app is served same-origin instead (the Vite proxy in dev,
  the game itself in the mod build). The server does not check the `Origin` header. To allow other origins,
  restart the server from the game console: `web_api_stop`, then `web_api_start allowOtherOrigins:true`
  (GET only) or `allowOtherOriginsPost:true` (GET + POST); prefix `port:N ` for a non-default port. The policy
  only changes on a restart, so re-read `server-info` after the server stops answering.
- Errors: `{ "error": "<code>", "message": "...", "parameter"?: "..." }` with 4xx. Codes seen:
  `invalidParameter` (400, message lists allowed values), `unknownRoute` (404), `methodNotAllowed` (405).
  Unknown query parameters are errors too. Unknown product ids are **not** errors; they show up in
  `unknownIds`.
- Errors raised **before the path is parsed are `text/plain`**, not JSON (e.g. a POST without a JSON
  `Content-Type` gets `415 POST requests must have Content-Type: application/json or application/octet-stream.`).
  Check `Content-Type` before parsing.
- Mods can register extra routes; `/routes` lists them.
- **Host check:** the game answers `403 {"error":"forbidden","message":"Host must be 127.0.0.1:3073 or localhost:3073."}`
  to any other `Host` header (DNS-rebinding protection). A proxy must forward the upstream host. Vite's
  `changeOrigin` does this; in nginx, keep the default `$proxy_host` and don't set `Host $host`.
- Every `/api/v1` response includes `date` (`"Y-M-D"`) and `tick`.

## Game calendar

30 days per month, 12 months per year. Dates are `"Y-M-D"` strings with 1-based month and day (e.g. `6-5-7`).

## Routes

| Route | Notes |
|---|---|
| `GET /api/v1/game-info` | `date, tick, isPaused, speed, gameId, sessionId`. `gameId` is stable for a playthrough; `sessionId` changes on every start/load. |
| `GET /api/v1/server-info` | `port, otherOrigins` (`none` \| `get` \| `getAndPost`). |
| `GET /api/v1/products` | Catalog `{id, name, kind, isUnlocked}`. Default: unlocked, sorted by name. `ids=a,b` (keeps order), `pinned=true`, `includeLocked=true`. Kinds seen: `countable, loose, fluid, molten, virtual`. |
| `GET /api/v1/products/stats` | Per product, one key per requested `series`. Levels (`quantity, stored, storageCapacity`) are numbers; flows are `[thisMonth, lastMonth, thisYear, lastYear, lifetime]`. Default series `quantity,stored,storageCapacity,produced,consumed`. |
| `GET /api/v1/products/history` | `resolution` = `day` \| `month` (default) \| `year` \| `quarterCentury`, `count` finished periods (default 12), `start` = first day of the oldest period. Arrays are oldest first **plus the period in progress** (length `count + 1`). Default series `produced,consumed`; for `day` only `quantity,stored` exist; `storageCapacity` has no history at any resolution (400). Omitting `ids` returns all unlocked products. |
| `GET /api/v1/products/sources` | Per product `{produced, consumed}`, each `{total, rows}`. Rows `{type, quantity}` sorted by quantity; `type: recipe` adds `recipe, machine`, `type: entity` adds `entity`; other types: `import, fuel, export, construction, unknown` (removed mods). `names` maps the ids to display names. `period` = `thisMonth` \| `lastMonth` (default) \| `thisYear` \| `lastYear` \| `lifetime`. |
| `GET /api/v1/icons/{id}` | PNG rendered by the game, `Cache-Control: immutable`. Add `?v=<sessionId>` as cache buster. Works for product ids and for the machine/entity ids in `sources` rows (e.g. `CharcoalMaker`, `FarmT1`); recipe ids give 404. |
| `GET /screenshot` | JPG of the current camera; `width`/`height` up to 4096, 0 = window size. The image is **stretched** to the requested size, and a missing height means the full window height, so pass both at the window's aspect ratio (learn it from one `0×0` frame). ~250 KB at 640 px wide. |
| `GET /commands` | ~240 input commands `{type, namespace, result, constructors[{params[{name,type,json,default,description}]}]}`, `filter=` substring. |
| `POST /command` | Body `{ "type": "...", "args": {...} }`. Answers once the simulation has processed it: `{ok, result, error, processedAtStep}`. E.g. `SetSimPauseStateCmd {isPaused}`, `GameSpeedChangeCmd {newSpeedMultiplier}`, `PinToggleCmd {productToToggle}`, `PinnedProductReorderCmd {productToMove, newIndex}` (`newIndex` = final 0-based position; values past the end clamp to last, verified), `GameConsoleCmd {command}` (any console command; only success is reported, not the console's text output). **This controls the game.** Most other commands need entity ids the read API doesn't expose. |
| `GET /routes` | Route list `{method, path, description, params[{name, type, from: path\|query, default?, values?, description?}]}`. |
| `GET /demo-dashboard` | Reference HTML client (single page, vanilla JS + canvas). Sections: speed buttons, other-origins policy, game info, catalog with locked toggle, pinned table, history chart, sources bars, error examples, routes table. |

Series for stats/history: `quantity, stored, storageCapacity, produced, producedByBuildings,
producedByMining, producedByRecycling, producedByResearch, producedBySettlements, producedByImport,
producedByDeconstruction, consumed, consumedByConstruction, consumedByMaintenance, consumedBySettlements,
consumedByResearch, consumedByFarms, consumedByExport, consumedAsFuel, dumped`.

## Refresh strategy (taken from the demo dashboard)

Poll `game-info` every ~2 s. While running, the same `tick` means the same data, so re-fetch the heavier
routes only when `tick` changes, **or** while paused (input commands can still change state). A new
`sessionId` means a different save was loaded: drop all caches. Implemented in
`src/logic/GameStore.svelte.ts` (one loop, per-slice cadence keys).

Finer points from the demo: the catalog only needs refetching once per game month (unlocks); `sources` for
`lastMonth`/`lastYear` only changes when the month changes; in-progress periods and history change daily.
`game-info.speed` is the speed the game *will* run at while `isPaused` is true.

## Data quirks

- `quantity` is everything in the economy (storages plus buffers in machines and vehicles); `stored` is in
  storages only. `storageCapacity` often equals `stored`: storages assigned to a product that are full.
- `stored` can exceed `storageCapacity`: global buffers can hold more than the storages (clamp bars to 100%).
- `sources` rows can add up to **more or less than `total`**: some amounts are recorded without a source, and
  some rows count amounts that are not part of the total.
- `sources` rows are per entity **type** (`FarmT1`), never per building. No route lists buildings or
  vehicles, so per-building numbers (e.g. water per farm) are impossible.
- **Missing building breakdowns:**
  - fuel use: `sources` fuel rows name no building;
  - deconstruction yield: no rows (e.g. iron scrap);
  - loose dumping by trucks (dirt, rock, slag, waste): no consumer rows.

  Liquid dumps and smoke stacks do show up as recipes.
- `quarterCentury` history starts at `1-1-1`; an early game returns fewer points than `count`.
- Stats carry no names or order. The pinned order (player-defined) comes from `products?pinned=true`.
- Not every proto has an icon; hide the `<img>` on error.
- Virtual products (`Product_Virtual_PollutedAir`, `…PollutedWater`) are pollution; only `produced` is useful.
  `Product_Chicken` (farm animals) is tagged virtual too. Electricity, computing and Unity are not in the
  product list at all.
- Payload sizes for all unlocked products (~30 in a mid game): catalog 3 KB, stats with all 20 series 17 KB,
  month history 3 KB, sources 5 KB. All answer in < 10 ms.

- **Settlements:** no population, health or Unity data (the ControlRoom mod adds `/api/mods/control-room/population`
  and `/unity`; electricity and computing come from its `/electricity` and `/computing`, see the repo README). Settlement modules appear as `Settlement*` entities in
  `sources` (`SettlementFoodModule` "Food market", `SettlementLandfillModule` "Waste collection"), and settlement flows
  appear in the `consumedBySettlements` / `producedBySettlements` series.
- No product categories. Settlements eat at `SettlementFoodModule` ("Food market") rows in `sources` and in the
  `consumedBySettlements` series; farm inputs show up in `consumedByFarms`. Farms (`FarmT1`, …) appear as
  **producers of water**: that's rain collected into their tank, which they then consume, so farm water
  "produced" and "consumed" largely cancel out. Crops show up as products produced by farm entities.

## Heuristics used by the app

The API has no alerts (the game shows its own in-game notifications); the app shows none either. See TODO.md.

- **Food & farms** (`src/lib/food.ts`): a curated list of the game's food, crop and fertilizer ids, plus anything
  the data reveals (eaten at a food market, grown by a farm, consumed by farms), limited to unlocked products.
