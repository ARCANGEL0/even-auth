import { encodeBase32 } from './base32'
import { normalizeAccount, type Account } from './totp'

const algorithms = ['SHA1', 'SHA1', 'SHA256', 'SHA512', 'MD5']

type Field = { tag: number; value: number | Uint8Array }

function readVarint(buf: Uint8Array, pos: number): [number, number] {
  let result = 0
  let shift = 0
  while (pos < buf.length) {
    const byte = buf[pos++]
    result += (byte & 0x7f) * 2 ** shift
    if ((byte & 0x80) === 0) return [result, pos]
    shift += 7
  }
  throw new Error('Truncated varint')
}

function readFields(buf: Uint8Array): Field[] {
  const fields: Field[] = []
  let pos = 0

  while (pos < buf.length) {
    const [key, next] = readVarint(buf, pos)
    pos = next
    const tag = Math.floor(key / 8)
    const wire = key & 7

    if (wire === 0) {
      const [value, after] = readVarint(buf, pos)
      fields.push({ tag, value })
      pos = after
    } else if (wire === 2) {
      const [len, after] = readVarint(buf, pos)
      fields.push({ tag, value: buf.subarray(after, after + len) })
      pos = after + len
    } else if (wire === 1) {
      pos += 8
    } else if (wire === 5) {
      pos += 4
    } else {
      throw new Error('Unsupported wire type')
    }
  }

  return fields
}

function decodeParams(buf: Uint8Array): Account | null {
  const text = new TextDecoder()
  let secret: Uint8Array = new Uint8Array()
  let name = ''
  let issuer = ''
  let algo = 1
  let digits = 1
  let type = 2

  for (const { tag, value } of readFields(buf)) {
    if (tag === 1 && value instanceof Uint8Array) secret = value
    else if (tag === 2 && value instanceof Uint8Array) name = text.decode(value)
    else if (tag === 3 && value instanceof Uint8Array) issuer = text.decode(value)
    else if (tag === 4 && typeof value === 'number') algo = value
    else if (tag === 5 && typeof value === 'number') digits = value
    else if (tag === 6 && typeof value === 'number') type = value
  }

  if (type !== 2 || secret.length === 0) return null

  if (issuer && name.toLowerCase().startsWith(`${issuer.toLowerCase()}:`)) {
    name = name.slice(issuer.length + 1).trim()
  } else if (!issuer && name.includes(':')) {
    const index = name.indexOf(':')
    issuer = name.slice(0, index).trim()
    name = name.slice(index + 1).trim()
  }

  return normalizeAccount({
    issuer,
    name,
    secret: encodeBase32(secret),
    algorithm: algorithms[algo] ?? 'SHA1',
    digits: digits === 2 ? 8 : 6,
    period: 30,
  })
}

function decodeData(data: string): Uint8Array {
  const clean = decodeURIComponent(data).replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '')
  const bin = atob(clean)
  return Uint8Array.from(bin, (char) => char.charCodeAt(0))
}

export function parseMigrationUri(uri: string): { accounts: Account[]; skipped: number } {
  const match = /[?&]data=([^&\s]+)/i.exec(uri)
  if (!match) return { accounts: [], skipped: 1 }

  const accounts: Account[] = []
  let skipped = 0

  try {
    for (const { tag, value } of readFields(decodeData(match[1]))) {
      if (tag !== 1 || !(value instanceof Uint8Array)) continue
      const account = decodeParams(value)
      if (account) accounts.push(account)
      else skipped++
    }
  } catch {
    skipped++
  }

  return { accounts, skipped }
}
