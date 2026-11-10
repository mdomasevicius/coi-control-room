import { getContext, setContext } from 'svelte'
import type { GameClock } from '@/lib/live/clock.svelte'
import type { GameData } from '@/lib/live/gameData.svelte'

const CLOCK = Symbol('game-clock')
const DATA = Symbol('game-data')

export const setClock = (clock: GameClock) => setContext(CLOCK, clock)
export const setGameData = (data: GameData) => setContext(DATA, data)

function need<T>(key: symbol, what: string): T {
  const value = getContext<T | undefined>(key)
  if (!value) throw new Error(`${what} not provided by a parent component`)
  return value
}

export const getClock = () => need<GameClock>(CLOCK, 'GameClock')
export const getGameData = () => need<GameData>(DATA, 'GameData')
