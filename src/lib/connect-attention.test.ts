import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  connectionsAttentionCount,
  connectionsNavAriaLabel,
  formatConnectionsBadge,
  relationshipNeedsAttention,
} from './connect-attention.ts'

const nav = readFileSync(new URL('../components/Nav.tsx', import.meta.url), 'utf8')
const cta = readFileSync(new URL('../components/ConnectPracticeCta.tsx', import.meta.url), 'utf8')
const connectPage = readFileSync(new URL('../app/connect/page.tsx', import.meta.url), 'utf8')

function row(
  status: string,
  initiator: 'physician' | 'practice',
  hasUnread = false,
) {
  return { status, initiator_side: initiator, has_unread: hasUnread }
}

describe('physician Connections attention count', () => {
  it('hides a zero badge and caps the visible label at 99+', () => {
    assert.equal(formatConnectionsBadge(0), null)
    assert.equal(formatConnectionsBadge(-1), null)
    assert.equal(formatConnectionsBadge(1), '1')
    assert.equal(formatConnectionsBadge(99), '99')
    assert.equal(formatConnectionsBadge(100), '99+')
    assert.equal(connectionsNavAriaLabel(0), 'Connections')
    assert.equal(connectionsNavAriaLabel(2), 'Connections, 2 items requiring attention')
    assert.equal(connectionsNavAriaLabel(1), 'Connections, 1 item requiring attention')
    assert.equal(connectionsNavAriaLabel(120), 'Connections, 99+ items requiring attention')
  })

  it('counts one thread once even when it has several unread messages', () => {
    const inbox = [row('accepted', 'physician', true)]
    assert.equal(connectionsAttentionCount(inbox), 1)
    assert.equal(relationshipNeedsAttention(inbox[0]), true)
  })

  it('counts separate unread threads and an incoming pending request', () => {
    assert.equal(
      connectionsAttentionCount([
        row('accepted', 'physician', true),
        row('accepted', 'practice', true),
        row('pending', 'practice', false),
      ]),
      3,
    )
  })

  it('does not count an outgoing pending request, a quiet accepted thread, or terminal rows', () => {
    assert.equal(
      connectionsAttentionCount([
        row('pending', 'physician', false),
        row('accepted', 'physician', false),
        row('disconnected', 'physician', true),
        row('declined', 'practice', true),
        row('canceled', 'practice', false),
      ]),
      0,
    )
  })

  it('counts an incoming unread request once, and drops an accepted thread after it is read', () => {
    const incomingUnread = row('pending', 'practice', true)
    assert.equal(connectionsAttentionCount([incomingUnread]), 1)
    assert.equal(connectionsAttentionCount([{ ...incomingUnread, has_unread: false }]), 1)
    assert.equal(connectionsAttentionCount([row('accepted', 'physician', true)]), 1)
    assert.equal(connectionsAttentionCount([row('accepted', 'physician', false)]), 0)
  })
})

describe('physician Connections navigation', () => {
  it('renames the destination and keeps the /connect route', () => {
    assert.match(nav, /href: '\/connect'/)
    assert.match(nav, /label: 'Connections'/)
    assert.equal(nav.includes("label: 'Connect'"), false)
    assert.match(nav, /connectionsNavAriaLabel\(connectionsAttention\)/)
    assert.match(nav, /formatConnectionsBadge\(connectionsAttention\)/)
    assert.match(nav, /connectListForPhysician/)
    assert.equal(nav.includes('notifications_unread_count'), false)
    assert.match(cta, />\s*Connect\s*</)
  })

  it('publishes inbox changes on the existing refresh path', () => {
    assert.match(connectPage, /atlas:connections-attention/)
    assert.match(connectPage, /connectionsAttentionCount\(rows\)/)
    assert.match(nav, /CONNECTIONS_ATTENTION_POLL_MS/)
    assert.match(nav, /atlas:connections-attention/)
  })
})
