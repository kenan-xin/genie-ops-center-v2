import { useState } from 'react'
import data from '@/../product/sections/audit-and-tenant-settings/data.json'
import type { Category, CompiledModule } from '@/../product/sections/audit-and-tenant-settings/types'
import { CategoriesPage } from './components/CategoriesPage'

// ?confirm=<categoryId> opens the delete confirm for that category.
export default function CategoriesPagePreview() {
  const params = new URLSearchParams(window.location.search)
  const [cats, setCats] = useState(data.categories as Category[])
  const [ungrouped, setUngrouped] = useState(data.ungroupedSolutionCount)
  const [modules, setModules] = useState(data.modules as CompiledModule[])
  return (
    <CategoriesPage
      categories={cats}
      modules={modules}
      ungroupedSolutionCount={ungrouped}
      initialConfirmId={params.get('confirm') ?? undefined}
      onCreateCategory={(name) => setCats((l) => [...l, { id: `cat_${Date.now()}`, name, position: l.length + 1, solutionCount: 0, moduleCount: 0 }])}
      onRenameCategory={(id, name) => setCats((l) => l.map((c) => (c.id === id ? { ...c, name } : c)))}
      onReorderCategories={(ids) => setCats((l) => l.map((c) => ({ ...c, position: ids.indexOf(c.id) + 1 })))}
      onDeleteCategory={(id) => {
        const gone = cats.find((c) => c.id === id)
        setUngrouped((v) => v + (gone?.solutionCount ?? 0))
        setModules((l) => l.map((m) => (m.categoryId === id ? { ...m, categoryId: null } : m)))
        setCats((l) => l.filter((c) => c.id !== id))
      }}
    />
  )
}
