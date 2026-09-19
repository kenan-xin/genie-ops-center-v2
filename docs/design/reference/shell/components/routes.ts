/**
 * Click-through wiring for the design tree only. Maps an application href to the Design OS
 * preview route that shows that screen, so the shell navigation, the user menu, and in-page
 * links can be clicked. None of this is exported to the platform; the real app routes itself.
 */

const SCREEN: Record<string, string> = {
  '/': 'solutions/SolutionsHub',
  '/favorites': 'solutions/FavoritesPage',
  '/inbox': 'account-and-inbox/Inbox',
  '/account': 'account-and-inbox/AccountPage',
  '/admin': 'people-groups-and-roles/PeopleDirectory',
  '/admin/account': 'account-and-inbox/AccountPage',
  '/admin/people': 'people-groups-and-roles/PeopleDirectory',
  '/admin/groups': 'people-groups-and-roles/GroupsDirectory',
  '/admin/roles': 'people-groups-and-roles/RolesDirectory',
  '/admin/branding': 'branding/BrandingPage',
  '/admin/audit': 'audit-and-tenant-settings/AuditLog',
  '/admin/settings': 'audit-and-tenant-settings/TenantSettings',
  '/admin/modules': 'audit-and-tenant-settings/ModulesPage',
  '/admin/categories': 'audit-and-tenant-settings/CategoriesPage',
  '/admin/solutions/solutions': 'solutions/AdminSolutions',
  '/admin/solutions/themes': 'solutions/ChatThemes',
  '/admin/access': 'access/AccessGrants',
  '/admin/access/overview': 'access/AccessOverview',
  '/signin': 'sign-in-and-tenant-pages/SignInPage',
  '/admin/login': 'sign-in-and-tenant-pages/BreakGlassSignIn',
  '/not-set-up': 'sign-in-and-tenant-pages/NotSetUpPage',
  '/limited': 'sign-in-and-tenant-pages/LimitedSessionPage',
  '/templates': 'email-templates/EmailGallery',
}

/** A module entry in the sample tree has no screen of its own; it lands on the Modules page. */
const MODULE_PREFIX = /^\/m\/[\w-]+/

export function previewRouteFor(href: string, fullscreen = false): string | null {
  const [path, query = ''] = href.split('?')
  let screen = SCREEN[path]
  let extra = ''
  if (!screen) {
    const solution = path.match(/^\/s\/([\w-]+)$/)
    const role = path.match(/^\/admin\/roles\/([\w-]+)$/)
    if (solution) { screen = 'solutions/SolutionViewer'; extra = `s=${solution[1]}` }
    else if (role) { screen = 'people-groups-and-roles/RoleDetail'; extra = `role=${role[1]}` }
    else if (MODULE_PREFIX.test(path)) screen = SCREEN['/admin/modules']
  }
  if (!screen) return null
  const [section, name] = screen.split('/')
  const qs = [extra, query].filter(Boolean).join('&')
  return `/sections/${section}/screen-designs/${name}${fullscreen ? '/fullscreen' : ''}${qs ? `?${qs}` : ''}`
}

/**
 * Navigate the whole tab to the screen, always the fullscreen route. The Design OS page builds its
 * frame without the query string, so a screen that takes one (a role, a solution) would never change.
 * Browser Back returns to the Design OS page.
 */
export function goTo(href: string) {
  const target = previewRouteFor(href, true)
  if (!target) {
    console.log('No screen is designed for', href)
    return
  }
  ;(window.top ?? window).location.assign(target)
}

/** One listener for every internal link a section component renders, so a component never imports this file. */
export function onInternalLinkClick(e: React.MouseEvent) {
  const anchor = (e.target as HTMLElement).closest?.('a[href^="/"]') as HTMLAnchorElement | null
  if (!anchor || anchor.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey) return
  e.preventDefault()
  goTo(anchor.getAttribute('href') ?? '/')
}
