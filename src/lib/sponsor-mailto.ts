/** Local mail client only. No recipient, no attachment, no MatchMed send. */

export function sponsorBriefMailto(input: { subject: string; canonicalUrl: string }): string {
  const subject = input.subject.trim()
  const url = input.canonicalUrl.trim()
  if (!subject || !/^https:\/\/atlas\.matchmed\.app\/partners\/[a-z0-9-]+\/briefs\/[0-9]{4}-[0-9]{2}$/.test(url)) {
    throw new Error('invalid_brief_mailto')
  }
  if (/[?&](practice|physician|user|npi|reported_in|utm_)/i.test(url)) {
    throw new Error('invalid_brief_mailto')
  }
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(url)}`
}

export function canonicalBriefUrl(publicSlug: string, issueSlug: string): string {
  return `https://atlas.matchmed.app/partners/${publicSlug}/briefs/${issueSlug}`
}
