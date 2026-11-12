import { AddSheet, type AddHandlers } from './add'
import { icons } from './icons'
import { acceptFor, sources, sourceById, type Source } from './sources'
import { formatCode, maskCode, type Account } from './totp'

export interface AccountView {
  account: Account
  code: string
  remaining: number
  progress: number
}

export interface PhoneHandlers extends Omit<AddHandlers, 'toast'> {
  importText(text: string): Promise<void>
  importFiles(files: File[]): Promise<void>
  loadDemo(): void
  select(id: string): void
  toggleHidden(): void
  copy(account: Account, code: string): void
  remove(id: string): void
  clearAll(): void
  pushToLens(): void
  openApp(source: Source): void
}

type StatusMode = 'idle' | 'live' | 'demo'

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  )
}

function initials(account: Account): string {
  const source = (account.issuer || account.name || '?').trim()
  return source.slice(0, 1).toUpperCase() || '?'
}

function truncated(text: string, max = 24): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

const LENS_RING_C = 2 * Math.PI * 15
const CARD_RING_C = 2 * Math.PI * 13

export class PhoneUI {
  private list = document.getElementById('account-list') as HTMLDivElement
  private empty = document.getElementById('empty-state') as HTMLDivElement
  private countBig = document.getElementById('count-big') as HTMLElement
  private countLabel = document.getElementById('count-label') as HTMLElement
  private vaultCount = document.getElementById('vault-count') as HTMLElement
  private hiddenToggle = document.getElementById('toggle-hidden') as HTMLButtonElement
  private sourceLabel = document.getElementById('source-label') as HTMLElement
  private status = document.getElementById('link-status') as HTMLElement
  private statusText = document.getElementById('link-status-text') as HTMLElement
  private lensCode = document.getElementById('lens-code') as HTMLElement
  private lensAccount = document.getElementById('lens-account') as HTMLElement
  private lensRing = document.querySelector<SVGCircleElement>('#lens-ring-value') as SVGCircleElement
  private lensRingLabel = document.getElementById('lens-ring-label') as HTMLElement
  private lensLock = document.getElementById('lens-lock') as HTMLElement
  private importSheet = document.getElementById('import-sheet') as HTMLElement
  private guideSheet = document.getElementById('guide-sheet') as HTMLElement
  private guideEyebrow = document.getElementById('guide-eyebrow') as HTMLElement
  private guideSteps = document.getElementById('guide-steps') as HTMLOListElement
  private guideNote = document.getElementById('guide-note') as HTMLElement
  private guidePick = document.getElementById('guide-pick') as HTMLButtonElement
  private guideOpen = document.getElementById('guide-open') as HTMLButtonElement
  private sourceGrid = document.getElementById('source-grid') as HTMLElement
  private addSheet = document.getElementById('add-sheet') as HTMLElement
  private add: AddSheet
  private pasteInput = document.getElementById('paste-input') as HTMLTextAreaElement
  private fileInput = document.getElementById('file-input') as HTMLInputElement
  private toastEl = document.getElementById('toast') as HTMLElement
  private dropOverlay = document.getElementById('drop-overlay') as HTMLElement
  private clearButton = document.getElementById('clear-all') as HTMLButtonElement

  private accounts: Account[] = []
  private views = new Map<string, AccountView>()
  private hidden = false
  private selectedIndex = 0
  private toastTimer: number | undefined
  private clearTimer: number | undefined
  private clearArmed = false
  private dragDepth = 0
  private source: Source | null = null

  constructor(private handlers: PhoneHandlers) {
    this.add = new AddSheet(
      this.addSheet,
      { ...handlers, toast: (message, tone) => this.toast(message, tone) },
      () => this.triggerFilePicker(null, 'image'),
    )
    this.renderSources()
    this.mountIcons()
    this.bind()
  }

  setStatus(mode: StatusMode, label: string): void {
    this.status.classList.toggle('live', mode === 'live')
    this.status.classList.toggle('demo', mode === 'demo')
    this.statusText.textContent = label
  }

  setSource(label: string): void {
    this.sourceLabel.textContent = label
  }

  render(accounts: Account[], selectedIndex: number, hidden: boolean): void {
    this.accounts = accounts
    this.hidden = hidden
    this.selectedIndex =
      accounts.length === 0 ? 0 : Math.min(Math.max(0, selectedIndex), accounts.length - 1)

    this.countBig.textContent = String(accounts.length)
    this.countLabel.textContent = accounts.length === 1 ? 'code' : 'codes'
    this.vaultCount.textContent = `${accounts.length} ${accounts.length === 1 ? 'CODE' : 'CODES'}`

    const empty = accounts.length === 0
    this.empty.hidden = !empty
    this.list.hidden = empty

    if (empty) {
      this.list.innerHTML = ''
      this.views.clear()
      this.renderLens()
      return
    }

    this.list.innerHTML = accounts
      .map((account, index) => {
        const view = this.views.get(account.id)
        const code = view?.code ?? '------'
        const remaining = view?.remaining ?? account.period
        const progress = view?.progress ?? 1
        const selected = index === this.selectedIndex
        const codeText = this.hidden ? maskCode(code) : formatCode(code)

        return `
          <article class="code-card${selected ? ' selected' : ''}" data-id="${escapeHtml(account.id)}" style="animation-delay:${Math.min(index, 6) * 35}ms">
            <div class="card-top">
              <div class="avatar">${escapeHtml(initials(account))}</div>
              <div class="meta">
                <strong>${escapeHtml(truncated(account.issuer || 'Account', 22))}</strong>
                <span>${escapeHtml(truncated(account.name, 26))}</span>
              </div>
              <div class="card-actions">
                <button class="icon-btn" data-action="copy" data-id="${escapeHtml(account.id)}" aria-label="Copy code">${icons.copy}</button>
                <button class="icon-btn danger" data-action="remove" data-id="${escapeHtml(account.id)}" aria-label="Remove code">${icons.trash}</button>
              </div>
            </div>
            <div class="card-code-row">
              <code class="code${this.hidden ? ' hidden' : ''}" data-code>${escapeHtml(codeText)}</code>
              <div class="card-ring">
                <svg viewBox="0 0 32 32" aria-hidden="true">
                  <circle class="card-ring-track" cx="16" cy="16" r="13" />
                  <circle class="card-ring-value" data-ring cx="16" cy="16" r="13" style="stroke-dashoffset:${CARD_RING_C * (1 - progress)}" />
                </svg>
                <span class="card-ring-label" data-count>${remaining}</span>
              </div>
            </div>
          </article>
        `
      })
      .join('')

    this.renderLens()
  }

  setViews(views: AccountView[], hidden: boolean): void {
    this.hidden = hidden
    for (const view of views) {
      this.views.set(view.account.id, view)
    }
    this.updateRows()
    this.renderLens()
  }

  selectVisual(index: number): void {
    this.selectedIndex = index
    const cards = this.list.querySelectorAll<HTMLElement>('.code-card')
    cards.forEach((card, i) => card.classList.toggle('selected', i === index))
    this.renderLens()
  }

  toast(message: string, kind: 'default' | 'success' | 'danger' = 'default'): void {
    this.toastEl.textContent = message
    this.toastEl.className = `toast show ${kind === 'default' ? '' : kind}`.trim()
    if (this.toastTimer) window.clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.className = 'toast'
    }, 2600)
  }

  openAddSheet(): void {
    this.closeSheets()
    this.openSheet(this.addSheet)
    this.add.open()
  }

  openImportSheet(): void {
    this.closeSheets()
    this.openSheet(this.importSheet)
  }

  dismissSheets(): void {
    this.closeSheets()
  }

  private renderSources(): void {
    this.sourceGrid.innerHTML = sources
      .map(
        (source) => `
          <button class="import-card${source.pick ? '' : ' muted'}" data-source="${source.id}">
            <span class="import-icon${source.id === 'proton' ? ' brand' : ''}">${escapeHtml(source.mark)}</span>
            <span class="import-copy">
              <b>${escapeHtml(source.name)}</b>
              <small>${escapeHtml(source.hint)}</small>
            </span>
          </button>`,
      )
      .join('')
  }

  private openGuideSheet(source: Source): void {
    this.source = source
    this.guideEyebrow.textContent = source.app.toUpperCase()
    this.guideSteps.innerHTML = source.steps
      .map((step, index) => `<li><span>${String(index + 1).padStart(2, '0')}</span><p>${step}</p></li>`)
      .join('')
    this.guideNote.innerHTML = source.note ?? 'Imports are parsed on-device. Nothing is uploaded.'
    this.guidePick.hidden = !source.pick
    this.guidePick.textContent = source.pick === 'image' ? 'Choose QR images' : 'Choose files'
    this.guideOpen.hidden = !source.pkg && !source.ios
    this.guideOpen.textContent = `Open ${source.app}`
    this.closeSheets()
    this.openSheet(this.guideSheet)
  }

  private openSheet(sheet: HTMLElement): void {
    sheet.classList.add('open')
    sheet.setAttribute('aria-hidden', 'false')
    document.body.style.overflow = 'hidden'
  }

  private closeSheets(): void {
    this.add.reset()
    for (const sheet of [this.importSheet, this.guideSheet, this.addSheet]) {
      sheet.classList.remove('open')
      sheet.setAttribute('aria-hidden', 'true')
    }
    document.body.style.overflow = ''
  }

  private triggerFilePicker(source = this.source, pick = source?.pick): void {
    this.fileInput.accept = acceptFor[pick ?? 'any']
    this.fileInput.value = ''
    this.fileInput.click()
  }

  private renderLens(): void {
    const account = this.accounts[this.selectedIndex]
    const view = account ? this.views.get(account.id) : undefined

    this.lensLock.innerHTML = this.hidden ? icons.lock : icons.unlock
    this.lensLock.classList.toggle('hidden', this.hidden)
    this.lensLock.classList.toggle('revealed', !this.hidden)
    this.hiddenToggle.innerHTML = this.hidden ? icons.eye : icons.eyeOff
    this.hiddenToggle.setAttribute('aria-label', this.hidden ? 'Show codes' : 'Hide codes')

    if (!account) {
      this.lensCode.textContent = '● ● ●  ● ● ●'
      this.lensAccount.textContent = 'NO CODES'
      this.lensRing.style.strokeDashoffset = String(LENS_RING_C)
      this.lensRingLabel.textContent = '--'
      return
    }

    const code = view?.code ?? '------'
    const progress = view?.progress ?? 0
    this.lensCode.textContent = this.hidden ? maskCode(code) : formatCode(code)
    this.lensAccount.textContent = truncated(
      `${account.issuer || 'Account'} / ${account.name}`,
      34,
    )
    this.lensRing.style.strokeDashoffset = String(LENS_RING_C * (1 - progress))
    this.lensRingLabel.textContent = String(view?.remaining ?? account.period)
  }

  private updateRows(): void {
    for (const card of this.list.querySelectorAll<HTMLElement>('.code-card')) {
      const id = card.dataset.id
      if (!id) continue
      const view = this.views.get(id)
      if (!view) continue

      const codeEl = card.querySelector<HTMLElement>('[data-code]')
      const countEl = card.querySelector<HTMLElement>('[data-count]')
      const ringEl = card.querySelector<SVGCircleElement>('[data-ring]')

      if (codeEl) {
        codeEl.textContent = this.hidden ? maskCode(view.code) : formatCode(view.code)
        codeEl.classList.toggle('hidden', this.hidden)
      }
      if (countEl) countEl.textContent = String(view.remaining)
      if (ringEl) ringEl.style.strokeDashoffset = String(CARD_RING_C * (1 - view.progress))
    }
  }

  private mountIcons(): void {
    const brand = document.getElementById('brand-lock')
    const emptyLock = document.getElementById('empty-lock')
    const lensLock = document.getElementById('lens-lock')
    const hiddenToggle = document.getElementById('toggle-hidden')
    const closeButtons = document.querySelectorAll<HTMLButtonElement>('.sheet-head .icon-btn')
    const chevrons = document.querySelectorAll<HTMLElement>('.chev')

    if (brand) brand.innerHTML = icons.lock
    if (emptyLock) emptyLock.innerHTML = icons.lock
    if (lensLock) lensLock.innerHTML = icons.unlock
    if (hiddenToggle) hiddenToggle.innerHTML = icons.eyeOff
    closeButtons.forEach((button) => {
      button.innerHTML = icons.close
    })
    chevrons.forEach((chevron) => {
      chevron.innerHTML = icons.chevron
    })
  }

  private bind(): void {
    document.getElementById('open-add')?.addEventListener('click', () => this.openAddSheet())
    document.getElementById('empty-add')?.addEventListener('click', () => this.openAddSheet())
    document.getElementById('close-add')?.addEventListener('click', () => this.closeSheets())
    document.getElementById('open-import')?.addEventListener('click', () => this.openImportSheet())
    document.getElementById('empty-import')?.addEventListener('click', () => this.openImportSheet())
    this.sourceGrid.addEventListener('click', (event) => {
      const card = (event.target as HTMLElement).closest<HTMLElement>('[data-source]')
      const source = card && sourceById(card.dataset.source ?? '')
      if (source) this.openGuideSheet(source)
    })
    this.guidePick.addEventListener('click', () => {
      this.closeSheets()
      this.triggerFilePicker()
    })
    this.guideOpen.addEventListener('click', () => {
      if (this.source) this.handlers.openApp(this.source)
    })
    document.getElementById('close-import')?.addEventListener('click', () => this.closeSheets())
    document.getElementById('close-guide')?.addEventListener('click', () => this.closeSheets())

    document.getElementById('load-demo')?.addEventListener('click', () => this.handlers.loadDemo())
    document.getElementById('push-glasses')?.addEventListener('click', () => this.handlers.pushToLens())
    this.hiddenToggle.addEventListener('click', () => this.handlers.toggleHidden())

    document.getElementById('paste-import')?.addEventListener('click', () => {
      const text = this.pasteInput.value.trim()
      if (!text) {
        this.toast('Paste an export or otpauth link first', 'danger')
        return
      }
      void this.handlers.importText(text)
    })

    document.getElementById('paste-clipboard')?.addEventListener('click', () => {
      void this.pasteFromClipboard()
    })

    this.clearButton.addEventListener('click', () => this.handleClear())

    this.fileInput.addEventListener('change', () => {
      const files = [...(this.fileInput.files ?? [])]
      if (files.length > 0) void this.handlers.importFiles(files)
    })

    this.list.addEventListener('click', (event) => {
      const target = event.target as HTMLElement
      const card = target.closest<HTMLElement>('.code-card')
      if (!card) return

      const id = card.dataset.id
      if (!id) return

      const actionButton = target.closest<HTMLButtonElement>('button[data-action]')
      if (actionButton) {
        const action = actionButton.dataset.action
        if (action === 'remove') {
          this.handlers.remove(id)
          return
        }
        if (action === 'copy') {
          const account = this.accounts.find((entry) => entry.id === id)
          const view = this.views.get(id)
          if (account && view) this.handlers.copy(account, view.code)
          return
        }
      }

      this.handlers.select(id)
    })

    for (const backdrop of document.querySelectorAll<HTMLElement>('.sheet-backdrop')) {
      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) this.closeSheets()
      })
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.closeSheets()
    })

    window.addEventListener('dragover', (event) => {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      this.dropOverlay.classList.add('show')
    })

    window.addEventListener('dragleave', (event) => {
      if (event.relatedTarget) return
      this.dragDepth = 0
      this.dropOverlay.classList.remove('show')
    })

    window.addEventListener('drop', (event) => {
      event.preventDefault()
      this.dragDepth = 0
      this.dropOverlay.classList.remove('show')
      const files = [...(event.dataTransfer?.files ?? [])]
      if (files.length > 0) void this.handlers.importFiles(files)
    })

    this.pasteInput.addEventListener('input', () => {
      const lines = this.pasteInput.value.trim().split('\n').length
      if (lines > 6) this.pasteInput.rows = 6
    })

    this.fileInput.addEventListener('click', (event) => event.stopPropagation())
    this.dragDepth = 0
  }

  private handleClear(): void {
    if (!this.clearArmed) {
      this.clearArmed = true
      this.clearButton.textContent = 'Tap again to clear'
      this.toast('Tap again to clear all codes')
      if (this.clearTimer) window.clearTimeout(this.clearTimer)
      this.clearTimer = window.setTimeout(() => this.disarmClear(), 3200)
      return
    }

    this.disarmClear()
    this.handlers.clearAll()
  }

  private disarmClear(): void {
    this.clearArmed = false
    this.clearButton.textContent = 'Clear vault'
    if (this.clearTimer) {
      window.clearTimeout(this.clearTimer)
      this.clearTimer = undefined
    }
  }

  private async pasteFromClipboard(): Promise<void> {
    try {
      if (!navigator.clipboard?.readText) throw new Error('unsupported')
      const text = await navigator.clipboard.readText()
      if (!text) {
        this.toast('Clipboard is empty', 'danger')
        return
      }
      this.pasteInput.value = text
      this.pasteInput.focus()
      this.toast('Clipboard pasted')
    } catch {
      this.toast('Clipboard unavailable, paste manually', 'danger')
    }
  }
}
