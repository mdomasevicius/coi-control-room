import { getContext, setContext } from 'svelte'
import type { GameStore } from '@/logic/GameStore.svelte'

const KEY = Symbol('game-store')

export const setGameStore = (store: GameStore) => setContext(KEY, store)

export function getGameStore(): GameStore {
  const store = getContext<GameStore | undefined>(KEY)
  if (!store) throw new Error('GameStore not provided; call setGameStore() in a parent component')
  return store
}
