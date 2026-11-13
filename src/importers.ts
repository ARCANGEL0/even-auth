import { encodeBase32, isLikelyBase32 } from './base32'
import { parseMigrationUri } from './migration'
import { normalizeAccount, type Account } from './totp'

export interface ImportResult {
  accounts: Account[]
  source: string
  skipped: number
  warnings: string[]
}

const EMPTY_RESULT: ImportResult = {
  accounts: [],
  source: 'unknown',
  skipped: 0,
  warnings: [],
}

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

export function parseOtpauthUri(uri: string): Account | null {
  try {
    const url = new URL(uri.trim())
    if (url.protocol.toLowerCase() !== 'otpauth:') return null
    if (url.host.toLowerCase() !== 'totp') return null

    const params = url.searchParams
    const secret = params.get('secret') ?? ''
    if (!isLikelyBase32(secret)) return null

    let label = decodeURIComponent(url.pathname.replace(/^\/+/, '')).trim()
    let issuer = (params.get('issuer') ?? '').trim()

    if (!issuer && label.includes(':')) {
      const index = label.indexOf(':')
      issuer = label.slice(0, index).trim()
      label = label.slice(index + 1).trim()
    } else if (issuer && label.toLowerCase().startsWith(`${issuer.toLowerCase()}:`)) {
      label = label.slice(issuer.length + 1).trim()
    }

    const name = label || issuer || 'Account'
    return normalizeAccount({
      issuer: issuer || 'Account',
      name,
      secret,
      algorithm: params.get('algorithm') ?? undefined,
      digits: params.get('digits') ?? undefined,
      period: params.get('period') ?? undefined,
    })
  } catch {
    return null
  }
}

function accountFromFields(fields: {
  issuer?: unknown
  name?: unknown
  secret?: unknown
  algorithm?: unknown
  digits?: unknown
  period?: unknown
}): Account | null {
  const secret = pickString(fields.secret)
  if (!secret || !isLikelyBase32(secret)) return null

  let issuer = pickString(fields.issuer) ?? ''
  let name = pickString(fields.name) ?? ''

  if (!issuer && name.includes(':')) {
    const index = name.indexOf(':')
    issuer = name.slice(0, index).trim()
    name = name.slice(index + 1).trim()
  } else if (issuer && name.toLowerCase().startsWith(`${issuer.toLowerCase()}:`)) {
    name = name.slice(issuer.length + 1).trim()
  }

  return normalizeAccount({
    issuer: issuer || 'Account',
    name: name || issuer || 'Account',
    secret,
    algorithm: pickString(fields.algorithm),
    digits: pickString(fields.digits),
    period: pickString(fields.period),
  })
}

type Parsed = { accounts: Account[]; skipped: number }
type Parser = { source: string; parse: (data: unknown) => Parsed | null; locked?: (data: unknown) => boolean }

function collect<T>(items: unknown[], map: (item: JsonRecord) => Account | null | undefined): Parsed {
  const accounts: Account[] = []
  let skipped = 0

  for (const item of items) {
    const account = isRecord(item) ? map(item) : null
    if (account) accounts.push(account)
    else if (account !== undefined) skipped++
  }

  return { accounts, skipped }
}

function fromUri(uri: unknown): Account | null {
  const text = pickString(uri)
  return text && /^otpauth:/i.test(text) ? parseOtpauthUri(text) : null
}

function bytesToBase32(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined
  return encodeBase32(Uint8Array.from(value.map((byte) => Number(byte) & 0xff)))
}

const stratumAlgos = ['SHA1', 'SHA256', 'SHA512']

const parsers: Parser[] = [
  {
    source: 'Proton Authenticator',
    locked: (data) =>
      isRecord(data) &&
      data.version !== undefined &&
      typeof data.salt === 'string' &&
      typeof data.content === 'string',
    parse: (data) => {
      if (!isRecord(data) || !Array.isArray(data.entries) || data.version === undefined) return null
      return collect(data.entries, (entry) => {
        const content = isRecord(entry.content) ? entry.content : entry
        const parsed = fromUri(pickString(content.uri, content.otpauth, content.totp, entry.uri))
        if (parsed) return parsed
        return accountFromFields(content)
      })
    },
  },
  {
    source: 'Aegis',
    locked: (data) => isRecord(data) && typeof data.db === 'string',
    parse: (data) => {
      if (!isRecord(data) || !isRecord(data.db) || !Array.isArray(data.db.entries)) return null
      return collect(data.db.entries, (entry) => {
        if (String(entry.type ?? 'totp').toLowerCase() !== 'totp') return null
        const info = isRecord(entry.info) ? entry.info : {}
        return accountFromFields({
          issuer: entry.issuer,
          name: entry.name,
          secret: info.secret,
          algorithm: info.algo,
          digits: info.digits,
          period: info.period,
        })
      })
    },
  },
  {
    source: '2FAS',
    locked: (data) => isRecord(data) && typeof data.servicesEncrypted === 'string',
    parse: (data) => {
      if (!isRecord(data) || !Array.isArray(data.services)) return null
      return collect(data.services, (service) => {
        const otp = isRecord(service.otp) ? service.otp : {}
        if (String(otp.tokenType ?? 'TOTP').toUpperCase() !== 'TOTP') return null
        return accountFromFields({
          issuer: otp.issuer ?? service.name,
          name: otp.account ?? otp.label ?? service.name,
          secret: service.secret,
          algorithm: otp.algorithm,
          digits: otp.digits,
          period: otp.period,
        })
      })
    },
  },
  {
    source: 'Bitwarden',
    locked: (data) => isRecord(data) && data.encrypted === true,
    parse: (data) => {
      if (!isRecord(data) || !Array.isArray(data.items)) return null
      const result = collect(data.items, (item) => {
        const login = isRecord(item.login) ? item.login : null
        const totp = login && pickString(login.totp)
        if (!totp) return undefined
        return fromUri(totp) ?? accountFromFields({ issuer: item.name, name: login.username, secret: totp })
      })
      return result.accounts.length + result.skipped > 0 ? result : null
    },
  },
  {
    source: 'LastPass Authenticator',
    parse: (data) => {
      if (!isRecord(data) || !Array.isArray(data.accounts)) return null
      return collect(data.accounts, (entry) =>
        accountFromFields({
          issuer: pickString(entry.issuerName, entry.originalIssuerName),
          name: pickString(entry.userName, entry.originalUserName),
          secret: entry.secret,
          algorithm: entry.algorithm,
          digits: entry.digits,
          period: entry.timeStep,
        }),
      )
    },
  },
  {
    source: 'Stratum',
    parse: (data) => {
      if (!isRecord(data) || !Array.isArray(data.Authenticators)) return null
      return collect(data.Authenticators, (entry) => {
        if (Number(entry.Type) !== 2) return null
        return accountFromFields({
          issuer: entry.Issuer,
          name: entry.Username,
          secret: entry.Secret,
          algorithm: stratumAlgos[Number(entry.Algorithm)] ?? 'SHA1',
          digits: entry.Digits,
          period: entry.Period,
        })
      })
    },
  },
  {
    source: 'FreeOTP+',
    parse: (data) => {
      if (!isRecord(data) || !Array.isArray(data.tokens)) return null
      return collect(data.tokens, (token) => {
        if (String(token.type ?? 'TOTP').toUpperCase() !== 'TOTP') return null
        return accountFromFields({
          issuer: token.issuerExt ?? token.issuerInt,
          name: token.label,
          secret: bytesToBase32(token.secret) ?? token.secret,
          algorithm: token.algo,
          digits: token.digits,
          period: token.period,
        })
      })
    },
  },
  {
    source: 'andOTP',
    parse: (data) => {
      if (!Array.isArray(data) || !data.some((item) => isRecord(item) && 'label' in item && 'secret' in item)) {
        return null
      }
      return collect(data, (entry) => {
        if (String(entry.type ?? 'TOTP').toUpperCase() !== 'TOTP') return null
        let issuer = pickString(entry.issuer)
        let name = pickString(entry.label)
        if (!issuer && name?.includes(' - ')) [issuer, name] = name.split(' - ', 2)
        return accountFromFields({ issuer, name, secret: entry.secret, algorithm: entry.algorithm, digits: entry.digits, period: entry.period })
      })
    },
  },
  {
    source: 'Raivo OTP',
    parse: (data) => {
      if (!Array.isArray(data) || !data.some((item) => isRecord(item) && 'kind' in item && 'secret' in item)) {
        return null
      }
      return collect(data, (entry) => {
        if (String(entry.kind ?? 'TOTP').toUpperCase() !== 'TOTP') return null
        return accountFromFields({
          issuer: entry.issuer,
          name: entry.account,
          secret: entry.secret,
          algorithm: entry.algorithm,
          digits: entry.digits,
          period: entry.timer,
        })
      })
    },
  },
]

function collectUris(value: unknown, output: Set<string>, depth = 0): void {
  if (depth > 12) return
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^otpauth(-migration)?:/i.test(trimmed)) output.add(trimmed)
  } else if (Array.isArray(value)) {
    for (const item of value) collectUris(item, output, depth + 1)
  } else if (isRecord(value)) {
    for (const item of Object.values(value)) collectUris(item, output, depth + 1)
  }
}

function fromUris(uris: Iterable<string>): Parsed & { google: boolean } {
  const accounts: Account[] = []
  let skipped = 0
  let google = false

  for (const uri of uris) {
    if (/^otpauth-migration:/i.test(uri)) {
      const result = parseMigrationUri(uri)
      accounts.push(...result.accounts)
      skipped += result.skipped
      google = true
      continue
    }
    const parsed = /^otpauth:\/\/totp\//i.test(uri) ? parseOtpauthUri(uri) : null
    if (parsed) accounts.push(parsed)
    else skipped++
  }

  return { accounts, skipped, google }
}

function finalize(accounts: Account[], source: string, skipped: number, warnings: string[] = []): ImportResult {
  const seen = new Set<string>()
  const unique = accounts.filter((account) => {
    const key = [account.secret, account.issuer, account.name, account.algorithm, account.digits, account.period]
      .join('|')
      .toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  unique.sort((a, b) => `${a.issuer} ${a.name}`.localeCompare(`${b.issuer} ${b.name}`, undefined, { sensitivity: 'base' }))
  return { accounts: unique, source, skipped, warnings }
}

function failure(source: string, warning: string): ImportResult {
  return { ...EMPTY_RESULT, source, warnings: [warning] }
}

export function parseImport(raw: string): ImportResult {
  const text = raw.trim()
  if (!text) return { ...EMPTY_RESULT }

  if (/^AUTHENTICATORPRO|^andotp/i.test(text)) {
    return failure('Encrypted backup', 'That backup is encrypted. Export it again without a password.')
  }

  const json = tryParseJson(text)

  if (json !== null) {
    for (const parser of parsers) {
      if (parser.locked?.(json)) {
        if (parser.source === 'Proton Authenticator') {
          return failure(
            parser.source,
            'This Proton Authenticator backup is encrypted. Export a plain-text JSON file from Settings → Export.',
          )
        }
        return failure(parser.source, `${parser.source} backup is encrypted. Export it again without a password.`)
      }
      const result = parser.parse(json)
      if (result && result.accounts.length + result.skipped > 0) {
        return finalize(result.accounts, parser.source, result.skipped)
      }
    }

    const uris = new Set<string>()
    collectUris(json, uris)
    const deep = fromUris(uris)
    if (deep.accounts.length + deep.skipped > 0) {
      return finalize(deep.accounts, deep.google ? 'Google Authenticator' : 'JSON export', deep.skipped)
    }

    return failure('JSON', 'No TOTP codes were found in that JSON file.')
  }

  const links = fromUris(text.match(/otpauth(-migration)?:\/\/[^\s"'<>\\,]+/gi) ?? [])
  if (links.accounts.length + links.skipped > 0) {
    return finalize(links.accounts, links.google ? 'Google Authenticator' : 'otpauth links', links.skipped)
  }

  return failure('text', 'No TOTP codes were found. Try an app export, a QR image, or otpauth:// links.')
}

export function mergeResults(results: ImportResult[]): ImportResult {
  const sources = [...new Set(results.filter((r) => r.accounts.length > 0).map((r) => r.source))]
  return finalize(
    results.flatMap((r) => r.accounts),
    sources.length === 1 ? sources[0] : sources.length > 1 ? 'Multiple sources' : 'unknown',
    results.reduce((sum, r) => sum + r.skipped, 0),
    results.flatMap((r) => r.warnings),
  )
}

export function demoAccounts(): Account[] {
  const raw = [
    ['Proton', 'you@proton.me', 'JBSWY3DPEHPK3PXP'],
    ['GitHub', 'octocat', 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'],
    ['Google', 'you@gmail.com', 'MZXW6YTBOI======'],
    ['Discord', 'nightowl', 'KRSXG5CTMVRXEZLUKRSXG5A='],
    ['AWS', 'root@company', 'ONSWG4TFORXW433VNZTGK3TU'],
    ['Figma', 'design@studio', 'NBSWY3DPO5XXE3DEEBRW63LQ'],
  ]

  return raw
    .map(([issuer, name, secret]) => normalizeAccount({ issuer, name, secret, algorithm: 'SHA1', digits: 6, period: 30 }))
    .filter((entry): entry is Account => entry !== null)
}
