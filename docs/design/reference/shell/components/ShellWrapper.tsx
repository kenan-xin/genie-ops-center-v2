import { LayoutGrid, Star, Inbox, Users, UsersRound, ShieldCheck, Palette, ScrollText, Settings, SwatchBook, Tags, KeyRound, Blocks } from 'lucide-react'
import { AppShell, type ShellMode } from './AppShell'
import type { NavCategory, NavTree } from './MainNav'
import { goTo, onInternalLinkClick } from './routes'
import accountData from '@/../product/sections/account-and-inbox/data.json'

/**
 * Design OS wrapper: wraps a section screen in the shell with sample sidebar
 * data. Picks the chrome (workspace or admin) and the active item from the
 * screen being previewed.
 */
const FONTS =
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap'

type PageMeta = { mode: ShellMode; title: string; description: string; active?: string }

const PAGES: Record<string, PageMeta> = {
  AccountPage: { mode: 'workspace', title: 'Account', description: 'Your profile, sessions, preferences, and access.' },
  Inbox: { mode: 'workspace', title: 'Inbox', description: 'Access changes and solution updates.', active: '/inbox' },
  IdleTimeoutModal: { mode: 'workspace', title: 'Solutions', description: 'Your solutions, grouped by category.', active: '/' },
  SolutionsEmptyState: { mode: 'workspace', title: 'Solutions', description: 'Your solutions, grouped by category.', active: '/' },
  PeopleDirectory: { mode: 'admin', title: 'People', description: 'Everyone who can sign in to this tenant.', active: '/admin/people' },
  GroupsDirectory: { mode: 'admin', title: 'Groups', description: 'Directory groups from your identity provider and local groups managed here.', active: '/admin/groups' },
  RolesDirectory: { mode: 'admin', title: 'Roles', description: 'Named sets of permissions and who holds them.', active: '/admin/roles' },
  RoleDetail: { mode: 'admin', title: 'Roles', description: 'Named sets of permissions and who holds them.', active: '/admin/roles' },
  SolutionsHub: { mode: 'workspace', title: 'Solutions', description: 'Your solutions, grouped by category.', active: '/' },
  FavoritesPage: { mode: 'workspace', title: 'Favorites', description: 'Your pinned solutions, in the order they appear in the sidebar.', active: '/favorites' },
  SolutionViewer: { mode: 'workspace', title: 'Claims Triage Assistant', description: 'Healthcare', active: '/s/claims-triage' },
  AdminSolutions: { mode: 'admin', title: 'Solutions', description: 'Every chat solution in this tenant, including drafts.', active: '/admin/solutions/solutions' },
  ChatThemes: { mode: 'admin', title: 'Chat themes', description: 'How the chat surface looks. The tenant branding is the default.', active: '/admin/solutions/themes' },
  CategoriesPage: { mode: 'admin', title: 'Categories', description: 'Headings in the sidebar that group solutions and modules.', active: '/admin/categories' },
  ModulesPage: { mode: 'admin', title: 'Modules', description: 'Every module compiled into this deployment: on or off, its category, and who reaches it.', active: '/admin/modules' },
  AccessGrants: { mode: 'admin', title: 'Access', description: 'Choose a group or a person first. Then give them the solutions and modules they need, or take that access back.', active: '/admin/access' },
  AccessOverview: { mode: 'admin', title: 'Access', description: 'Who reaches what, and through which role or group.', active: '/admin/access' },
  BrandingPage: { mode: 'admin', title: 'Branding', description: 'How Genie looks for your people. Publish applies every tab at once.', active: '/admin/branding' },
  AuditLog: { mode: 'admin', title: 'Audit log', description: "Who did what, when, on which record. Events are kept for the tenant's lifetime and never edited.", active: '/admin/audit' },
  TenantSettings: { mode: 'admin', title: 'Tenant settings', description: 'Sign-in, sessions, and the settings each module exposes for this tenant. Branding has its own page.', active: '/admin/settings' },
}

const workspaceNav = (active?: string) => [
  { label: 'Solutions', href: '/', icon: LayoutGrid, isActive: active === '/' },
  { label: 'Favorites', href: '/favorites', icon: Star, isActive: active === '/favorites' },
  // Inbox is deferred by the platform (DEC-21): hidden until scheduled. Shown only when the preview asks for it.
  ...(new URLSearchParams(window.location.search).get('inbox') === '1' || active === '/inbox' ? [{ label: 'Inbox', href: '/inbox', icon: Inbox, badge: 3, isActive: active === '/inbox' }] : []),
]

const adminNav = (active?: string) =>
  [
    // Core owns three captions, not one. Nine rows under a single CORE heading read as a flat list,
    // and the admin rail has no child level to indent, so the grouping has to carry the hierarchy.
    { label: 'People', href: '/admin/people', icon: Users, section: 'People and access' },
    { label: 'Groups', href: '/admin/groups', icon: UsersRound, section: 'People and access' },
    { label: 'Roles', href: '/admin/roles', icon: ShieldCheck, section: 'People and access' },
    // Access is core administration, so it stays reachable when the solutions module is switched off.
    { label: 'Access', href: '/admin/access', icon: KeyRound, section: 'People and access' },
    { label: 'Branding', href: '/admin/branding', icon: Palette, section: 'Tenant' },
    { label: 'Settings', href: '/admin/settings', icon: Settings, section: 'Tenant' },
    { label: 'Audit log', href: '/admin/audit', icon: ScrollText, section: 'Tenant' },
    { label: 'Modules', href: '/admin/modules', icon: Blocks, section: 'Catalog' },
    { label: 'Categories', href: '/admin/categories', icon: Tags, section: 'Catalog' },
    { label: 'Solutions', href: '/admin/solutions/solutions', icon: LayoutGrid, section: 'Solutions' },
    { label: 'Chat themes', href: '/admin/solutions/themes', icon: SwatchBook, section: 'Solutions' },
  ].map((i) => ({ ...i, isActive: i.href === active }))

// Core category rows (DEC-51); tree entries reference them by id.
const categories: NavCategory[] = [
  { id: 'cat-healthcare', name: 'Healthcare', position: 1 },
  { id: 'cat-finance', name: 'Finance', position: 2 },
]

const navTree = (active?: string): NavTree => {
  const sol = (label: string, slug: string, categoryId: string | null) => ({ label, href: `/s/${slug}`, categoryId, moduleId: 'solutions', kind: 'solution' as const, isActive: active === `/s/${slug}` })
  return {
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
}

export default function ShellWrapper({ children }: { children?: React.ReactNode }) {
  const screen = window.location.pathname.match(/screen-designs\/([^/]+)/)?.[1] ?? ''
  let page = PAGES[screen] ?? { mode: 'workspace', title: 'Solutions', description: '', active: '/' }
  const params = new URLSearchParams(window.location.search)
  // Preview only: ?breakglass=1 renders /admin/account in the admin chrome as the break-glass account (DEC-24).
  const breakGlass = screen === 'AccountPage' && params.get('breakglass') === '1'
  if (breakGlass) page = { ...page, mode: 'admin', description: 'Local administrator account: password, authenticator, and sessions.' }
  // Preview only: ?local=1 previews a local-accounts tenant, which puts Change password in the user menu.
  const changePasswordHref = screen === 'AccountPage' && !breakGlass && params.get('local') === '1' ? accountData.tenantSupport.accountManagementUrl : undefined
  if (screen === 'SolutionViewer') {
    // Preview only: the viewer takes ?s=<slug>, so the header follows it.
    const slug = new URLSearchParams(window.location.search).get('s') ?? 'claims-triage'
    const names: Record<string, [string, string]> = {
      'claims-triage': ['Claims Triage Assistant', 'Healthcare'],
      'discharge-summary': ['Discharge Summary Drafting', 'Healthcare'],
      'referral-review': ['Referral Letter Review', 'Healthcare'],
      'policy-qa': ['Policy Q&A', 'Finance'],
      'invoice-checker': ['Vendor Invoice Checker', 'Finance'],
      'general-assistant': ['General Assistant', 'Other'],
      'hr-onboarding': ['Onboarding Buddy', 'People and HR'],
      'benefits-portal': ['Benefits Portal', 'People and HR'],
    }
    const [title, description] = names[slug] ?? names['claims-triage']
    page = { ...page, title, description, active: `/s/${slug}` }
  }
  const admin = page.mode === 'admin'
  const focus = screen === 'SolutionViewer' && new URLSearchParams(window.location.search).get('focus') === '1'

  return (
    <>
      <link rel="stylesheet" href={FONTS} />
      <AppShell
        mode={page.mode}
        focus={focus}
        navigationItems={admin ? adminNav(page.active) : workspaceNav(page.active)}
        tree={navTree(page.active)}
        categories={categories}
        tenant={{ name: 'Meridian Health', productName: 'Genie Ops Center' }}
        user={breakGlass ? { name: accountData.breakGlassUser.name, role: 'Administrator' } : admin ? { name: 'Priya Nair', role: 'Administrator' } : { name: 'Alex Morgan', role: 'Workspace member' }}
        switchTarget={admin ? { label: 'Back to workspace', href: '/' } : { label: 'Administration', href: '/admin/people' }}
        onNavigate={goTo}
        onLogout={() => goTo('/signin')}
        changePasswordHref={changePasswordHref}
        pageTitle={page.title}
        pageDescription={page.description}
        supportHref="mailto:support@meridianhealth.example"
      >
        {/* Design tree only: routes an internal link inside a section component to its preview screen. */}
        <div className="contents" onClick={onInternalLinkClick}>{children}</div>
      </AppShell>
    </>
  )
}
