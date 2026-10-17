// Run in the authenticated preview's evaluator, behind the LOCAL measurement proxy.
// Read-only navigation. Only aggregate timing/size data is retained, never API bodies.
window.__crmBench = { samples: [], done: false, error: null }
window.__crmBenchRun = async function (rounds = 20) {
  const routes = [
    ['/', '.dash-hello'],
    ['/contactos', '.empty-state, .contacts-table'],
    ['/leads', '.empty-state, .leads-table, .leads-board'],
    ['/recordatorios', '.empty-state, .rem-group'],
  ]
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  const visible = selector => [...document.querySelectorAll(`main ${selector.split(', ').join(', main ')}`)].some(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
  try {
    for (let round = 0; round < rounds; round++) for (const [route, selector] of routes) {
      if (location.pathname === route) continue
      const link = [...document.querySelectorAll(`a[href="${route}"]`)].find(el => el.getClientRects().length)
      if (!link) throw new Error(`No visible navigation link: ${route}`)
      const start = performance.now()
      link.click()
      while (location.pathname !== route || !visible(selector)) {
        if (performance.now() - start > 30000) throw new Error(`Navigation timeout: ${route}`)
        await sleep(10)
      }
      await new Promise(requestAnimationFrame)
      const readyMs = performance.now() - start
      // Give asynchronous revalidations time to appear; keep traffic moderate.
      await sleep(Math.max(1500, 2100 - readyMs))
      const requests = performance.getEntriesByType('resource').filter(e => e.startTime >= start && new URL(e.name).pathname.startsWith('/api/'))
      window.__crmBench.samples.push({ round, route, readyMs, requests: requests.map(e => ({ route: new URL(e.name).pathname, durationMs: e.duration, transferBytes: e.transferSize, status: e.responseStatus, serverTiming: e.serverTiming.map(t => ({ name: t.name, duration: t.duration })) })), overflow: document.documentElement.scrollWidth > innerWidth })
    }
  } catch (error) { window.__crmBench.error = error.message }
  window.__crmBench.done = true
}
