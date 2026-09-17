import { useState } from 'react'
import data from '@/../product/sections/people-groups-and-roles/data.json'
import type { Group, ModuleInfo, Person, PersonSession, Role, RoleAssignment, ScopeRecord, TenantSettingsSummary } from '@/../product/sections/people-groups-and-roles/types'
import { PeopleDirectory } from './components/PeopleDirectory'
import type { PersonTab } from './components/PersonInspector'

const settings = data.tenantSettings as TenantSettingsSummary

/**
 * Preview switches: ?open=<id> or ?person=<id> opens the inspector, ?tab=sessions picks a tab,
 * ?dialog=remove|disable opens a confirm, ?group=<id>&dialog=delete opens a group confirm,
 * ?lastadmin=1 drops Leila from Genie Administrators so Priya is the only tenant administrator left,
 * ?local=1 turns local accounts on, ?jit=1 switches onboarding,
 * ?ratelimited=1 shows the DEC-31 refusals on Add person and Resend set-password (retry in 10 minutes).
 */
export default function PeopleDirectoryPreview() {
  const params = new URLSearchParams(window.location.search)
  const lastAdmin = params.get('lastadmin') === '1'
  const [people, setPeople] = useState(() => (data.people as Person[]).map((x) => (lastAdmin && x.id === 'usr_leila' ? { ...x, groupIds: x.groupIds.filter((g) => g !== 'grp_admins') } : x)))
  const [assignments, setAssignments] = useState(data.roleAssignments as RoleAssignment[])
  const [sessions, setSessions] = useState(data.sessions as PersonSession[])
  const [groups, setGroups] = useState(data.groups as Group[])
  const openPerson = params.get('person') ?? params.get('open')
  const openGroup = params.get('group')
  const dialog = params.get('dialog')
  const rateLimited = params.get('ratelimited') === '1' ? { retryAfterMinutes: 10 } : undefined

  return (
    <PeopleDirectory
      tenantSettings={{ ...settings, onboardingMode: params.get('jit') === '1' ? 'jit' : settings.onboardingMode, localAccountsEnabled: params.get('local') === '1' || settings.localAccountsEnabled }}
      currentUserId={data.currentUserId}
      people={people}
      groups={groups}
      onResendSetPassword={(id) => console.log('Resend set-password email to', id)}
      addPersonRateLimited={rateLimited}
      resendRateLimited={rateLimited}
      onUpdateLocalGroup={(id, name, description) => setGroups((l) => l.map((g) => (g.id === id ? { ...g, name, description } : g)))}
      onArchiveGroup={(id) => setGroups((l) => l.map((g) => (g.id === id ? { ...g, archived: true } : g)))}
      onDeleteLocalGroup={(id) => { setGroups((l) => l.filter((g) => g.id !== id)); setPeople((l) => l.map((x) => ({ ...x, groupIds: x.groupIds.filter((g) => g !== id) }))) }}
      onRemoveAllMembers={(id) => { setPeople((l) => l.map((x) => ({ ...x, groupIds: x.groupIds.filter((g) => g !== id) }))); setGroups((l) => l.map((g) => (g.id === id ? { ...g, memberCount: 0 } : g))) }}
      onOpenRole={(id) => console.log('Open role:', id)}
      roles={data.roles as Role[]}
      roleAssignments={assignments}
      sessions={sessions}
      modules={data.modules as ModuleInfo[]}
      scopeRecords={data.scopeRecords as ScopeRecord[]}
      initialPersonId={openPerson}
      initialTab={(params.get('tab') as PersonTab | null) ?? undefined}
      initialDialog={!openGroup && (dialog === 'remove' || dialog === 'disable') ? dialog : undefined}
      initialGroupId={openGroup}
      initialGroupDialog={openGroup && (dialog === 'delete' || dialog === 'archive' || dialog === 'clear') ? dialog : undefined}
      onAddPerson={(input) => {
        console.log('Add person:', input)
        const accountType = input.accountType ?? 'brokered'
        setPeople((l) => [{ id: `usr_${Date.now()}`, name: input.name ?? input.email, email: input.email, status: 'pending', accountType, identitySource: accountType === 'local' ? 'Genie (local password)' : settings.identitySource, groupIds: [], firstSignInAt: null, lastSignInAt: null, onboarding: 'invited' }, ...l])
      }}
      onDisablePerson={(id) => setPeople((l) => l.map((x) => (x.id === id ? { ...x, status: 'disabled' } : x)))}
      onEnablePerson={(id) => setPeople((l) => l.map((x) => (x.id === id ? { ...x, status: 'active' } : x)))}
      onRemovePerson={(id) => setPeople((l) => l.filter((x) => x.id !== id))}
      onRevokeSession={(id) => setSessions((l) => l.filter((s) => s.id !== id))}
      onRevokeAllSessions={(pid) => setSessions((l) => l.filter((s) => s.personId !== pid))}
      onAddToLocalGroup={(pid, gid) => setPeople((l) => l.map((x) => (x.id === pid ? { ...x, groupIds: [...x.groupIds, gid] } : x)))}
      onRemoveFromLocalGroup={(pid, gid) => setPeople((l) => l.map((x) => (x.id === pid ? { ...x, groupIds: x.groupIds.filter((g) => g !== gid) } : x)))}
      onAddAssignment={(input) => {
        console.log('Add assignment:', input)
        setAssignments((l) => [...l, { id: `ra_${Date.now()}`, ...input, createdBy: 'Priya Nair', createdAt: new Date().toISOString() }])
      }}
      onRemoveAssignment={(id) => setAssignments((l) => l.filter((a) => a.id !== id))}
    />
  )
}
