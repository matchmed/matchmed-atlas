import { redirect } from 'next/navigation'

/** Legacy /jobs route — physician-facing product is now Opportunities (MAT-12). */
export default function JobsRedirectPage() {
  redirect('/opportunities')
}
