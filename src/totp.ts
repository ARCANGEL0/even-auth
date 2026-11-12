import { decodeBase32, normalizeBase32 } from './base32'

export type OtpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512'

export interface Account {
  id: string
  issuer: string
  name: string
  secret: string
  algorithm: OtpAlgorithm
  digits: number
  period: number
}

export interface CodeView {
  code: string
  remaining: number
  progress: number
  period: number
}

const CRYPTO_ALGORITHMS: Record<OtpAlgorithm, string> = {
  SHA1: 'SHA-1',
  SHA256: 'SHA-256',
  SHA512: 'SHA-512',
}

const keyCache = new Map<string, Promise<CryptoKey>>()
const codeCache = new Map<string, { counter: number; code: string }>()

export function normalizeAlgorithm(value: string | undefined | null): OtpAlgorithm {
  const raw = (value ?? 'SHA1').toUpperCase().replace(/[-_]/g, '')
  if (raw === 'SHA256') return 'SHA256'
  if (raw === 'SHA512') return 'SHA512'
  return 'SHA1'
}

export function clampDigits(value: number | string | undefined | null): number {
  const digits = typeof value === 'string' ? Number.parseInt(value, 10) : value
  if (!digits || Number.isNaN(digits) || digits < 4 || digits > 10) return 6
  return Math.round(digits)
}

export function clampPeriod(value: number | string | undefined | null): number {
  const period = typeof value === 'string' ? Number.parseInt(value, 10) : value
  if (!period || Number.isNaN(period) || period < 5 || period > 300) return 30
  return Math.round(period)
}

export function makeAccountId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `acct_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function counterBytes(counter: number) {
  const buffer = new Uint8Array(8)
  let value = counter
  for (let i = 7; i >= 0; i--) {
    buffer[i] = value & 0xff
    value = Math.floor(value / 256)
  }
  return buffer
}

function getKey(account: Account): Promise<CryptoKey> {
  const cacheKey = `${account.algorithm}:${account.secret}`
  const cached = keyCache.get(cacheKey)
  if (cached) return cached

  const promise = (async () => {
    const raw = decodeBase32(account.secret)
    return crypto.subtle.importKey(
      'raw',
      raw,
      { name: 'HMAC', hash: CRYPTO_ALGORITHMS[account.algorithm] },
      false,
      ['sign'],
    )
  })()

  keyCache.set(cacheKey, promise)
  return promise
}

export async function generateCode(account: Account, now = Date.now()): Promise<CodeView> {
  const period = clampPeriod(account.period)
  const digits = clampDigits(account.digits)
  const epochSeconds = Math.floor(now / 1000)
  const counter = Math.floor(epochSeconds / period)
  const remaining = period - (epochSeconds % period)
  const progress = remaining / period

  const key = await getKey(account)
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, counterBytes(counter)),
  )

  const offset = signature[signature.length - 1] & 0x0f
  const binary =
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff)

  const code = String(binary % 10 ** digits).padStart(digits, '0')

  const cacheKey = `${account.id}:${digits}:${period}`
  const cached = codeCache.get(cacheKey)
  if (!cached || cached.counter !== counter) {
    codeCache.set(cacheKey, { counter, code })
  }

  return {
    code: codeCache.get(cacheKey)?.code ?? code,
    remaining,
    progress,
    period,
  }
}

export function formatCode(code: string): string {
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`
  return code.replace(/(.{3})/g, '$1 ').trim()
}

export function maskCode(code: string, dot = '●'): string {
  return formatCode(code)
    .split('')
    .map((char) => (char === ' ' ? ' ' : dot))
    .join('')
}

export type AccountSeed = Partial<Omit<Account, 'algorithm' | 'digits' | 'period'>> & {
  algorithm?: string
  digits?: number | string
  period?: number | string
}

export function normalizeAccount(partial: AccountSeed): Account | null {
  const secret = normalizeBase32(partial.secret ?? '')
  if (!secret || !/^[A-Z2-7]+$/.test(secret) || secret.length < 8) return null

  const issuer = (partial.issuer ?? '').trim() || 'Account'
  const name = (partial.name ?? '').trim() || issuer

  return {
    id: partial.id || makeAccountId(),
    issuer,
    name,
    secret,
    algorithm: normalizeAlgorithm(partial.algorithm),
    digits: clampDigits(partial.digits),
    period: clampPeriod(partial.period),
  }
}
