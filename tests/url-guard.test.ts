/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test'
import { isFetchableUrl, partitionByFetchable } from '../src/lib/url-guard'

describe('url guard', () => {
  test('allows ordinary public http(s) URLs', () => {
    expect(isFetchableUrl('https://example.com/a')).toBe(true)
    expect(isFetchableUrl('http://www.forbes.com/news/x')).toBe(true)
    expect(isFetchableUrl('https://sub.domain.co.uk/path?q=1#h')).toBe(true)
  })

  test('rejects non-http schemes', () => {
    for (const u of ['file:///etc/passwd', 'ftp://x.com/a', 'javascript:alert(1)', 'data:text/html,<h1>x', 'gopher://x']) {
      expect(isFetchableUrl(u)).toBe(false)
    }
  })

  test('rejects loopback, private and link-local targets', () => {
    for (const u of [
      'http://localhost:3000/admin',
      'http://127.0.0.1/',
      'http://127.1.2.3/',
      'http://10.0.0.5/',
      'http://192.168.1.1/',
      'http://172.16.0.1/',
      'http://172.31.255.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://[::1]/',
      'http://metadata.google.internal/',
      'http://printer.local/',
      'http://box.localhost/',
    ]) {
      expect(isFetchableUrl(u)).toBe(false)
    }
  })

  test('rejects URLs carrying credentials', () => {
    expect(isFetchableUrl('https://user:pass@example.com/')).toBe(false)
  })

  test('rejects garbage', () => {
    expect(isFetchableUrl('')).toBe(false)
    expect(isFetchableUrl('not a url')).toBe(false)
    expect(isFetchableUrl('//example.com')).toBe(false)
  })

  test('partitions a mixed list', () => {
    const { ok, blocked } = partitionByFetchable(['https://a.com', 'file:///etc/passwd', 'http://10.0.0.1'])
    expect(ok).toEqual(['https://a.com'])
    expect(blocked).toEqual(['file:///etc/passwd', 'http://10.0.0.1'])
  })
})