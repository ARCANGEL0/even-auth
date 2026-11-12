import { describe, expect, it } from 'vitest'
import { decodeBase32, encodeBase32 } from '../src/base32'
import { formatCode, generateCode, maskCode, normalizeAccount, type OtpAlgorithm } from '../src/totp'

const ascii = (text: string) => encodeBase32(new TextEncoder().encode(text))

const seeds: Record<OtpAlgorithm, string> = {
  SHA1: ascii('12345678901234567890'),
  SHA256: ascii('12345678901234567890123456789012'),
  SHA512: ascii('1234567890'.repeat(6) + '1234'),
}

const vectors: [number, OtpAlgorithm, string][] = [
  [59, 'SHA1', '94287082'],
  [59, 'SHA256', '46119246'],
  [59, 'SHA512', '90693936'],
  [1111111109, 'SHA1', '07081804'],
  [1111111109, 'SHA256', '68084774'],
  [1234567890, 'SHA1', '89005924'],
  [2000000000, 'SHA512', '38618901'],
]

describe('generateCode', () => {
  it.each(vectors)('matches RFC 6238 at %i with %s', async (time, algorithm, expected) => {
    const account = normalizeAccount({ secret: seeds[algorithm], algorithm, digits: 8, period: 30 })
    const view = await generateCode(account!, time * 1000)
    expect(view.code).toBe(expected)
  })

  it('reports remaining seconds and progress', async () => {
    const account = normalizeAccount({ secret: seeds.SHA1 })
    const view = await generateCode(account!, 20_000)
    expect(view.remaining).toBe(10)
    expect(view.progress).toBeCloseTo(1 / 3)
  })
})

describe('base32', () => {
  it('round trips bytes', () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 251, 255, 128, 64, 32])
    expect(decodeBase32(encodeBase32(bytes))).toEqual(bytes)
  })

  it('ignores spaces, dashes and padding', () => {
    expect(decodeBase32('mzxw 6ytb-oi======')).toEqual(new TextEncoder().encode('foobar'))
  })
})

describe('normalizeAccount', () => {
  it('rejects invalid keys', () => {
    expect(normalizeAccount({ secret: 'not a key!' })).toBeNull()
    expect(normalizeAccount({ secret: 'ABC' })).toBeNull()
  })

  it('cleans user input', () => {
    const account = normalizeAccount({ issuer: ' GitHub ', secret: 'jbsw y3dp ehpk 3pxp' })
    expect(account).toMatchObject({ issuer: 'GitHub', name: 'GitHub', secret: 'JBSWY3DPEHPK3PXP', digits: 6, period: 30 })
  })
})

describe('formatting', () => {
  it('groups codes', () => {
    expect(formatCode('123456')).toBe('123 456')
    expect(formatCode('12345678')).toBe('1234 5678')
  })

  it('masks codes', () => {
    expect(maskCode('123456')).not.toContain('1')
  })
})
