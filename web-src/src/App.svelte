<script lang="ts">
  import TopBar from '@/components/TopBar/TopBar.svelte'
  import OfflineBanner from '@/components/OfflineBanner/OfflineBanner.svelte'
  import ShortcutHelp from '@/components/ShortcutHelp/ShortcutHelp.svelte'
  import CommandPalette from '@/components/CommandPalette/CommandPalette.svelte'
  import { gameSpeed } from '@/logic/gameSpeed.svelte'
  import { formatGameDate, parseGameDate } from '@/logic/api/gameDate'
  import { GameClock } from '@/lib/live/clock.svelte'
  import { setClock, setGameData } from '@/lib/live/context'
  import { GameData } from '@/lib/live/gameData.svelte'
  import { href, router } from '@/lib/router.svelte'
  import Overview from '@/pages/Overview.svelte'
  import Products from '@/pages/Products.svelte'
  import ProductDetail from '@/pages/ProductDetail/ProductDetail.svelte'
  import Console from '@/pages/Console/Console.svelte'
  import Settlements from '@/pages/Settlements/Settlements.svelte'
  import Unity from '@/pages/Unity/Unity.svelte'
  import Grid from '@/pages/Grid/Grid.svelte'
  import Food from '@/pages/Food.svelte'
  import Factory from '@/pages/Factory/Factory.svelte'
  import Compare from '@/pages/Compare/Compare.svelte'

  const clock = setClock(new GameClock(2000))
  setGameData(new GameData(clock))

  let topBar: TopBar
  let helpOpen = $state(false)
  let paletteOpen = $state(false)

  $effect(() => {
    clock.start()
    return () => clock.stop()
  })

  // Measures game days per real second for the "about 40 min at 3×" estimates.
  $effect(() => gameSpeed.feed(clock.info, clock.connected))

  $effect(() => {
    const info = clock.info
    document.title = info
      ? `${info.isPaused ? '❚❚' : '▶'} ${formatGameDate(parseGameDate(info.date))} · Control Room`
      : 'Control Room'
  })

  function isTyping(target: EventTarget | null) {
    const el = target as HTMLElement | null
    return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
  }

  function onKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      helpOpen = false
      paletteOpen = !paletteOpen
      return
    }
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || helpOpen || paletteOpen) return
    switch (e.key) {
      case ' ':
        e.preventDefault()
        topBar.togglePause()
        break
      case '1':
      case '2':
      case '3':
      case '4':
        topBar.setSpeedByKey(Number(e.key))
        break
      case '/':
        e.preventDefault()
        router.go(href.products)
        // The products view may not be mounted yet.
        setTimeout(() => document.getElementById('product-search')?.focus(), 30)
        break
      case 'o':
        router.go(href.overview)
        break
      case 'p':
        router.go(href.products)
        break
      case 'f':
        router.go(href.food)
        break
      case 'm':
        router.go(href.factory())
        break
      case 's':
        router.go(href.settlements)
        break
      case 'u':
        router.go(href.unity)
        break
      case 'e':
        router.go(href.electricity)
        break
      case 'k':
        router.go(href.computing)
        break
      case 'c':
        router.go(href.console)
        break
      case '?':
        helpOpen = true
        break
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<TopBar bind:this={topBar} onHelp={() => (helpOpen = true)} />
<OfflineBanner />

<main class="mx-auto w-full max-w-[110rem] px-4 pt-5 pb-12 sm:px-6">
  {#if router.route.name === 'overview'}
    <Overview />
  {:else if router.route.name === 'products'}
    <Products />
  {:else if router.route.name === 'product'}
    {#key router.route.id}
      <ProductDetail id={router.route.id} />
    {/key}
  {:else if router.route.name === 'food'}
    <Food />
  {:else if router.route.name === 'factory'}
    <Factory tab={router.route.tab} />
  {:else if router.route.name === 'compare'}
    <Compare ids={router.route.ids} />
  {:else if router.route.name === 'settlements'}
    <Settlements />
  {:else if router.route.name === 'unity'}
    <Unity />
  {:else if router.route.name === 'electricity'}
    <Grid kind="electricity" />
  {:else if router.route.name === 'computing'}
    <Grid kind="computing" />
  {:else if router.route.name === 'console'}
    <Console />
  {:else}
    <div class="flex flex-col items-start gap-2 py-12">
      <h1 class="text-xl font-semibold tracking-tight font-stretch-75%">Page not found</h1>
      <p class="text-sm text-ink-2">
        There is no page at <code class="font-mono text-xs text-ink">{router.route.path}</code>.
      </p>
      <a class="text-sm underline underline-offset-2 hover:text-ink" href={href.overview}>Go to the overview</a>
    </div>
  {/if}
</main>

<ShortcutHelp bind:open={helpOpen} onPalette={() => ((helpOpen = false), (paletteOpen = true))} />
<CommandPalette
  bind:open={paletteOpen}
  togglePause={() => topBar.togglePause()}
  setSpeed={(s) => topBar.setSpeed(s)}
  speeds={() => topBar?.getSpeeds() ?? [1, 2, 3]}
  send={(fn) => topBar.send(fn)}
/>
