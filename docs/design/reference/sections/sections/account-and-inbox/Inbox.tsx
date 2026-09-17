import { useState } from 'react'
import data from '@/../product/sections/account-and-inbox/data.json'
import type { Notification } from '@/../product/sections/account-and-inbox/types'
import { Inbox } from './components/Inbox'

export default function InboxPreview() {
  const [items, setItems] = useState(data.notifications as Notification[])
  const params = new URLSearchParams(window.location.search)
  const [empty, setEmpty] = useState(params.get('empty') === '1')
  const now = new Date().toISOString()

  return (
    <>
      <Inbox
        notifications={empty ? [] : items}
        emptyState={data.emptyStates.inbox}
        hasMore={!empty}
        onOpenNotification={(id) => {
          console.log('Open notification:', id)
          setItems((l) => l.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? now } : n)))
        }}
        onMarkAllRead={() => setItems((l) => l.map((n) => ({ ...n, readAt: n.readAt ?? now })))}
        onLoadMoreNotifications={() => console.log('Load more')}
      />
      {/* Preview-only switcher. Not part of the exported component. Hidden with ?shot=1 for screenshots. */}
      <div hidden={params.get('shot') === '1'} className="fixed bottom-3 right-3 z-50 flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 font-mono text-xs uppercase tracking-[0.08em] text-gray-500 shadow-lg">
        <button type="button" onClick={() => setEmpty(false)} className={`rounded-lg px-2 py-1 ${!empty ? 'bg-gray-100 text-gray-900' : 'hover:text-gray-900'}`}>list</button>
        <button type="button" onClick={() => setEmpty(true)} className={`rounded-lg px-2 py-1 ${empty ? 'bg-gray-100 text-gray-900' : 'hover:text-gray-900'}`}>empty</button>
      </div>
    </>
  )
}
