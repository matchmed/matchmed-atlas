import { NextRequest, NextResponse } from 'next/server'
import { captureServerEvent } from '@/lib/posthog-server'
import { createClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''

    if (!prompt) {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 })
    }

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

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message || 'Anthropic API request failed', details: data },
        { status: response.status },
      )
    }

    // Analytics must never fail report generation. Distinct ID = Supabase auth UUID.
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      await captureServerEvent(user?.id ?? 'anonymous', 'report_generated', {
        prompt_length: prompt.length,
      })
    } catch {
      // ignore analytics failures
    }

    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected server error' },
      { status: 500 },
    )
  }
}
