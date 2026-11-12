import './style.css'
import { waitForEvenAppBridge, type EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { demoAccounts, mergeResults, parseImport, type ImportResult } from './importers'
import { GlassesUI } from './glasses'
import { PhoneUI, type AccountView } from './phone'
import { base64Blob, isImage, readQr } from './qr'
import { launchUrl, type Source } from './sources'
import { VaultStore } from './storage'
import { generateCode, normalizeAccount, type Account, type AccountSeed } from './totp'

function accountKey(account: Account): string {
  return `${account.secret}|${account.issuer.toLowerCase()}|${account.name.toLowerCase()}`
}

function mergeAccounts(...groups: Account[][]): Account[] {
  const map = new Map<string, Account>()
  for (const group of groups) {
    for (const account of group) {
      const key = accountKey(account)
      if (!map.has(key)) map.set(key, account)
    }
  }
  return [...map.values()]
}

function waitForBridge(ms: number): Promise<EvenAppBridge | null> {
  return Promise.race([
    waitForEvenAppBridge().catch(() => null),
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), ms)),
  ])
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {}

  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

function openExternal(url: string): void {
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.rel = 'noopener noreferrer'
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } catch {}
}

class App {
  private store = new VaultStore(null)
  private phone: PhoneUI
  private glasses: GlassesUI | null = null
  private bridge: EvenAppBridge | null = null
  private accounts: Account[] = []
  private views = new Map<string, AccountView>()
  private selectedIndex = 0
  private hidden = false
  private linked = false
  private ticking = false
  private timer: number | undefined
  private demo = new URLSearchParams(location.search).has('demo')

  constructor() {
    this.phone = new PhoneUI({
      importText: (text) => this.importText(text),
      importFiles: (files) => this.importFiles(files),
      loadDemo: () => void this.loadDemo(),
      select: (id) => this.select(id),
      toggleHidden: () => this.toggleHidden(),
      copy: (account, code) => void this.copy(account, code),
      remove: (id) => void this.remove(id),
      clearAll: () => void this.clearAll(),
      pushToLens: () => this.pushToLens(),
      openApp: (source) => this.openApp(source),
      addAccount: (seed) => this.addAccount(seed),
      scanText: (text) => this.apply(parseImport(text), 'Added'),
      capture: (kind) => this.capture(kind),
    })
  }

  async boot(): Promise<void> {
    this.phone.setStatus('idle', 'CONNECTING')
    this.phone.setSource('LOCAL ONLY')

    try {
      const accounts = await this.store.loadAccounts()
      const prefs = await this.store.loadPrefs()
      this.accounts = accounts
      this.hidden = prefs.hidden
      this.selectedIndex =
        accounts.length === 0 ? 0 : Math.min(Math.max(0, prefs.selectedIndex), accounts.length - 1)
    } catch {}

    if (this.demo) {
      this.accounts = demoAccounts()
      this.selectedIndex = 0
    }

    if (this.accounts.length > 0) this.phone.setSource('SAVED VAULT')
    this.phone.render(this.accounts, this.selectedIndex, this.hidden)
    if (this.accounts.length === 0) this.phone.openImportSheet()
    this.phone.setStatus('idle', 'PHONE ONLY')
    await this.tick()
    this.timer = window.setInterval(() => void this.tick(), 1000)

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void this.tick()
    })

    void this.connectGlasses()
  }

  private async connectGlasses(): Promise<void> {
    const bridge = await waitForBridge(6000)
    if (!bridge) return

    this.bridge = bridge
    this.store.attachBridge(bridge)

    try {
      const remote = await this.store.loadAccounts()
      if (remote.length > 0 && !this.demo) {
        const merged = mergeAccounts(remote, this.accounts)
        if (merged.length !== this.accounts.length) {
          this.accounts = merged
          this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.accounts.length - 1))
          this.phone.render(this.accounts, this.selectedIndex, this.hidden)
          await this.store.saveAccounts(this.accounts)
        }
      } else if (this.accounts.length > 0) {
        await this.store.saveAccounts(this.accounts)
      }

      const prefs = await this.store.loadPrefs()
      if (!this.demo && (prefs.hidden || prefs.selectedIndex > 0)) {
        this.hidden = prefs.hidden
        this.selectedIndex =
          this.accounts.length === 0
            ? 0
            : Math.min(Math.max(0, prefs.selectedIndex), this.accounts.length - 1)
        this.phone.render(this.accounts, this.selectedIndex, this.hidden)
      }
    } catch {}

    await this.startGlasses(bridge)
  }

  private async startGlasses(bridge: EvenAppBridge): Promise<void> {
    if (this.glasses) {
      this.glasses.dispose()
      this.glasses = null
    }

    const glasses = new GlassesUI(bridge, {
      onToggleHidden: () => this.toggleHidden(),
      onExit: () => {
        glasses.dispose()
        if (this.glasses === glasses) this.glasses = null
        this.linked = false
        this.phone.setStatus('idle', 'LENS CLOSED')
      },
    })

    const ok = await glasses.start(this.glassesState())
    if (!ok) {
      glasses.dispose()
      this.phone.setStatus('idle', 'LENS OFFLINE')
      return
    }

    this.glasses = glasses
    this.linked = true
    this.phone.setStatus('live', 'LENS LINKED')
    await this.tick()
  }

  private glassesState() {
    return {
      rows: [...this.views.values()],
      selectedIndex: this.selectedIndex,
      hidden: this.hidden,
    }
  }

  private async tick(): Promise<void> {
    if (this.ticking) return
    this.ticking = true

    try {
      const now = Date.now()
      const views: AccountView[] = []

      for (const account of this.accounts) {
        try {
          const view = await generateCode(account, now)
          views.push({
            account,
            code: view.code,
            remaining: view.remaining,
            progress: view.progress,
          })
        } catch {
          const period = account.period
          const remaining = period - (Math.floor(now / 1000) % period)
          views.push({
            account,
            code: '------',
            remaining,
            progress: remaining / period,
          })
        }
      }

      this.views = new Map(views.map((view) => [view.account.id, view]))
      this.phone.setViews(views, this.hidden)
      this.glasses?.render(this.glassesState())
    } finally {
      this.ticking = false
    }
  }

  private select(id: string): void {
    const index = this.accounts.findIndex((account) => account.id === id)
    if (index < 0) return
    this.selectedIndex = index
    this.phone.selectVisual(index)
    this.glasses?.focusAccount(index)
    void this.persistPrefs()
  }

  private toggleHidden(): void {
    this.hidden = !this.hidden
    this.phone.setViews([...this.views.values()], this.hidden)
    this.glasses?.render(this.glassesState())
    this.phone.toast(this.hidden ? 'Codes hidden' : 'Codes revealed')
    void this.persistPrefs()
  }

  private async copy(account: Account, code: string): Promise<void> {
    const ok = await copyText(code.replace(/\s/g, ''))
    this.phone.toast(ok ? `Copied ${account.issuer || 'code'}` : 'Copy failed', ok ? 'success' : 'danger')
  }

  private async remove(id: string): Promise<void> {
    const account = this.accounts.find((entry) => entry.id === id)
    if (!account) return

    this.accounts = this.accounts.filter((entry) => entry.id !== id)
    this.views.delete(id)
    this.selectedIndex =
      this.accounts.length === 0 ? 0 : Math.min(this.selectedIndex, this.accounts.length - 1)

    this.phone.render(this.accounts, this.selectedIndex, this.hidden)
    this.glasses?.render(this.glassesState())
    await this.persistAccounts()
    this.phone.toast(`Removed ${account.issuer || account.name}`)
  }

  private async clearAll(): Promise<void> {
    this.accounts = []
    this.views.clear()
    this.selectedIndex = 0
    this.phone.render(this.accounts, this.selectedIndex, this.hidden)
    this.glasses?.render(this.glassesState())
    this.phone.setSource('LOCAL ONLY')
    await this.persistAccounts()
    this.phone.toast('Vault cleared')
  }

  private async loadDemo(): Promise<void> {
    this.accounts = demoAccounts()
    this.views.clear()
    this.selectedIndex = 0
    this.hidden = false
    this.phone.render(this.accounts, this.selectedIndex, this.hidden)
    this.phone.setSource('DEMO VAULT')
    this.phone.setStatus(this.linked ? 'live' : 'demo', this.linked ? 'LENS LINKED' : 'DEMO MODE')
    await this.persistAccounts()
    await this.tick()
    this.phone.toast('Demo vault loaded', 'success')
  }

  private async readFile(file: File): Promise<ImportResult> {
    const fail = (warning: string) => ({ ...parseImport(''), warnings: [warning] })
    if (file.size > 10 * 1024 * 1024) return fail(`${file.name} is too large`)
    if (isImage(file)) {
      const text = await readQr(file).catch(() => null)
      return text ? parseImport(text) : fail(`No QR code found in ${file.name}`)
    }
    return parseImport(await file.text())
  }

  private async importFiles(files: File[]): Promise<void> {
    this.phone.toast(files.length > 1 ? `Reading ${files.length} files` : 'Reading file')
    const results = await Promise.all(files.map((file) => this.readFile(file).catch(() => ({ ...parseImport(''), warnings: [`Could not read ${file.name}`] }))))
    await this.apply(mergeResults(results))
  }

  private async addAccount(seed: AccountSeed): Promise<boolean> {
    const account = normalizeAccount(seed)
    if (!account) {
      this.phone.toast('That setup key is not valid', 'danger')
      return false
    }
    await this.apply({ accounts: [account], source: 'Manual entry', skipped: 0, warnings: [] }, 'Added')
    return true
  }

  private async capture(kind: 'camera' | 'album'): Promise<Blob | null> {
    if (!this.bridge) return null
    const asset =
      kind === 'camera' ? await this.bridge.captureImageFromCamera() : await this.bridge.pickImageFromAlbum()
    return asset?.base64 ? base64Blob(asset.base64, asset.mimeType) : null
  }

  private async importText(text: string): Promise<void> {
    await this.apply(parseImport(text))
  }

  private async apply(result: ImportResult, verb = 'Imported'): Promise<void> {
    if (result.accounts.length === 0) {
      this.phone.toast(result.warnings[0] ?? 'No codes found', 'danger')
      return
    }

    const existing = new Set(this.accounts.map(accountKey))
    const incoming = result.accounts.filter((account) => !existing.has(accountKey(account)))
    const duplicates = result.accounts.length - incoming.length

    if (incoming.length === 0) {
      this.phone.dismissSheets()
      this.phone.toast('All of those codes are already in your vault')
      return
    }

    this.accounts = [...this.accounts, ...incoming]
    this.selectedIndex = this.accounts.length - incoming.length

    this.phone.render(this.accounts, this.selectedIndex, this.hidden)
    this.phone.setSource(result.source.toUpperCase().slice(0, 24))
    this.phone.setStatus(this.linked ? 'live' : 'idle', this.linked ? 'LENS LINKED' : 'PHONE ONLY')
    this.phone.dismissSheets()

    await this.persistAccounts()
    await this.persistPrefs()
    await this.tick()

    const bits = [`${verb} ${incoming.length} ${incoming.length === 1 ? 'code' : 'codes'}`]
    if (duplicates > 0) bits.push(`${duplicates} duplicate${duplicates === 1 ? '' : 's'} skipped`)
    if (result.skipped > 0) bits.push(`${result.skipped} unsupported skipped`)
    this.phone.toast(bits.join(' · '), 'success')
  }

  private pushToLens(): void {
    if (!this.glasses) {
      this.phone.toast('Lens not connected, open the Even app', 'danger')
      return
    }
    this.glasses.render(this.glassesState())
    this.phone.toast('Lens refreshed', 'success')
  }

  private openApp(source: Source): void {
    const url = launchUrl(source)
    if (!url) {
      this.phone.toast(`Open ${source.app} manually, then come back`)
      return
    }
    openExternal(url)
  }

  private async persistAccounts(): Promise<void> {
    const ok = await this.store.saveAccounts(this.accounts)
    if (!ok) this.phone.toast('Device storage unavailable', 'danger')
  }

  private async persistPrefs(): Promise<void> {
    await this.store.savePrefs({ selectedIndex: this.selectedIndex, hidden: this.hidden })
  }
}

const app = new App()
void app.boot()
