import { useState } from 'react'
import {
  LayoutGrid,
  Star,
  Inbox,
  Users,
  UsersRound,
  ShieldCheck,
  Palette,
  ScrollText,
  Settings,
  SwatchBook,
  Tags,
  KeyRound,
  Search,
  Blocks,
} from 'lucide-react'
import { AppShell, type ShellMode } from './components/AppShell'
import type { NavCategory, NavTree } from './components/MainNav'
import { focusRing } from './components/helpers'

const FONTS =
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap'

const workspaceNav = [
  { label: 'Solutions', href: '/', isActive: true, icon: LayoutGrid },
  { label: 'Favorites', href: '/favorites', icon: Star },
  // Inbox is deferred by the platform (DEC-21): hidden until scheduled. ?inbox=1 shows it.
  ...(new URLSearchParams(window.location.search).get('inbox') === '1' ? [{ label: 'Inbox', href: '/inbox', icon: Inbox, badge: 3 }] : []),
]

const adminNav = [
  { label: 'People', href: '/admin/people', isActive: true, icon: Users, section: 'Core' },
  { label: 'Groups', href: '/admin/groups', icon: UsersRound, section: 'Core' },
  { label: 'Roles', href: '/admin/roles', icon: ShieldCheck, section: 'Core' },
  { label: 'Branding', href: '/admin/branding', icon: Palette, section: 'Core' },
  { label: 'Audit log', href: '/admin/audit', icon: ScrollText, section: 'Core' },
  { label: 'Settings', href: '/admin/settings', icon: Settings, section: 'Core' },
  { label: 'Modules', href: '/admin/modules', icon: Blocks, section: 'Core' },
  { label: 'Categories', href: '/admin/categories', icon: Tags, section: 'Core' },
  { label: 'Solutions', href: '/admin/solutions/solutions', icon: LayoutGrid, section: 'Solutions' },
  { label: 'Chat themes', href: '/admin/solutions/themes', icon: SwatchBook, section: 'Solutions' },
  { label: 'Access', href: '/admin/solutions/access', icon: KeyRound, section: 'Solutions' },
]

// Core category rows (DEC-51). Entries reference them by id.
const categories: NavCategory[] = [
  { id: 'cat-healthcare', name: 'Healthcare', position: 1 },
  { id: 'cat-finance', name: 'Finance', position: 2 },
]

const sol = (label: string, slug: string, categoryId: string | null) => ({ label, href: `/s/${slug}`, categoryId, moduleId: 'solutions', kind: 'solution' as const })

// One tree mixing solution and module entries. Approvals has no category, so it lands under Other.
const tree: NavTree = {
  pinned: [sol('Claims Triage Assistant', 'claims-triage', 'cat-healthcare'), sol('Policy Q&A', 'policy-qa', 'cat-finance')],
  entries: [
    sol('Claims Triage Assistant', 'claims-triage', 'cat-healthcare'),
    sol('Discharge Summary Drafting', 'discharge-summary', 'cat-healthcare'),
    sol('Referral Letter Review', 'referral-review', 'cat-healthcare'),
    sol('Policy Q&A', 'policy-qa', 'cat-finance'),
    sol('Vendor Invoice Checker', 'invoice-checker', 'cat-finance'),
    sol('General Assistant', 'general-assistant', null),
    { label: 'Contracts', href: '/m/contracts', categoryId: 'cat-finance', moduleId: 'contracts', kind: 'module' },
    { label: 'Approvals', href: '/m/approvals', categoryId: null, moduleId: 'approvals', kind: 'module' },
  ],
}

export default function ShellPreview() {
  const params = new URLSearchParams(window.location.search)
  const [mode, setMode] = useState<ShellMode>(params.get('mode') === 'admin' ? 'admin' : 'workspace')
  // ?member=1 previews a person without any core admin permission: no Administration item.
  const memberOnly = params.get('member') === '1'
  const admin = mode === 'admin'

  // Administration lands on People; Back to workspace lands on the Solutions hub.
  const onNavigate = (href: string) => {
    if (href === '/admin') { setMode('admin'); console.log('Navigate to: /admin/people') }
    else if (href === '/') { setMode('workspace'); console.log('Navigate to: /') }
    else console.log('Navigate to:', href)
  }
  const offline = params.get('offline') === '1'
  const loading = params.get('loading') === '1'

  // Placeholder follows the chrome: solutions in the workspace, people on the admin landing page. No bell: notifications live in Inbox.
  const searchPlaceholder = admin ? 'Search people' : 'Search solutions'
  const headerActions = (
    <label className="hidden h-10 items-center gap-2 rounded-lg border border-gray-500 bg-white px-3 text-sm text-gray-600 focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 sm:flex dark:border-gray-500 dark:bg-gray-900 dark:focus-within:ring-blue-400 dark:focus-within:ring-offset-gray-950">
      <Search className="size-4 text-gray-500" strokeWidth={1.75} aria-hidden />
      <input placeholder={searchPlaceholder} aria-label={searchPlaceholder} className="w-40 bg-transparent outline-none placeholder:text-gray-500" />
    </label>
  )

  return (
    <>
      <link rel="stylesheet" href={FONTS} />
      <AppShell
        mode={mode}
        navigationItems={admin ? adminNav : workspaceNav}
        tree={tree}
        categories={categories}
        tenant={{ name: 'Meridian Health', productName: 'Genie Ops Center' }}
        user={memberOnly ? { name: 'Alex Morgan', role: 'Workspace member' } : { name: 'Priya Nair', role: 'Administrator' }}
        switchTarget={memberOnly ? undefined : admin ? { label: 'Back to workspace', href: '/' } : { label: 'Administration', href: '/admin' }}
        changePasswordHref={params.get('local') === '1' ? 'https://id.genie.example/realms/meridian/account/#/security/signingin' : undefined}
        bottomBar={
          <button type="button" className={`flex h-11 flex-1 items-center justify-center rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-600/90 active:bg-blue-600/80 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-600 ${focusRing}`}>
            {admin ? 'Add person' : searchPlaceholder}
          </button>
        }
        pageDescription={admin ? 'People who can sign in to this tenant.' : 'Your solutions, grouped by category. More will appear here over time.'}
        offline={offline || undefined}
        loading={loading}
        headerActions={headerActions}
        supportHref="mailto:support@meridianhealth.example"
        onNavigate={onNavigate}
        onLogout={() => { console.log('Sign out: end Genie session'); console.log('Sign out: end realm session') }}
      >
        <div className="rounded-xl border border-dashed border-gray-200 p-8 dark:border-gray-800">
          <h2 className="mb-1 text-lg font-bold tracking-tight">Content area</h2>
          <p className="max-w-prose text-sm text-gray-600 dark:text-gray-400">Section screens render here. Open the user menu in the sidebar footer and choose {admin ? 'Back to workspace' : 'Administration'} to preview the other chrome.</p>
        </div>
      </AppShell>
    </>
  )
}
