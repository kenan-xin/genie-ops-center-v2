import { useState } from 'react'
import data from '@/../product/sections/solutions/data.json'
import type { ApprovedFont, ChatTheme, Solution } from '@/../product/sections/solutions/types'
import { ChatThemes } from './components/ChatThemes'

export default function ChatThemesPreview() {
  const [themes, setThemes] = useState(data.chatThemes as ChatTheme[])
  const params = new URLSearchParams(window.location.search)
  const initial = params.get('theme')
  return (
    <ChatThemes
      chatThemes={themes}
      approvedFonts={data.approvedFonts as ApprovedFont[]}
      solutions={data.solutions as Solution[]}
      initialThemeId={initial ?? undefined}
      onCreateTheme={(input) => setThemes((l) => [...l, { id: `theme_${Date.now()}`, isDefault: false, ...input }])}
      onUpdateTheme={(id, input) => setThemes((l) => l.map((t) => (t.id === id ? { ...t, ...input } : t)))}
      onDeleteTheme={(id) => setThemes((l) => l.filter((t) => t.id !== id))}
    />
  )
}
