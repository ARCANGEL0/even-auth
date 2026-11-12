const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function normalizeBase32(input: string): string {
  return input.replace(/[\s\-_=]/g, '').toUpperCase()
}

export function isLikelyBase32(input: string): boolean {
  const clean = normalizeBase32(input)
  return clean.length >= 8 && /^[A-Z2-7]+$/.test(clean)
}

export function decodeBase32(input: string) {
  const clean = normalizeBase32(input)
  if (!clean || !/^[A-Z2-7]+$/.test(clean)) {
    throw new Error('Invalid base32 secret')
  }

  const out = new Uint8Array(Math.floor((clean.length * 5) / 8))
  let bits = 0
  let value = 0
  let index = 0

  for (const char of clean) {
    value = (value << 5) | ALPHABET.indexOf(char)
    bits += 5
    if (bits >= 8) {
      out[index++] = (value >>> (bits - 8)) & 0xff
      bits -= 8
    }
  }

  return out
}

export function encodeBase32(bytes: Uint8Array): string {
  let out = ''
  let bits = 0
  let value = 0

  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }

  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}
