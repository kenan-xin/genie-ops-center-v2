import { useEffect, useRef, useState } from 'react'
import { ArrowLeftRight, ChevronsUpDown, ExternalLink, KeyRound, LifeBuoy, LogOut, UserRound } from 'lucide-react'
import { MonoChip } from './MonoChip'
import { focusRing } from './helpers'

export interface ShellUser {
  name: string
  role?: string
  avatarUrl?: string
}

interface UserMenuProps {
  user: ShellUser
  supportHref?: string
  /** Link to the other chrome: "Administration" from the workspace, "Back to workspace" from admin. */
  switchTarget?: { label: string; href: string }
  accountHref?: string
  /** Local-account tenants only: the realm's account page where the person changes their password. Opens in a new tab. */
  changePasswordHref?: string
  onNavigate?: (href: string) => void
  onLogout?: () => void
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export function UserMenu({
  user,
  supportHref,
  switchTarget,
  accountHref = '/account',
  changePasswordHref,
  onNavigate,
  onLogout,
}: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (href: string) => {
    setOpen(false)
    onNavigate?.(href)
  }

  // 44px items under lg (touch), 40px on desktop.
  const itemClass = `flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-gray-800 hover:bg-gray-100 lg:min-h-0 lg:h-10 dark:text-gray-200 dark:hover:bg-gray-800 ${focusRing}`

  return (
    <div ref={rootRef} className="relative p-2">
      {open ? (
        <div
          role="menu"
          className="absolute bottom-full left-2 right-2 mb-2 rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg shadow-gray-900/5 dark:border-gray-700 dark:bg-gray-900"
        >
          <button type="button" role="menuitem" className={itemClass} onClick={() => pick(accountHref)}>
            <UserRound className="size-4 text-gray-500" strokeWidth={1.75} aria-hidden />
            Account
          </button>
          {changePasswordHref ? (
            <a role="menuitem" href={changePasswordHref} target="_blank" rel="noopener noreferrer" className={itemClass} onClick={() => setOpen(false)}>
              <KeyRound className="size-4 text-gray-500" strokeWidth={1.75} aria-hidden />
              <span className="flex-1">Change password</span>
              <ExternalLink className="size-4 text-gray-500" strokeWidth={1.75} aria-label="Opens in a new tab" />
            </a>
          ) : null}
          {switchTarget ? (
            <button type="button" role="menuitem" className={itemClass} onClick={() => pick(switchTarget.href)}>
              <ArrowLeftRight className="size-4 text-gray-500" strokeWidth={1.75} aria-hidden />
              {switchTarget.label}
            </button>
          ) : null}
          {supportHref ? (
            <a role="menuitem" href={supportHref} className={itemClass} onClick={() => setOpen(false)}>
              <LifeBuoy className="size-4 text-gray-500" strokeWidth={1.75} aria-hidden />
              Help and support
            </a>
          ) : null}
          <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              setOpen(false)
              onLogout?.()
            }}
          >
            <LogOut className="size-4 text-gray-500" strokeWidth={1.75} aria-hidden />
            Sign out
          </button>
        </div>
      ) : null}

      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-gray-200/60 dark:hover:bg-gray-800 ${focusRing}`}
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="size-9 shrink-0 rounded-full object-cover" />
        ) : (
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            {initials(user.name)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{user.name}</span>
          {user.role ? <MonoChip className="mt-0.5 max-w-full truncate">{user.role}</MonoChip> : null}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-gray-500" strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  )
}
