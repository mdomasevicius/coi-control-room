# Art

- `thumbnail.svg`: the mod's thumbnail for the mod portal, 512×512 like the other mods there. `thumbnail.png` and
  `thumbnail.jpg` are rendered from it with `node assets/render.mjs` (headless Chrome, so the Lilita One title
  font from Google Fonts renders as in a browser). The game's `manifest.json` has no thumbnail field; the
  thumbnail is uploaded with the mod on the portal.
- `web-src/public/favicon.svg`: the dashboard's favicon, the thumbnail's monitor cut down to what reads at 16 px.
