/**
 * Physician avatar initials.
 * Canonical first_name / last_name win. A display string is used only when
 * those fields are absent, and CMS names are stored as "LAST, FIRST MIDDLE".
 */
export type PhysicianInitialsInput = {
  firstName?: string | null
  lastName?: string | null
  displayName?: string | null
}

const NEUTRAL_INITIALS = '?'

function firstCharacter(value: string | null | undefined): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  const first = Array.from(trimmed)[0]
  if (!first) return ''
  return first.toUpperCase()
}

function initialsFromParts(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string | null {
  const first = firstCharacter(firstName)
  const last = firstCharacter(lastName)
  if (!first && !last) return null
  return `${first}${last}`
}

function firstToken(value: string): string {
  return value.trim().split(/\s+/).filter(Boolean)[0] ?? ''
}

/** Last-name-first CMS display names, otherwise first token + final token. */
export function initialsFromPhysicianDisplayName(
  displayName: string | null | undefined,
): string {
  if (typeof displayName !== 'string') return NEUTRAL_INITIALS
  const trimmed = displayName.trim()
  if (!trimmed) return NEUTRAL_INITIALS

  const comma = trimmed.indexOf(',')
  if (comma >= 0) {
    const lastName = trimmed.slice(0, comma)
    const given = firstToken(trimmed.slice(comma + 1))
    return initialsFromParts(given, lastName) ?? NEUTRAL_INITIALS
  }

  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length === 0) return NEUTRAL_INITIALS
  if (words.length === 1) return firstCharacter(words[0]) || NEUTRAL_INITIALS
  return initialsFromParts(words[0], words[words.length - 1]) ?? NEUTRAL_INITIALS
}

export function getPhysicianInitials(
  input: PhysicianInitialsInput | string | null | undefined,
): string {
  if (typeof input === 'string' || input == null) {
    return initialsFromPhysicianDisplayName(input)
  }
  const fromParts = initialsFromParts(input.firstName, input.lastName)
  if (fromParts) return fromParts
  return initialsFromPhysicianDisplayName(input.displayName)
}
