// Minimal hash router: #/, #/products, #/product/<id>, #/factory/<tab>, #/compare/<id,id>, #/console, …
// Hash routing needs no server config and keeps links shareable.

export type Route =
  | { name: 'overview' }
  | { name: 'products' }
  | { name: 'product'; id: string }
  | { name: 'food' }
  | { name: 'settlements' }
  | { name: 'unity' }
  | { name: 'electricity' }
  | { name: 'computing' }
  | { name: 'factory'; tab: FactoryTab }
  | { name: 'compare'; ids: string[] }
  | { name: 'console' }
  | { name: 'notFound'; path: string }

export const FACTORY_TABS = ['machines', 'chain', 'upkeep', 'waste', 'mining'] as const
export type FactoryTab = (typeof FACTORY_TABS)[number]

function parse(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/'
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return { name: 'overview' }
  if (parts[0] === 'products' && parts.length === 1) return { name: 'products' }
  if (parts[0] === 'product' && parts.length === 2) return { name: 'product', id: decodeURIComponent(parts[1]) }
  if (parts[0] === 'food' && parts.length === 1) return { name: 'food' }
  if (parts[0] === 'settlements' && parts.length === 1) return { name: 'settlements' }
  if (parts[0] === 'unity' && parts.length === 1) return { name: 'unity' }
  // #/power was the combined page; it now opens Electricity.
  if ((parts[0] === 'electricity' || parts[0] === 'power') && parts.length === 1) return { name: 'electricity' }
  if (parts[0] === 'computing' && parts.length === 1) return { name: 'computing' }
  if (parts[0] === 'console' && parts.length === 1) return { name: 'console' }
  if (parts[0] === 'factory' && parts.length <= 2) {
    const tab = (parts[1] ?? 'machines') as FactoryTab
    if (FACTORY_TABS.includes(tab)) return { name: 'factory', tab }
  }
  if (parts[0] === 'compare' && parts.length <= 2)
    return { name: 'compare', ids: (parts[1] ? decodeURIComponent(parts[1]).split(',') : []).filter(Boolean) }
  return { name: 'notFound', path }
}

class Router {
  route = $state<Route>(parse(location.hash))

  constructor() {
    addEventListener('hashchange', () => {
      this.route = parse(location.hash)
      scrollTo({ top: 0 })
    })
  }

  go(href: string) {
    location.hash = href.replace(/^#/, '')
  }
}

export const router = new Router()

export const href = {
  overview: '#/',
  products: '#/products',
  product: (id: string) => `#/product/${encodeURIComponent(id)}`,
  food: '#/food',
  settlements: '#/settlements',
  unity: '#/unity',
  electricity: '#/electricity',
  computing: '#/computing',
  factory: (tab: FactoryTab = 'machines') => `#/factory/${tab}`,
  compare: (ids: string[] = []) => (ids.length ? `#/compare/${encodeURIComponent(ids.join(','))}` : '#/compare'),
  console: '#/console',
}
