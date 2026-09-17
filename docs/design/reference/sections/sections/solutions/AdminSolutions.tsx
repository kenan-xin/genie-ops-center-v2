import { useState } from 'react'
import data from '@/../product/sections/solutions/data.json'
import type { AccessGrant, Category, ChatTheme, Solution } from '@/../product/sections/solutions/types'
import { AdminSolutions } from './components/AdminSolutions'
import { initials } from './components/helpers'

export default function AdminSolutionsPreview() {
  const [solutions, setSolutions] = useState(data.solutions as Solution[])
  const [grants, setGrants] = useState(data.accessGrants as AccessGrant[])
  const params = new URLSearchParams(window.location.search)
  const openFirst = params.get('open')
  // ?dialog=register|delete opens a dialog for the screenshot; ?tab=<id> picks the configure tab.
  const dialog = params.get('dialog')
  // ?chatoff=1 previews a deployment with GENIE_CHAT_API_ALLOWED_ORIGINS empty (DEC-30).
  const chatEnabled = params.get('chatoff') !== '1'

  return (
    <AdminSolutions
      solutions={solutions}
      categories={data.categories as Category[]}
      chatThemes={data.chatThemes as ChatTheme[]}
      chatEnabled={chatEnabled}
      accessGrants={grants}
      initialSolutionId={openFirst}
      initialTab={params.get('tab')}
      initialDialog={dialog === 'register' || dialog === 'delete' ? dialog : undefined}
      canAdminister
      onRegisterSolution={(input) => setSolutions((l) => [{ id: `sol_${Date.now()}`, slug: input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), monogram: initials(input.name), accentColor: '#2563eb', status: 'draft', statusReason: null, chatThemeId: null, welcomeText: '', starterPrompts: [], externalBotId: '', apiEndpoint: '', feedbackEnabled: false, iframeUrl: input.type === 'embedded' ? '' : undefined, allowFullscreen: false, archived: false, updatedAt: new Date().toISOString(), ...input }, ...l])}
      onDuplicateSolution={(id) => setSolutions((l) => { const s = l.find((x) => x.id === id); return s ? [{ ...s, id: `sol_${Date.now()}`, slug: `${s.slug}-copy`, name: `${s.name} (copy)`, status: 'draft', statusReason: null, archived: false, updatedAt: new Date().toISOString() }, ...l] : l })}
      onDeleteSolution={(id) => setSolutions((l) => l.filter((s) => s.id !== id))}
      onUpdateSolution={(id, input) => { console.log('Update:', id, input); setSolutions((l) => l.map((s) => (s.id === id ? { ...s, ...input, updatedAt: new Date().toISOString() } : s))) }}
      onSetSolutionStatus={(id, status, reason) => setSolutions((l) => l.map((s) => (s.id === id ? { ...s, status, statusReason: reason, updatedAt: new Date().toISOString() } : s)))}
      onArchiveSolution={(id, archived) => setSolutions((l) => l.map((s) => (s.id === id ? { ...s, archived } : s)))}
      onAddAccess={(id) => console.log('Add access for', id)}
      onRemoveAccess={(gid) => setGrants((l) => l.filter((g) => g.id !== gid))}
      onPreview={(id) => console.log('Preview as member:', id)}
    />
  )
}
