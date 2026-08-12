'use client'

import Link from 'next/link'
import PublicSearchCombobox from '@/components/PublicSearchCombobox'

export default function PublicSearchHome() {
  return (
    <div className="public-home">
      <section className="public-home-hero" aria-labelledby="public-home-headline">
        <p className="public-home-eyebrow">MatchMed Atlas</p>
        <h1 id="public-home-headline" className="font-serif public-home-title">
          Research a practice before you sign.
        </h1>
        <p className="public-home-sub">
          Search ophthalmology practices and physicians using public CMS-observed workforce data.
        </p>

        <PublicSearchCombobox showCounts inputId="public-search-input" />
      </section>

      <section className="public-home-foot" aria-label="About Atlas data">
        <p>
          Physician and practice records reflect the latest available CMS Doctors and Clinicians
          data and may lag recent changes.{' '}
          <Link href="/scoring-methodology">How Atlas scoring works</Link>
          {' · '}
          <Link href="/signup">Create a free account</Link>
          {' '}to unlock workforce stability analysis.
        </p>
      </section>
    </div>
  )
}
