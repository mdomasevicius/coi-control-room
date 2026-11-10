<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import SendHorizontal from '@lucide/svelte/icons/send-horizontal'
  import X from '@lucide/svelte/icons/x'
  import { api } from '@/logic/api/client'
  import type { CommandInfo } from '@/logic/api/types'
  import Button from '@/components/Button/Button.svelte'
  import { getClock } from '@/lib/live/context'
  import { load, save } from '@/lib/storage'
  import { consoleLog } from './consoleLog.svelte'

  /**
   * Raw input commands (the same ones the game UI sends). Most need entity ids the API doesn't expose, so this is an
   * advanced, collapsed-by-default section. Results land in the console transcript.
   */
  const clock = getClock()

  let open = $state(load('console.inputOpen', false))
  $effect(() => save('console.inputOpen', open))

  let commands = $state<CommandInfo[]>([])
  let commandsError = $state<string | null>(null)
  let filter = $state('')
  let selected = $state<CommandInfo | null>(null)
  let argsText = $state('{}')
  let argsError = $state<string | null>(null)

  // The command set depends on the loaded game (mods): load when opened, again per session.
  $effect(() => {
    if (!open || !clock.info?.sessionId) return
    api
      .commands()
      .then((c) => {
        commands = c.sort((a, b) => a.type.localeCompare(b.type))
        commandsError = null
      })
      .catch((e) => (commandsError = String(e)))
  })

  const filtered = $derived.by(() => {
    const q = filter.trim().toLowerCase()
    return q ? commands.filter((c) => c.type.toLowerCase().includes(q) || c.namespace.toLowerCase().includes(q)) : commands
  })

  const shortType = (type: string) => type.replace(/Cmd$/, '')
  const shortNamespace = (ns: string) => ns.replace(/^Mafi\.(Core\.)?/, '')

  function placeholder(json: string | undefined, type: string): unknown {
    const t = json ?? type
    if (t === 'int' || t === 'float' || t === 'Fix32' || t === 'Percent') return 0
    if (t === 'bool') return false
    if (t === 'string') return ''
    return null
  }

  function select(c: CommandInfo) {
    selected = c
    const params = c.constructors[0]?.params ?? []
    const template = Object.fromEntries(params.map((p) => [p.name, p.default ?? placeholder(p.json, p.type)]))
    argsText = JSON.stringify(template, null, 2)
    argsError = null
  }

  async function send() {
    if (!selected) return
    let args: Record<string, unknown>
    try {
      args = JSON.parse(argsText || '{}')
    } catch (e) {
      argsError = `Invalid JSON: ${(e as Error).message}`
      return
    }
    argsError = null
    await consoleLog.input(selected.type, args, clock.info?.date ?? '')
    clock.refresh()
  }
</script>

<section class="min-w-0 rounded-ui border border-line bg-surface">
  <button
    type="button"
    class="flex min-h-11 w-full cursor-pointer items-center gap-3 px-4 py-2 text-left transition-colors duration-100 hover:bg-surface-2 motion-reduce:transition-none"
    aria-expanded={open}
    aria-controls="input-commands"
    onclick={() => (open = !open)}
  >
    <ChevronDown size={18} class={['text-muted transition-transform duration-150 motion-reduce:transition-none', !open && '-rotate-90']} aria-hidden="true" />
    <span class="text-sm font-semibold">Input commands</span>
    <span class="text-sm text-muted max-sm:hidden">Advanced. Most need ids that only the game UI knows.</span>
  </button>

  {#if open}
    <div id="input-commands" class="grid border-t border-line md:grid-cols-[18rem_minmax(0,1fr)]">
      <div class="flex min-w-0 flex-col border-line max-md:border-b md:border-r">
        <div class="p-3">
          <input class="w-full" type="search" placeholder="Filter {commands.length} commands" bind:value={filter} aria-label="Filter commands" />
        </div>
        <ul class="max-h-72 overflow-y-auto px-1.5 pb-2 md:max-h-[26rem]" role="listbox" aria-label="Commands">
          {#each filtered as c (c.type)}
            <li>
              <button
                type="button"
                role="option"
                aria-selected={selected?.type === c.type}
                class={[
                  'group flex w-full cursor-pointer items-baseline gap-2 rounded-ui px-2.5 py-1.5 text-left text-sm text-ink transition-colors duration-100',
                  'hover:bg-surface-2 focus-visible:-outline-offset-2 motion-reduce:transition-none',
                  'aria-selected:bg-sel aria-selected:text-sel-ink',
                ]}
                onclick={() => select(c)}
              >
                <span class="min-w-0 flex-1 truncate">{shortType(c.type)}</span>
                <span class="max-w-[45%] truncate text-2xs text-muted group-aria-selected:text-sel-ink/70">{shortNamespace(c.namespace)}</span>
              </button>
            </li>
          {:else}
            <li class="px-3 py-2 text-sm text-muted">{commandsError ?? (commands.length ? 'No match.' : 'Loading…')}</li>
          {/each}
        </ul>
      </div>

      <div class="flex min-w-0 flex-col gap-4 p-4">
        {#if selected}
          {@const params = selected.constructors[0]?.params ?? []}
          <div class="flex flex-col gap-1">
            <h3 class="text-base font-semibold wrap-anywhere">{shortType(selected.type)}</h3>
            {#if selected.description}<p class="text-sm text-ink-2">{selected.description}</p>{/if}
          </div>
          {#if params.length}
            <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              {#each params as p (p.name)}
                <dt class="font-mono text-ink">{p.name}</dt>
                <dd class="text-ink-2">
                  <span class="font-mono text-xs text-muted">{p.json ?? p.type}{p.default !== undefined ? ` = ${JSON.stringify(p.default)}` : ''}</span>
                  {#if p.description}<span class="block text-xs">{p.description}</span>{/if}
                </dd>
              {/each}
            </dl>
          {/if}
          <div class="flex flex-col gap-1.5">
            <label class="text-sm text-ink-2" for="args">Arguments</label>
            <textarea
              class="field-sizing-content min-h-24 resize-y font-mono text-sm"
              id="args"
              spellcheck="false"
              aria-invalid={argsError ? 'true' : undefined}
              aria-describedby={argsError ? 'args-error' : undefined}
              bind:value={argsText}
            ></textarea>
            {#if argsError}
              <p id="args-error" class="flex items-center gap-1.5 text-sm text-ink-2">
                <X size={16} class="text-critical" aria-hidden="true" />{argsError}
              </p>
            {/if}
          </div>
          <Button class="self-start" disabled={consoleLog.busy} onclick={send}>
            <SendHorizontal size={15} aria-hidden="true" />Send command
          </Button>
        {:else}
          <p class="m-auto text-sm text-muted">Pick a command to see its arguments.</p>
        {/if}
      </div>
    </div>
  {/if}
</section>
