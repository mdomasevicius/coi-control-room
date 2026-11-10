# TODO

## Revisit alerts

The app used to derive its own alerts (products running out, storage full) from stats. That was dropped on
2026-11-08: the game has its own notifications, and invented alerts are misleading next to them (full storage,
for one, is routine in COI and produced an alarm flood).

Before bringing anything like it back:

- Check whether the web API exposes the game's own notifications (`/routes`, `/commands`, new API versions or
  mods). If it does, show those instead of inventing anything.
- If we derive anything ourselves, label it clearly as the app's own estimate, not a game alert. Keep it to
  conditions the player can act on.

## Population, health, Unity

The Settlements page shows everything the web API exposes about settlements: flows tagged consumed/produced by
settlements, and the settlement modules (`Settlement*` entities in `sources`). The API has no population count,
health, Unity or needs-satisfaction data (checked 2026-11-08: no route, and Unity is not a product). If a game update
or mod adds routes for them (`/routes`), add them to the Settlements page.

## Feature ideas (from the default API): done 2026-11-08

All eleven are built:
- **Factory tabs:** Machines, Production chain, Construction & upkeep, Waste & dumping, Mining & fuel.
- **Real-time estimates:** "about N min at 3×" next to "lasts".
- **Products page:** locked products ("N of 215 unlocked").
- **Comparison:** compare products (#/compare).
- **Ctrl+K:** command palette.
- **CSV export:** on charts and tables.
- **Camera:** timelapse.

Not worth it yet: the recycling, research, import and export series are empty in this save; revisit when used.
