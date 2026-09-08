import { NextRequest, NextResponse } from 'next/server'
import { captureServerEvent } from '@/lib/posthog-server'
import { createClient } from '@/lib/supabase-server'

// Bound actual bytes, including chunked bodies without Content-Length.
const MAX_BODY_BYTES = 256 * 1024

export async function POST(req: NextRequest) {
  let stage = 'authorization'
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin, deleted_at')
      .eq('user_id', user.id)
      .maybeSingle()
    if (profileError || profile?.is_admin !== true || profile.deleted_at) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    stage = 'input'
    if (Number(req.headers.get('content-length')) > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Request body too large' }, { status: 413 })
    }
    const reader = req.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > MAX_BODY_BYTES) {
            void reader.cancel().catch(() => {})
            return NextResponse.json({ error: 'Request body too large' }, { status: 413 })
          }
          chunks.push(value)
        }
      } finally {
        reader.releaseLock()
      }
    }
    let body
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''

    if (!prompt) {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.error('Report generation failed', { stage: 'configuration' })
      return NextResponse.json({ error: 'Report generation failed' }, { status: 500 })
    }

    stage = 'provider'
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      // Never log provider bodies, prompts, headers, or credentials.
      console.error('Report generation failed', { stage, status: response.status })
      await response.body?.cancel()
      return NextResponse.json({ error: 'Report generation failed' }, { status: 502 })
    }
    const data = await response.json()

    // Analytics must never fail report generation. Distinct ID = Supabase auth UUID.
    try {
      await captureServerEvent(user.id, 'report_generated', {
        prompt_length: prompt.length,
      })
    } catch {
      // ignore analytics failures
    }

    return NextResponse.json(data)
  } catch {
    console.error('Report generation failed', { stage })
    return NextResponse.json(
      { error: 'Report generation failed' },
      { status: 500 },
    )
  }
}
