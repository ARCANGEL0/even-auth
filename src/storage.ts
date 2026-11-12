import { normalizeAccount, type Account } from './totp'

const ACCOUNTS_KEY = 'proton2fa.accounts.v1'
const PREFS_KEY = 'proton2fa.prefs.v1'

export interface Prefs {
  selectedIndex: number
  hidden: boolean
}

export interface BridgeStorageLike {
  getLocalStorage(key: string): Promise<string>
  setLocalStorage(key: string, value: string): Promise<boolean>
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

export class VaultStore {
  constructor(private bridge: BridgeStorageLike | null) {}

  attachBridge(bridge: BridgeStorageLike | null): void {
    this.bridge = bridge
  }

  async loadAccounts(): Promise<Account[]> {
    const raw = await this.read(ACCOUNTS_KEY)
    if (!raw) return []

    try {
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return []

      return parsed
        .map((entry) => (typeof entry === 'object' && entry !== null ? normalizeAccount(entry) : null))
        .filter((entry): entry is Account => entry !== null)
    } catch {
      return []
    }
  }

  async saveAccounts(accounts: Account[]): Promise<boolean> {
    return this.write(ACCOUNTS_KEY, JSON.stringify(accounts))
  }

  async loadPrefs(): Promise<Prefs> {
    const raw = await this.read(PREFS_KEY)
    if (!raw) return { selectedIndex: 0, hidden: false }

    try {
      const parsed = JSON.parse(raw) as Partial<Prefs>
      return {
        selectedIndex:
          typeof parsed.selectedIndex === 'number' && Number.isFinite(parsed.selectedIndex)
            ? Math.max(0, Math.trunc(parsed.selectedIndex))
            : 0,
        hidden: parsed.hidden === true,
      }
    } catch {
      return { selectedIndex: 0, hidden: false }
    }
  }

  async savePrefs(prefs: Prefs): Promise<boolean> {
    return this.write(PREFS_KEY, JSON.stringify(prefs))
  }

  private async read(key: string): Promise<string> {
    if (this.bridge) {
      try {
        const value = await withTimeout(this.bridge.getLocalStorage(key), 4000, '')
        if (value) return value
      } catch {}
    }

    try {
      return window.localStorage.getItem(key) ?? ''
    } catch {
      return ''
    }
  }

  private async write(key: string, value: string): Promise<boolean> {
    if (this.bridge) {
      try {
        const ok = await withTimeout(this.bridge.setLocalStorage(key, value), 5000, false)
        if (ok) return true
      } catch {}
    }

    try {
      window.localStorage.setItem(key, value)
      return true
    } catch {
      return false
    }
  }
}
