import { canStream, readQr, startScanner } from './qr'
import { formatCode, generateCode, normalizeAccount, type AccountSeed } from './totp'

export interface AddHandlers {
  addAccount(seed: AccountSeed): Promise<boolean>
  scanText(text: string): Promise<void>
  capture(kind: 'camera' | 'album'): Promise<Blob | null>
  toast(message: string, tone?: 'success' | 'danger'): void
}

export class AddSheet {
  private form: HTMLFormElement
  private secretInput: HTMLInputElement
  private preview: HTMLElement
  private previewCode: HTMLElement
  private viewfinder: HTMLElement
  private video: HTMLVideoElement
  private hint: HTMLElement
  private photoInput = document.getElementById('photo-input') as HTMLInputElement
  private stopScan: (() => void) | null = null
  private timer: number | undefined
  private busy = false

  constructor(
    private root: HTMLElement,
    private handlers: AddHandlers,
    private pickImage: () => void,
  ) {
    const find = <T extends Element>(selector: string) => root.querySelector(selector) as T
    this.form = find<HTMLFormElement>('#add-form')
    this.secretInput = this.form.elements.namedItem('secret') as HTMLInputElement
    this.preview = find<HTMLElement>('#add-preview')
    this.previewCode = find<HTMLElement>('#add-code')
    this.viewfinder = find<HTMLElement>('#viewfinder')
    this.video = find<HTMLVideoElement>('#scan-video')
    this.hint = find<HTMLElement>('#scan-hint')
    this.bind()
  }

  open(): void {
    this.switchTab('key')
    this.timer = window.setInterval(() => void this.updatePreview(), 1000)
    void this.updatePreview()
    window.setTimeout(() => this.secretInput.focus(), 250)
  }

  reset(): void {
    this.stopCamera()
    window.clearInterval(this.timer)
    this.timer = undefined
  }

  private bind(): void {
    for (const tab of this.root.querySelectorAll<HTMLButtonElement>('.tab')) {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab ?? 'key'))
    }

    this.form.addEventListener('input', () => void this.updatePreview())
    this.form.addEventListener('submit', (event) => {
      event.preventDefault()
      void this.submit()
    })

    this.root.querySelector('#scan-camera')?.addEventListener('click', () => void this.toggleCamera())
    this.root.querySelector('#scan-photo')?.addEventListener('click', () => void this.capture('camera'))
    this.root.querySelector('#scan-image')?.addEventListener('click', () => void this.capture('album'))

    this.photoInput.addEventListener('change', () => {
      const file = this.photoInput.files?.[0]
      if (file) void this.decode(file)
    })
  }

  private switchTab(name: string): void {
    for (const tab of this.root.querySelectorAll<HTMLElement>('.tab')) {
      tab.classList.toggle('active', tab.dataset.tab === name)
      tab.setAttribute('aria-selected', String(tab.dataset.tab === name))
    }
    for (const panel of this.root.querySelectorAll<HTMLElement>('[data-panel]')) {
      panel.hidden = panel.dataset.panel !== name
    }
    if (name !== 'qr') this.stopCamera()
  }

  private seed(): AccountSeed {
    const data = new FormData(this.form)
    const value = (key: string) => String(data.get(key) ?? '').trim()
    return {
      issuer: value('issuer'),
      name: value('name'),
      secret: value('secret'),
      digits: value('digits'),
      period: value('period'),
      algorithm: value('algorithm'),
    }
  }

  private async updatePreview(): Promise<void> {
    const account = normalizeAccount(this.seed())
    const typed = this.secretInput.value.trim().length > 0
    this.secretInput.classList.toggle('invalid', typed && !account)
    this.preview.classList.toggle('live', Boolean(account))

    if (!account) {
      this.previewCode.textContent = typed ? 'Invalid key' : '--- ---'
      return
    }

    const view = await generateCode(account)
    this.previewCode.textContent = `${formatCode(view.code)}  ${view.remaining}s`
  }

  private async submit(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      const added = await this.handlers.addAccount(this.seed())
      if (added) this.form.reset()
      else this.secretInput.classList.add('invalid')
    } finally {
      this.busy = false
    }
  }

  private async toggleCamera(): Promise<void> {
    if (this.stopScan) {
      this.stopCamera()
      return
    }
    if (!canStream()) {
      await this.capture('camera')
      return
    }

    try {
      this.stopScan = await startScanner(this.video, (text) => {
        this.stopScan = null
        this.setLive(false)
        void this.handlers.scanText(text)
      })
      this.setLive(true)
    } catch {
      this.stopScan = null
      this.setLive(false)
      this.hint.textContent = 'Camera unavailable. Take a photo instead.'
    }
  }

  private stopCamera(): void {
    this.stopScan?.()
    this.stopScan = null
    this.setLive(false)
  }

  private setLive(live: boolean): void {
    this.viewfinder.classList.toggle('live', live)
    const button = this.root.querySelector('#scan-camera')
    if (button) button.textContent = live ? 'Stop' : 'Use camera'
  }

  private async capture(kind: 'camera' | 'album'): Promise<void> {
    this.stopCamera()
    const blob = await this.handlers.capture(kind).catch(() => null)
    if (blob) {
      await this.decode(blob)
      return
    }
    if (kind === 'camera') {
      this.photoInput.value = ''
      this.photoInput.click()
    } else {
      this.pickImage()
    }
  }

  private async decode(image: Blob): Promise<void> {
    const text = await readQr(image).catch(() => null)
    if (text) await this.handlers.scanText(text)
    else this.handlers.toast('No QR code found in that image', 'danger')
  }
}
