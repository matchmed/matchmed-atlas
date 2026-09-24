import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { createConfirmGate } from './disconnect-confirm.ts'

describe('disconnect confirmation gate', () => {
  it('starts one request and ignores a second call until it finishes', () => {
    const gate = createConfirmGate()
    assert.equal(gate.tryBegin(), true)
    assert.equal(gate.tryBegin(), false)
    gate.finish()
    assert.equal(gate.tryBegin(), true)
  })

  it('allows another attempt after a failed request', () => {
    const gate = createConfirmGate()
    assert.equal(gate.tryBegin(), true)
    gate.finish()
    assert.equal(gate.tryBegin(), true)
    gate.finish()
  })
})

describe('disconnect confirmation wiring', () => {
  const page = readFileSync(new URL('../app/connect/page.tsx', import.meta.url), 'utf8')
  const cta = readFileSync(new URL('../components/ConnectPracticeCta.tsx', import.meta.url), 'utf8')

  it('opens a dialog before the physician inbox disconnect RPC', () => {
    assert.equal(page.includes('window.confirm'), false)
    assert.match(page, /onDisconnect=\{\(\) => setDisconnectOpen\(true\)\}/)
    assert.match(page, /<DisconnectConfirmDialog/)
    assert.doesNotMatch(page, /onDisconnect=\{[\s\S]{0,180}connectDisconnect/)
  })

  it('opens a dialog before the practice Connect CTA disconnect RPC', () => {
    assert.equal(cta.includes('window.confirm'), false)
    assert.match(cta, /onClick=\{\(\) => setConfirmDisconnect\(true\)\}/)
    assert.match(cta, /<DisconnectConfirmDialog/)
    assert.doesNotMatch(cta, /onClick=\{[\s\S]{0,120}connectDisconnect/)
  })
})
