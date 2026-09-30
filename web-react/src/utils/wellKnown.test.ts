import { describe, it, expect } from 'vitest'
import { proxyWellKnown } from './wellKnown'

// The Pages Function's work: the Worker's file, on this domain, as JSON.
describe('proxyWellKnown', () => {
  const worker = (status: number, body: string, seen: string[] = []) =>
    (async (url: string | URL | Request) => { seen.push(String(url)); return new Response(body, { status, headers: { 'content-type': 'text/plain' } }) }) as typeof fetch

  it('hands back the Worker\'s file as JSON', async () => {
    const seen: string[] = []
    const res = await proxyWellKnown('apple-app-site-association', 'https://api.example.com/', worker(200, '{"applinks":{}}', seen))
    expect(seen).toEqual(['https://api.example.com/.well-known/apple-app-site-association'])
    expect(res!.status).toBe(200)
    expect(res!.headers.get('content-type')).toBe('application/json')
    expect(await res!.text()).toBe('{"applinks":{}}')
  })

  it('asks the production Worker when no host is set', async () => {
    const seen: string[] = []
    await proxyWellKnown('assetlinks.json', undefined, worker(200, '[]', seen))
    expect(seen).toEqual(['https://tiktokforwork.torubj0904.workers.dev/.well-known/assetlinks.json'])
  })

  it('is a 404 when the Worker has nothing, and a 502 when it is down', async () => {
    expect((await proxyWellKnown('assetlinks.json', 'h.example', worker(404, 'no')))!.status).toBe(404)
    expect((await proxyWellKnown('assetlinks.json', 'h.example', worker(503, 'no')))!.status).toBe(502)
    const down = (async () => { throw new Error('offline') }) as typeof fetch
    expect((await proxyWellKnown('assetlinks.json', 'h.example', down))!.status).toBe(502)
  })

  it('leaves other names to the static files', async () => {
    expect(await proxyWellKnown('security.txt', 'h.example', worker(200, 'x'))).toBeNull()
  })
})
