// Renders assets/thumbnail.svg to thumbnail.png and thumbnail.jpg (512x512) with headless Chrome, so the title
// font (Lilita One, from Google Fonts) is drawn exactly as in a browser. Usage: node assets/render.mjs
// Needs google-chrome-stable (or set CHROME=/path/to/chrome).
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const chromeBin = process.env.CHROME ?? 'google-chrome-stable'
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'control-room-render-'))
const port = 9400 + Math.floor(Math.random() * 400)
const chrome = spawn(chromeBin, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  let ws
  for (let i = 0; i < 50 && !ws; i++) {
    await sleep(200)
    try {
      const page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page')
      if (page) ws = new WebSocket(page.webSocketDebuggerUrl)
    } catch {}
  }
  await new Promise((r) => ws.addEventListener('open', r))
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) (pending.get(m.id)(m), pending.delete(m.id))
  })
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })

  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 512, height: 512, deviceScaleFactor: 1, mobile: false })
  // An HTML page around the SVG, so document.fonts can tell when the title font has loaded.
  const svg = fs.readFileSync(path.join(dir, 'thumbnail.svg'), 'utf8')
  const html = `<!doctype html><html><head><style>html,body{margin:0;background:#000}svg{display:block}</style></head><body>${svg}</body></html>`
  await send('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from(html).toString('base64') })
  await sleep(500)
  await send('Runtime.evaluate', { expression: "document.fonts.load('74px \"Lilita One\"').then(() => document.fonts.ready)", awaitPromise: true })
  await sleep(300)
  for (const [format, ext] of [['png', 'png'], ['jpeg', 'jpg']]) {
    const shot = await send('Page.captureScreenshot', { format, quality: format === 'jpeg' ? 92 : undefined, clip: { x: 0, y: 0, width: 512, height: 512, scale: 1 } })
    fs.writeFileSync(path.join(dir, `thumbnail.${ext}`), Buffer.from(shot.result.data, 'base64'))
    console.log(`assets/thumbnail.${ext}`)
  }
  ws.close()
} finally {
  chrome.kill()
  fs.rmSync(profile, { recursive: true, force: true })
}
