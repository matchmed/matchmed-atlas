/**
 * Resolve the public-facing practice name.
 * Approved employer public_display_name wins; CMS practices.practice_name is fallback.
 * Never mutates CMS/source data.
 */
export function resolvePracticePublicName(
  cmsPracticeName: string | null | undefined,
  publicDisplayName: string | null | undefined,
  fallback = 'Practice',
): string {
  const approved = publicDisplayName?.trim()
  if (approved) return approved
  const cms = cmsPracticeName?.trim()
  if (cms) return cms
  return fallback
}

/** Browser / Open Graph title for a practice profile. */
export function practiceProfileDocumentTitle(
  cmsPracticeName: string | null | undefined,
  publicDisplayName: string | null | undefined,
): string {
  const name = resolvePracticePublicName(cmsPracticeName, publicDisplayName, '')
  return name ? `${name} · MatchMed Atlas` : 'Practice · MatchMed Atlas'
}

/** Map pin popup / GeoJSON label property. */
export function practiceMapLabelName(
  cmsPracticeName: string | null | undefined,
  publicDisplayName: string | null | undefined,
): string {
  return resolvePracticePublicName(cmsPracticeName, publicDisplayName, '')
}
