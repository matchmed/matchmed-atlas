/** One confirmation may start the disconnect RPC. A second click while it runs is ignored. */
export function createConfirmGate() {
  let running = false
  return {
    tryBegin(): boolean {
      if (running) return false
      running = true
      return true
    },
    finish() {
      running = false
    },
  }
}
