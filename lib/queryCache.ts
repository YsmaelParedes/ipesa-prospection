/** In-memory cache. No browser or React dependencies, so races can be tested directly. */
export type QueryPolicy = { staleTime: number; maxAge: number; poll?: number }
export type QuerySnapshot<T = unknown> = {
  data?: T; error?: Error; updatedAt: number; fetching: boolean
}
type Entry = {
  snapshot: QuerySnapshot; generation: number; touched: number; pending?: Promise<unknown>
  controller?: AbortController; retryAt: number; failures: number; policy: QueryPolicy
}
export class QueryError extends Error {
  constructor(message: string, public status = 0, public retryAfter = 0) { super(message) }
}

export class QueryCache {
  private entries = new Map<string, Entry>()
  private observers = new Set<{ matches: (key: string) => boolean; notify: (key: string) => void }>()
  constructor(private now: () => number = Date.now, private onChange: () => void = () => {}) {}

  subscribe(matches: (key: string) => boolean, notify: (key: string) => void) {
    const observer = { matches, notify }
    this.observers.add(observer)
    return () => {
      this.observers.delete(observer)
      for (const [key, entry] of this.entries) if (matches(key) && !this.active(key)) entry.touched = this.now()
      this.prune()
    }
  }
  private emit(key: string) {
    for (const o of this.observers) if (o.matches(key)) o.notify(key)
    this.onChange()
  }
  private active(key: string) { return [...this.observers].some(o => o.matches(key)) }
  peek<T>(key: string): QuerySnapshot<T> | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    const s = entry.snapshot
    return { ...s, data: this.now() - s.updatedAt < entry.policy.maxAge ? s.data : undefined } as QuerySnapshot<T>
  }
  async read<T>(key: string, loader: (signal: AbortSignal) => Promise<T>, policy: QueryPolicy, force = false): Promise<T> {
    let entry = this.entries.get(key)
    if (!entry) {
      entry = { snapshot: { updatedAt: 0, fetching: false }, generation: 0, touched: this.now(), retryAt: 0, failures: 0, policy }
      this.entries.set(key, entry)
    }
    entry.touched = this.now()
    entry.policy = policy
    const age = this.now() - entry.snapshot.updatedAt
    if (!force && entry.snapshot.data !== undefined && age < policy.staleTime) return entry.snapshot.data as T
    if (entry.pending) return entry.pending as Promise<T>
    if (this.now() < entry.retryAt) throw entry.snapshot.error ?? new QueryError('No se pudo actualizar. Intenta de nuevo en unos segundos.')
    const current = entry
    const generation = current.generation
    const controller = new AbortController()
    current.controller = controller
    current.snapshot = { ...current.snapshot, fetching: true }
    const valid = () => this.entries.get(key) === current && current.generation === generation && !controller.signal.aborted
    const pending = Promise.resolve().then(() => loader(controller.signal)).then(data => {
      if (!valid()) throw new DOMException('Consulta reemplazada', 'AbortError')
      current.snapshot = { data, updatedAt: this.now(), fetching: false }
      current.failures = 0
      current.retryAt = 0
      return data
    }).catch(error => {
      if (valid()) {
        const err = error instanceof Error ? error : new Error('No se pudieron actualizar los datos')
        current.failures++
        current.retryAt = this.now() + Math.max(error instanceof QueryError ? error.retryAfter : 0, Math.min(60_000, 1000 * 2 ** (current.failures - 1)))
        current.snapshot = { ...current.snapshot, error: err, fetching: false }
        if (error instanceof QueryError && (error.status === 401 || error.status === 403)) current.snapshot.data = undefined
      }
      throw error
    }).finally(() => {
      if (valid()) { current.pending = undefined; this.emit(key); this.prune() }
    })
    current.pending = pending
    this.emit(key)
    return pending
  }
  invalidate(matches: (key: string) => boolean) {
    for (const [key, entry] of this.entries) if (matches(key)) {
      entry.generation++
      entry.controller?.abort()
      entry.pending = undefined
      entry.retryAt = 0
      // Remove old data: an older request must never restore a pre-mutation snapshot.
      entry.snapshot = { updatedAt: 0, fetching: false }
      this.emit(key)
    }
  }
  clear() {
    const keys = [...this.entries.keys()]
    for (const entry of this.entries.values()) entry.controller?.abort()
    this.entries.clear()
    for (const key of keys) this.emit(key)
  }
  refreshable(focus = false) {
    return [...this.entries].filter(([key, e]) => this.active(key) && !e.pending && this.now() >= e.retryAt &&
      (focus ? this.now() - e.snapshot.updatedAt >= e.policy.staleTime :
        !!e.policy.poll && this.now() - e.snapshot.updatedAt >= e.policy.poll || this.now() - e.snapshot.updatedAt >= e.policy.maxAge))
      .map(([key]) => key)
  }
  errors() { return [...this.entries].filter(([key, e]) => this.active(key) && e.snapshot.error).map(([, e]) => e.snapshot.error!) }
  expired() { return [...this.entries].some(([key, e]) => this.active(key) && e.snapshot.data !== undefined && this.now() - e.snapshot.updatedAt >= e.policy.maxAge) }
  prune() {
    const inactive = [...this.entries].filter(([key, e]) => !this.active(key) && !e.pending).sort((a, b) => a[1].touched - b[1].touched)
    for (const [index, [key, e]] of inactive.entries()) {
      if (this.now() - e.touched >= 600_000 || index < inactive.length - 100) this.entries.delete(key)
    }
  }
  get size() { return this.entries.size }
}
