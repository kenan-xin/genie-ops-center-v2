import { goTo } from '@/shell/components/routes'
import { useState } from 'react'
import data from '@/../product/sections/solutions/data.json'
import type { Category, Favorite, Solution, Viewer } from '@/../product/sections/solutions/types'
import { FavoritesPage } from './components/FavoritesPage'

export default function FavoritesPagePreview() {
  // ?empty=1 shows the no-favorites state.
  const empty = new URLSearchParams(window.location.search).get('empty') === '1'
  const [favorites, setFavorites] = useState<Favorite[]>(empty ? [] : (data.favorites as Favorite[]))
  return (
    <FavoritesPage
      viewer={data.viewer as Viewer}
      favorites={favorites}
      solutions={data.solutions as Solution[]}
      categories={data.categories as Category[]}
      onOpenSolution={(id) => goTo(`/s/${data.solutions.find((s) => s.id === id)?.slug ?? ''}`)}
      onToggleFavorite={(id) => setFavorites((f) => (f.some((x) => x.solutionId === id) ? f.filter((x) => x.solutionId !== id) : [...f, { solutionId: id, position: f.length + 1 }]))}
      onReorderFavorites={(ids) => setFavorites((f) => f.map((x) => ({ ...x, position: ids.indexOf(x.solutionId) + 1 })))}
    />
  )
}
