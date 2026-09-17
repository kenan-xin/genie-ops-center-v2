import data from '@/../product/sections/solutions/data.json'
import type { AccessGrant, PersonSummary, Solution } from '@/../product/sections/solutions/types'
import { AccessOverview } from './components/AccessOverview'

export default function AccessOverviewPreview() {
  const p = new URLSearchParams(window.location.search)
  const initial = p.get('solution') ? { kind: 'solution' as const, id: p.get('solution')! } : p.get('person') ? { kind: 'person' as const, id: p.get('person')! } : null
  const empty = p.get('empty') === '1'
  return <AccessOverview solutions={data.solutions as Solution[]} people={data.people as PersonSummary[]} accessGrants={empty ? [] : (data.accessGrants as AccessGrant[])} initial={initial} onAddAccess={(t) => console.log('Add access for', t)} />
}
