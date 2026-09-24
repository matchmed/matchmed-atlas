/**
 * Physician Connections navigation badge.
 * Counts distinct inbox rows from connect_list_for_physician.
 * has_unread is already one flag per relationship, so several unread
 * messages in one thread count once.
 */

export const CONNECTIONS_ATTENTION_POLL_MS = 5000

const TERMINAL_STATUSES = new Set(['declined', 'canceled', 'disconnected'])

export type ConnectionsAttentionRow = {
  status: string
  initiator_side: string
  has_unread?: boolean | null
}

export function relationshipNeedsAttention(row: ConnectionsAttentionRow): boolean {
  if (TERMINAL_STATUSES.has(row.status)) return false
  if (row.has_unread) return true
  return row.status === 'pending' && row.initiator_side === 'practice'
}

export function connectionsAttentionCount(rows: ConnectionsAttentionRow[]): number {
  return rows.filter(relationshipNeedsAttention).length
}

export function formatConnectionsBadge(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null
  return count > 99 ? '99+' : String(Math.floor(count))
}

export function connectionsNavAriaLabel(count: number): string {
  const badge = formatConnectionsBadge(count)
  if (!badge) return 'Connections'
  const noun = count === 1 ? 'item' : 'items'
  return `Connections, ${badge} ${noun} requiring attention`
}
