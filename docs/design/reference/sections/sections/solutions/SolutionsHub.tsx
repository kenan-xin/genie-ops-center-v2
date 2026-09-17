import { useState } from 'react'
import data from '@/../product/sections/solutions/data.json'
import type { Category, Favorite, Recent, Solution, Viewer } from '@/../product/sections/solutions/types'
import { SolutionsHub } from './components/SolutionsHub'

export default function SolutionsHubPreview() {
  const [favorites, setFavorites] = useState(data.favorites as Favorite[])
  const params = new URLSearchParams(window.location.search)
  const base = data.viewer as Viewer
  const allReady = params.get('allready') === '1'
  // ?admin=1 previews the hub as the administrator (Draft badges); ?filter=<term> seeds the search for the filter empty state.
  const viewer: Viewer = params.get('admin') === '1' ? { ...base, id: 'usr_priya', name: 'Priya Nair', permissions: [...base.permissions, 'solutions:admin'], grantedSolutionIds: (data.solutions as Solution[]).map((s) => s.id) } : base
  const initialQuery = params.get('filter') ?? ''
  // ?none=1 previews a member with no granted solutions: the Solutions hub empty state.
  const none = params.get('none') === '1'
  const solutions = none ? [] : (data.solutions as Solution[]).map((s) => (allReady && s.status !== 'draft' ? { ...s, status: 'ready' as const, statusReason: null } : s))

  return (
    <SolutionsHub
      initialQuery={initialQuery}
      viewer={viewer}
      categories={data.categories as Category[]}
      solutions={solutions}
      favorites={favorites}
      recents={data.recents as Recent[]}
      support={{ companyName: 'Meridian Health', href: 'mailto:support@meridianhealth.example' }}
      onOpenSolution={(id) => console.log('Open solution:', id)}
      onToggleFavorite={(id) => setFavorites((f) => (f.some((x) => x.solutionId === id) ? f.filter((x) => x.solutionId !== id) : [...f, { solutionId: id, position: f.length + 1 }]))}
    />
  )
}
