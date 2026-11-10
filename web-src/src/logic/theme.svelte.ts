import { load, save } from '@/lib/storage'

export type ThemePreference = 'auto' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

/** Also read by the inline script in index.html (keep the key and JSON format in sync). */
export const THEME_KEY = 'control-room:theme'

const PREFERENCES: readonly ThemePreference[] = ['auto', 'light', 'dark']

/**
 * Light / dark / auto (follows the OS, the default). The preference persists in localStorage; the resolved theme
 * is written to `<html data-theme>`, which the CSS tokens switch on.
 */
class Theme {
  preference = $state<ThemePreference>('auto')
  system = $state<ResolvedTheme>('light')
  readonly resolved: ResolvedTheme = $derived(this.preference === 'auto' ? this.system : this.preference)

  constructor() {
    const stored = load<unknown>(THEME_KEY, 'auto')
    this.preference = PREFERENCES.includes(stored as ThemePreference) ? (stored as ThemePreference) : 'auto'

    const mq = matchMedia('(prefers-color-scheme: dark)')
    this.system = mq.matches ? 'dark' : 'light'
    mq.addEventListener('change', (e) => {
      this.system = e.matches ? 'dark' : 'light'
      this.#apply()
    })
    this.#apply()
  }

  set(preference: ThemePreference) {
    this.preference = preference
    save(THEME_KEY, preference)
    this.#apply()
  }

  // Written synchronously (not in an effect) so anything reacting to `resolved`, like charts reading CSS
  // variables, already sees the new tokens.
  #apply() {
    document.documentElement.dataset.theme = this.resolved
  }
}

export const theme = new Theme()
