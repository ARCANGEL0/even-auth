import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mergeResults, parseImport } from '../src/importers'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

const cases: [string, string, number, number][] = [
  ['proton.json', 'Proton Authenticator', 1, 0],
  ['aegis.json', 'Aegis', 1, 1],
  ['twofas.2fas', '2FAS', 1, 0],
  ['bitwarden.json', 'Bitwarden', 2, 0],
  ['bw-auth.json', 'Bitwarden', 1, 0],
  ['lastpass.json', 'LastPass Authenticator', 1, 0],
  ['stratum.json', 'Stratum', 1, 0],
  ['freeotp.json', 'FreeOTP+', 1, 0],
  ['andotp.json', 'andOTP', 2, 0],
  ['raivo.json', 'Raivo OTP', 1, 0],
  ['google.txt', 'Google Authenticator', 2, 1],
  ['ente.txt', 'otpauth links', 2, 0],
]

describe('parseImport', () => {
  it.each(cases)('reads %s', (file, source, count, skipped) => {
    const result = parseImport(fixture(file))
    expect(result.source).toBe(source)
    expect(result.accounts).toHaveLength(count)
    expect(result.skipped).toBe(skipped)
  })

  it.each(['aegis-enc.json', 'twofas-enc.2fas'])('flags encrypted %s', (file) => {
    const result = parseImport(fixture(file))
    expect(result.accounts).toHaveLength(0)
    expect(result.warnings[0]).toMatch(/encrypted/)
  })

  it('decodes Google migration payloads', () => {
    const { accounts } = parseImport(fixture('google.txt'))
    const github = accounts.find((account) => account.issuer === 'GitHub')
    expect(github).toMatchObject({ name: 'octo', algorithm: 'SHA256', digits: 8, secret: 'GEZDGNBVGY3TQOJQ' })
    expect(accounts.find((account) => account.issuer === 'Google')?.name).toBe('alice@gmail.com')
  })

  it('converts FreeOTP+ byte secrets', () => {
    expect(parseImport(fixture('freeotp.json')).accounts[0].secret).toBe('JBSWY3DPEHPK3PXP')
  })

  it('splits andOTP labels without an issuer', () => {
    const kraken = parseImport(fixture('andotp.json')).accounts.find((account) => account.issuer === 'Kraken')
    expect(kraken?.name).toBe('trader')
  })

  it('parses otpauth links in free text', () => {
    const text = 'key: otpauth://totp/Acme:jo%40acme.io?secret=JBSWY3DPEHPK3PXP&issuer=Acme&period=60 end'
    expect(parseImport(text).accounts[0]).toMatchObject({ issuer: 'Acme', name: 'jo@acme.io', period: 60 })
  })

  it('rejects unrelated input', () => {
    expect(parseImport('hello world').accounts).toHaveLength(0)
    expect(parseImport('{"foo":1}').warnings).not.toHaveLength(0)
  })
})

describe('mergeResults', () => {
  it('dedupes across sources', () => {
    const merged = mergeResults([parseImport(fixture('aegis.json')), parseImport(fixture('aegis.json')), parseImport(fixture('raivo.json'))])
    expect(merged.accounts).toHaveLength(2)
    expect(merged.source).toBe('Multiple sources')
  })
})
