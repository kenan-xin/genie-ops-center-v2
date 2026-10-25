/**
 * The eligibility rules of the grant reader (R-27) as SQL conditions on a `user` row and a `group`
 * row. The grant reader and the holder query build their statements from this one function, so a
 * screen that lists who holds a key lists exactly the people and groups that `can()` grants
 * (DEC-39, DEC-48). `person` and `group` are fixed aliases in the caller's statement, never input.
 */
export function eligibility(person: string, group: string) {
  return {
    // An erased account, or a ban that has not expired: the person is granted nothing.
    inactivePerson: `(${person}.erased_at is not null
           or (${person}.banned is true and (${person}.ban_expires is null or ${person}.ban_expires > now())))`,
    // An archived group contributes nothing, and its rows are kept (R-32).
    activeGroup: `${group}.archived_at is null`,
  };
}
