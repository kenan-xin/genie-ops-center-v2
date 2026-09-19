import { Bell, CheckCheck, Inbox as InboxIcon, KeyRound, ShieldCheck, Sparkles, Wrench } from 'lucide-react'
import type { EmptyStateCopy, Notification } from '@/../product/sections/account-and-inbox/types'
import { Card } from './ui'
import { btnSecondary, focusRing, relativeTime } from './helpers'

export interface InboxProps {
  notifications: Notification[]
  emptyState: EmptyStateCopy
  /** True when more than the shown page exists. */
  hasMore?: boolean
  /** Open a notification: marks it read and follows its link. */
  onOpenNotification?: (notificationId: string) => void
  /** Mark every notification as read. */
  onMarkAllRead?: () => void
  /** Load the next page of notifications. */
  onLoadMoreNotifications?: () => void
}

function KindIcon({ kind }: { kind: string }) {
  const cls = 'size-4'
  if (kind.endsWith('access-granted')) return <KeyRound className={cls} strokeWidth={1.75} aria-hidden />
  if (kind.endsWith('status')) return <Wrench className={cls} strokeWidth={1.75} aria-hidden />
  if (kind.endsWith('session')) return <ShieldCheck className={cls} strokeWidth={1.75} aria-hidden />
  if (kind.endsWith('new-solution')) return <Sparkles className={cls} strokeWidth={1.75} aria-hidden />
  return <Bell className={cls} strokeWidth={1.75} aria-hidden />
}

export function Inbox({ notifications, emptyState, hasMore, onOpenNotification, onMarkAllRead, onLoadMoreNotifications }: InboxProps) {
  const unread = notifications.filter((n) => !n.readAt).length

  return (
    <div className="flex max-w-3xl flex-col gap-4 pb-8">
      <Card
        title="Notifications"
        description={unread > 0 ? `${unread} unread` : 'All caught up'}
        action={
          unread > 0 ? (
            <button type="button" className={btnSecondary} onClick={() => onMarkAllRead?.()}>
              <CheckCheck className="size-5 text-gray-500" strokeWidth={1.75} aria-hidden />
              Mark all as read
            </button>
          ) : null
        }
      >
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <InboxIcon className="size-6" strokeWidth={1.75} aria-hidden />
            </span>
            <h3 className="text-base font-semibold">{emptyState.heading}</h3>
            <p className="max-w-sm text-sm text-gray-600 dark:text-gray-400">{emptyState.body}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {notifications.map((n) => {
              const isUnread = !n.readAt
              return (
                <li key={n.id}>
                  <a
                    href={n.link}
                    role="link"
                    tabIndex={0}
                    onClick={(e) => {
                      if (!onOpenNotification) return
                      e.preventDefault()
                      onOpenNotification(n.id)
                    }}
                    onKeyDown={(e) => { if (e.key === ' ') { e.preventDefault(); e.currentTarget.click() } }}
                    className={`group flex gap-4 p-4 transition-colors hover:bg-gray-50 focus-visible:ring-inset sm:px-6 dark:hover:bg-gray-800/60 ${focusRing}`}
                  >
                    <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${isUnread ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>
                      <KindIcon kind={n.kind} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-3">
                        <span className={`text-base leading-snug ${isUnread ? 'font-semibold text-gray-900 dark:text-gray-100' : 'font-medium text-gray-800 dark:text-gray-200'}`}>{n.title}</span>
                        <span className="flex shrink-0 items-center gap-2 pt-0.5 text-xs text-gray-600 dark:text-gray-400">
                          {relativeTime(n.createdAt)}
                          {isUnread ? <span aria-label="Unread" className="size-2 rounded-full bg-blue-600" /> : <span className="size-2" />}
                        </span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-sm text-gray-600 dark:text-gray-400">{n.body}</span>
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        )}
        {hasMore && notifications.length > 0 ? (
          <div className="flex justify-center border-t border-gray-100 px-6 py-3 dark:border-gray-800">
            <button type="button" className={btnSecondary} onClick={() => onLoadMoreNotifications?.()}>Load more</button>
          </div>
        ) : null}
      </Card>
    </div>
  )
}
