import { NextRequest, NextResponse } from 'next/server'
import { runNotificationsCron } from '@/lib/notifications-cron'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization')
  return header === `Bearer ${secret}`
}

async function handle(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Flush path: transactional Connect emails + region milestones only.
  // Daily digest runs at /api/cron/notifications/digest (Vercel crons cannot use query strings).
  try {
    const result = await runNotificationsCron({ includeDigest: false })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'cron_failed'
    console.error('notifications cron failed', message)
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
