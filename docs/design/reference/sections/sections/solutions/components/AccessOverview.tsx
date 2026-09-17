import { useMemo, useState } from 'react'
import { Building2, Search, UsersRound, X } from 'lucide-react'
import type { AccessGrant, PersonSummary, Solution } from '@/../product/sections/solutions/types'
import { btnGhost, focusRing } from './helpers'
import { Avatar, Card, EmptyRow, Monogram, Pill, Th, Td } from './ui'

export interface AccessOverviewProps {
  solutions: Solution[]
  people: PersonSummary[]
  accessGrants: AccessGrant[]
  initial?: { kind: 'solution' | 'person'; id: string } | null
  /** Opens the assignment form with the role and, for a solution, the scope preselected. */
  onAddAccess?: (target: { kind: 'solution' | 'person'; id: string }) => void
}

/** Pick a solution or a person and read effective access with its source. */
export function AccessOverview({ solutions, people, accessGrants, initial, onAddAccess }: AccessOverviewProps) {
  const [kind, setKind] = useState<'solution' | 'person'>(initial?.kind ?? 'solution')
  const [pickedId, setPickedId] = useState<string | null>(initial?.id ?? null)
  const [q, setQ] = useState('')

  const options = useMemo(() => {
    const t = q.trim().toLowerCase()
    return kind === 'solution'
      ? solutions.filter((s) => !s.archived && (!t || s.name.toLowerCase().includes(t))).map((s) => ({ id: s.id, label: s.name, sub: s.description }))
      : people.filter((p) => !t || p.name.toLowerCase().includes(t) || p.email.toLowerCase().includes(t)).map((p) => ({ id: p.id, label: p.name, sub: p.email }))
  }, [kind, q, solutions, people])

  const solution = kind === 'solution' ? solutions.find((s) => s.id === pickedId) : null
  const person = kind === 'person' ? people.find((p) => p.id === pickedId) : null

  // Solution view: every grant that reaches this solution. Person view: every grant that reaches this person, and which solutions it opens.
  const rows = solution
    ? accessGrants.filter((g) => g.solutionId === solution.id || g.scope === 'tenant').map((g) => ({ g, target: null as Solution | null }))
    : person
      ? accessGrants
          .filter((g) => (g.principalType === 'user' && g.principalName === person.name) || (g.principalType === 'group' && person.groupNames.includes(g.principalName)))
          .flatMap((g) => (g.scope === 'tenant' ? [{ g, target: null as Solution | null }] : [{ g, target: solutions.find((s) => s.id === g.solutionId) ?? null }]))
      : []

  const seg = (k: 'solution' | 'person', label: string) => (
    <button type="button" role="radio" aria-checked={kind === k} onClick={() => { setKind(k); setPickedId(null); setQ('') }} className={`h-8 rounded-lg px-3.5 text-sm font-medium motion-safe:transition-colors ${focusRing} ${kind === k ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-950 dark:text-gray-100' : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'}`}>{label}</button>
  )

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div role="radiogroup" aria-label="Look up by" className="inline-flex h-10 items-center rounded-xl bg-gray-100 p-1 dark:bg-gray-800">{seg('solution', 'By solution')}{seg('person', 'By person')}</div>
        {pickedId ? (
          <div className="flex h-10 items-center gap-2 rounded-xl border border-gray-300 bg-white pl-2 pr-1 text-sm dark:border-gray-700 dark:bg-gray-950">
            {solution ? <Monogram text={solution.monogram} color={solution.accentColor} size="sm" /> : person ? <Avatar name={person.name} size="sm" /> : null}
            <span className="font-semibold">{solution?.name ?? person?.name}</span>
            <button type="button" aria-label="Clear" className={`${btnGhost} size-8 justify-center px-0 text-gray-500`} onClick={() => setPickedId(null)}><X className="size-4" strokeWidth={2} /></button>
          </div>
        ) : (
          <div className="relative w-full sm:max-w-sm">
            <label className="flex h-10 items-center gap-2 rounded-xl border border-gray-500 bg-white px-3 text-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 dark:border-gray-500 dark:bg-gray-950 dark:focus-within:ring-blue-400 dark:focus-within:ring-offset-gray-950">
              <Search className="size-4 text-gray-500" strokeWidth={1.75} aria-hidden />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={kind === 'solution' ? 'Pick a solution' : 'Pick a person'} className="flex-1 bg-transparent outline-none placeholder:text-gray-500" />
            </label>
            <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
              {options.map((o) => (
                <li key={o.id}><button type="button" onClick={() => setPickedId(o.id)} className={`flex min-h-11 w-full flex-col justify-center rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800 ${focusRing}`}><span className="font-medium">{o.label}</span><span className="truncate text-xs text-gray-600 dark:text-gray-400">{o.sub}</span></button></li>
              ))}
              {options.length === 0 ? <li className="px-3 py-4 text-center text-sm text-gray-600">No match.</li> : null}
            </ul>
          </div>
        )}
      </div>

      <Card className="overflow-hidden">
        <ul className="divide-y divide-gray-100 md:hidden dark:divide-gray-800">
          {rows.map(({ g, target }) => (
            <li key={g.id + (target?.id ?? '')} className="flex items-start gap-3 px-4 py-3 text-sm">
              {solution ? (g.principalType === 'user' ? <Avatar name={g.principalName} size="sm" /> : <span className="flex size-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800"><Building2 className="size-4 text-gray-600" strokeWidth={1.75} aria-hidden /></span>) : target ? <Monogram text={target.monogram} color={target.accentColor} size="sm" /> : <span className="size-7" />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 font-medium">{solution ? g.principalName : target?.name ?? 'Every solution'}<Pill tone={g.scope === 'tenant' ? 'gray' : 'blue'}>{g.scope === 'tenant' ? 'Whole tenant' : 'This solution'}</Pill></div>
                <div className="text-xs text-gray-600 dark:text-gray-400">{g.roleName} · {person ? (g.principalType === 'user' ? 'direct' : `via ${g.principalName}`) : g.principalType === 'user' ? 'direct' : 'group'} · added by {g.addedBy}</div>
              </div>
            </li>
          ))}
          {!pickedId ? <li className="px-5 py-10 text-center text-sm text-gray-600 dark:text-gray-400">Pick a solution or a person above.</li> : rows.length === 0 ? <li className="px-5 py-10 text-center text-sm text-gray-600 dark:text-gray-400">{solution ? 'Nobody can use this solution.' : 'This person cannot open any solution.'} <button type="button" className={`rounded-md font-semibold text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`} onClick={() => pickedId && onAddAccess?.({ kind, id: pickedId })}>Add access</button></li> : null}
        </ul>
        <div className="hidden md:block">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-950/50">
              <tr>{solution ? <><Th>Who</Th><Th>Role</Th><Th>Scope</Th><Th>Source</Th><Th>Added by</Th></> : <><Th>Solution</Th><Th>Role</Th><Th>Scope</Th><Th>Source</Th><Th>Added by</Th></>}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map(({ g, target }) => (
                <tr key={g.id + (target?.id ?? '')}>
                  <Td>
                    {solution ? (
                      <div className="flex items-center gap-2.5">
                        {g.principalType === 'user' ? <Avatar name={g.principalName} size="sm" /> : <span className="flex size-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800"><Building2 className="size-4 text-gray-600" strokeWidth={1.75} aria-hidden /></span>}
                        <div><div className="font-medium">{g.principalName}</div>{g.memberCount !== null ? <div className="text-xs text-gray-600 dark:text-gray-400">{g.memberCount} members</div> : null}</div>
                      </div>
                    ) : target ? (
                      <div className="flex items-center gap-2.5"><Monogram text={target.monogram} color={target.accentColor} size="sm" /><span className="font-medium">{target.name}</span></div>
                    ) : (
                      <span className="font-medium text-gray-700 dark:text-gray-300">Every solution</span>
                    )}
                  </Td>
                  <Td className="text-gray-700 dark:text-gray-300">{g.roleName}</Td>
                  <Td><Pill tone={g.scope === 'tenant' ? 'gray' : 'blue'}>{g.scope === 'tenant' ? 'Whole tenant' : 'This solution'}</Pill></Td>
                  <Td className="text-gray-700 dark:text-gray-300">
                    {person ? (g.principalType === 'user' ? 'Direct assignment' : <span className="inline-flex items-center gap-1"><UsersRound className="size-4 text-gray-500" strokeWidth={1.75} aria-hidden />via {g.principalName}</span>) : g.principalType === 'user' ? 'Direct assignment' : 'Group assignment'}
                  </Td>
                  <Td className="text-gray-700 dark:text-gray-300">{g.addedBy}</Td>
                </tr>
              ))}
              {!pickedId ? <EmptyRow colSpan={5}>Pick a solution to see who can use it, or a person to see what they can open.</EmptyRow> : rows.length === 0 ? (
                <EmptyRow colSpan={5}>
                  {solution ? 'Nobody can use this solution yet.' : 'This person cannot open any solution yet.'}{' '}
                  <button type="button" className={`rounded-md font-semibold text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`} onClick={() => onAddAccess?.({ kind, id: pickedId })}>Add access</button>
                </EmptyRow>
              ) : null}
            </tbody>
          </table>
        </div>
        {pickedId && rows.length > 0 ? <div className="border-t border-gray-100 px-5 py-2.5 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-400">Access is read from role assignments. Change it under Roles, or from the solution's Access tab.</div> : null}
      </Card>
    </div>
  )
}
