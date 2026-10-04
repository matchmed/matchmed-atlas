import 'server-only'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { isBlockedAddress, normalizeSponsorHttpsUrl } from './sponsor-url'

/**
 * Publication-time DNS check for browser destinations.
 *
 * The database validator rejects unsafe syntax and literal private addresses.
 * This module resolves hostnames once, immediately before an Atlas admin
 * publish or schedule RPC. MatchMed does not fetch the sponsor URL, follow
 * it, or download remote content, so this is not a complete SSRF control and
 * it does not eliminate DNS rebinding after publication.
 */
export type SponsorDnsRecord = { address: string; family?: number }
export type SponsorDnsLookup = (host: string) => Promise<SponsorDnsRecord[]>

export type SponsorDnsOptions = {
  lookup?: SponsorDnsLookup
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 2500

function isProhibitedPublicationAddress(host: string): boolean {
  if (isBlockedAddress(host)) return true
  const value = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (value.includes(':')) {
    if (value.startsWith('ff')) return true
    if (value.startsWith('2001:db8')) return true
    return false
  }
  const parts = value.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }
  const [a, b, c] = parts
  if (a >= 224) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a === 198 && b === 51 && c === 100) return true
  if (a === 203 && b === 0 && c === 113) return true
  return false
}

async function resolveHost(host: string, lookupHost: SponsorDnsLookup, timeoutMs: number): Promise<SponsorDnsRecord[]> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      lookupHost(host),
      new Promise<SponsorDnsRecord[]>((_, reject) => {
        timer = setTimeout(() => reject(new Error('dns-timeout')), timeoutMs)
      }),
    ])
  } catch (error) {
    if (error instanceof Error && error.message === 'dns-timeout') throw error
    throw new Error('dns-failed')
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function defaultLookup(host: string): Promise<SponsorDnsRecord[]> {
  const records = await lookup(host, { all: true, verbatim: true })
  return records.map((record) => ({ address: record.address, family: record.family }))
}

export async function assertPublishableSponsorUrl(raw: string, options: SponsorDnsOptions = {}): Promise<string> {
  const normalized = normalizeSponsorHttpsUrl(raw)
  const host = new URL(normalized).hostname
  if (isProhibitedPublicationAddress(host)) throw new Error('private-address')
  if (isIP(host)) return normalized
  const records = await resolveHost(host, options.lookup ?? defaultLookup, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  if (records.length === 0) throw new Error('dns-failed')
  for (const record of records) {
    if (isProhibitedPublicationAddress(record.address)) throw new Error('dns-private')
  }
  return normalized
}
