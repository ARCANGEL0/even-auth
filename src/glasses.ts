import {
  CreateStartUpPageContainer,
  EvenAppBridge,
  ImageContainerProperty,
  ImageRawDataUpdate,
  ImageRawDataUpdateResult,
  StartUpPageCreateResult,
  TextContainerProperty,
  TextContainerUpgrade,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk'
import { getTextWidth, pxTruncate } from '@evenrealities/pretext'
import { formatCode, maskCode, type Account } from './totp'

export interface GlassesRow {
  account: Account
  code: string
  remaining: number
  progress: number
}

export interface GlassesState {
  rows: GlassesRow[]
  selectedIndex: number
  hidden: boolean
}

export interface GlassesCallbacks {
  onToggleHidden: () => void
  onExit: () => void
}

const ROWS_PER_PAGE = 4
const LINES_PER_SCREEN = 10
const INNER_WIDTH = 504
const SPACE_WIDTH = Math.max(1, getTextWidth(' '))

const LEFT_COLUMN = 300
const CODE_COLUMN = 116
const RING_SIZE = 24
const RING_ROWS = 2
const RING_ROW_HEIGHT = 54
const RING_COLUMN_X = 478
const RING_TOP_A = 40
const RING_TOP_B = 148
const RING_GAP = 6
const RING_TRAIL = 8
const RING_REFRESH_MS = 5000

const LOCK_ICON_ROWS = [
  '........................',
  '........######..........',
  '......##......##........',
  '.....#..........#.......',
  '.....#..........#.......',
  '.....#..........#.......',
  '.....#..........#.......',
  '.....#..........#.......',
  '...#################....',
  '...#...............#....',
  '...#...............#....',
  '...#...............#....',
  '...#......####.....#....',
  '...#......####.....#....',
  '...#.......##......#....',
  '...#.......##......#....',
  '...#...............#....',
  '...#...............#....',
  '...#...............#....',
  '...#################....',
  '........................',
  '........................',
  '........................',
  '........................',
]

const CONTAINER = {
  list: { id: 1, name: 'list' },
  lock: { id: 2, name: 'lock' },
  ringA: { id: 3, name: 'ringA' },
  ringB: { id: 4, name: 'ringB' },
  page: { id: 5, name: 'page' },
}

function lockIconData(size = 24): Uint8Array {
  const data = new Uint8Array(size * size)
  for (let y = 0; y < size; y++) {
    const row = LOCK_ICON_ROWS[y] ?? ''
    for (let x = 0; x < size; x++) {
      data[y * size + x] = row[x] === '#' ? 15 : 0
    }
  }
  return data
}

function padTo(text: string, targetPx: number): string {
  const width = getTextWidth(text)
  if (width >= targetPx) return text
  return `${text}${' '.repeat(Math.ceil((targetPx - width) / SPACE_WIDTH))}`
}

function padBetween(left: string, right: string, width = INNER_WIDTH): string {
  const gap = width - getTextWidth(left) - getTextWidth(right)
  return `${left}${' '.repeat(Math.max(1, Math.floor(gap / SPACE_WIDTH)))}${right}`
}

function centerLine(text: string, width = INNER_WIDTH): string {
  const gap = width - getTextWidth(text)
  return `${' '.repeat(Math.max(0, Math.floor(gap / 2 / SPACE_WIDTH)))}${text}`
}

function clockLabel(now = new Date()): string {
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function rowLine(row: GlassesRow, selected: boolean, hidden: boolean): string {
  const label = row.account.issuer
    ? `${row.account.issuer} - ${row.account.name}`
    : row.account.name
  const code = hidden ? maskCode(row.code, '•') : formatCode(row.code)
  const prefix = selected ? '> ' : '  '
  const timeX = LEFT_COLUMN + CODE_COLUMN + RING_GAP + RING_SIZE + RING_TRAIL
  let line = padTo(`${prefix}${pxTruncate(label, 284)}`, LEFT_COLUMN)
  line = padTo(`${line}[${code}]`, LEFT_COLUMN + CODE_COLUMN)
  return `${padTo(line, timeX)}${String(row.remaining).padStart(2, '0')}s`
}

function ringImageData(rows: GlassesRow[], hidden: boolean): Uint8Array {
  const height = RING_ROWS * RING_ROW_HEIGHT
  const data = new Uint8Array(RING_SIZE * height)
  const cx = RING_SIZE / 2
  const outer = 10.6
  const inner = 7.4

  rows.slice(0, RING_ROWS).forEach((row, index) => {
    const cy = RING_ROW_HEIGHT / 2 + index * RING_ROW_HEIGHT
    for (let y = 0; y < height; y++) {
      const dy = y + 0.5 - cy
      if (Math.abs(dy) > outer + 1) continue
      for (let x = 0; x < RING_SIZE; x++) {
        const dx = x + 0.5 - cx
        const distance = Math.hypot(dx, dy)
        const ringCoverage = Math.max(
          0,
          Math.min(1, Math.min(outer + 0.5 - distance, distance - (inner - 0.5))),
        )

        let level = 0
        if (distance <= inner - 0.5) {
          const dotCoverage = Math.max(0, Math.min(1, 2.2 - distance + 0.5))
          if (!hidden) level = Math.round(7 * dotCoverage)
        } else if (ringCoverage > 0) {
          let angle = (Math.atan2(dy, dx) + Math.PI / 2) / (Math.PI * 2)
          if (angle < 0) angle += 1
          const arcLevel = !hidden && angle <= row.progress ? 15 : 1
          level = Math.round(arcLevel * ringCoverage)
        }

        const offset = y * RING_SIZE + x
        if (level > data[offset]) data[offset] = level
      }
    }
  })

  return data
}

function ringPageData(state: GlassesState, page: number, imageIndex: number): Uint8Array {
  const start = page * ROWS_PER_PAGE + imageIndex * RING_ROWS
  return ringImageData(state.rows.slice(start, start + RING_ROWS), state.hidden)
}

function buildContent(state: GlassesState, page: number): { content: string; page: number; pages: number; pageLabel: string } {
  const pages = Math.max(1, Math.ceil(state.rows.length / ROWS_PER_PAGE))
  const current = Math.min(Math.max(0, page), pages - 1)

  const header = padBetween('G2 AUTH', clockLabel())

  const lines: string[] = [header]

  if (state.rows.length === 0) {
    lines.push('', '')
    lines.push(centerLine('NO CODES YET'))
    lines.push(centerLine('OPEN THE APP ON YOUR PHONE'))
    lines.push(centerLine('AND IMPORT YOUR PROTON EXPORT'))
    lines.push('', '', '')
  } else {
    const start = current * ROWS_PER_PAGE
    const slice = state.rows.slice(start, start + ROWS_PER_PAGE)

    lines.push('')
    slice.forEach((row, index) => {
      lines.push(rowLine(row, start + index === state.selectedIndex, state.hidden))
      if (index < slice.length - 1) lines.push('')
    })
  }

  while (lines.length < LINES_PER_SCREEN) lines.push('')

  return {
    content: lines.slice(0, LINES_PER_SCREEN).join('\n'),
    page: current,
    pages,
    pageLabel: `${current + 1}/${pages}`,
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

export class GlassesUI {
  private started = false
  private disposed = false
  private unsubscribe: (() => void) | null = null
  private lastContent = ''
  private lastPageLabel = ''
  private page = 0
  private lastState: GlassesState | null = null
  private queue: Promise<void> = Promise.resolve()
  private lastRingKey = ''
  private lastRingUpdate = 0

  constructor(
    private bridge: EvenAppBridge,
    private callbacks: GlassesCallbacks,
  ) {}

  async start(state: GlassesState): Promise<boolean> {
    this.lastState = state
    const built = buildContent(state, this.page)
    this.page = built.page

    const list = new TextContainerProperty({
      xPosition: 52,
      yPosition: 0,
      width: 512,
      height: 288,
      borderWidth: 0,
      borderColor: 0,
      borderRadius: 0,
      paddingLength: 4,
      containerID: CONTAINER.list.id,
      containerName: CONTAINER.list.name,
      isEventCapture: 1,
      content: built.content,
      textColor: 4,
      zOrderIndex: 1,
    })

    const page = new TextContainerProperty({
      xPosition: 18,
      yPosition: 252,
      width: 96,
      height: 32,
      borderWidth: 0,
      borderColor: 0,
      borderRadius: 0,
      paddingLength: 0,
      containerID: CONTAINER.page.id,
      containerName: CONTAINER.page.name,
      isEventCapture: 0,
      content: built.pageLabel,
      textColor: 2,
      zOrderIndex: 5,
    })

    const imageObject = [
      new ImageContainerProperty({
        xPosition: 18,
        yPosition: 8,
        width: 24,
        height: 24,
        containerID: CONTAINER.lock.id,
        containerName: CONTAINER.lock.name,
        zOrderIndex: 2,
      }),
      new ImageContainerProperty({
        xPosition: RING_COLUMN_X,
        yPosition: RING_TOP_A,
        width: RING_SIZE,
        height: RING_ROWS * RING_ROW_HEIGHT,
        containerID: CONTAINER.ringA.id,
        containerName: CONTAINER.ringA.name,
        zOrderIndex: 3,
      }),
      new ImageContainerProperty({
        xPosition: RING_COLUMN_X,
        yPosition: RING_TOP_B,
        width: RING_SIZE,
        height: RING_ROWS * RING_ROW_HEIGHT,
        containerID: CONTAINER.ringB.id,
        containerName: CONTAINER.ringB.name,
        zOrderIndex: 4,
      }),
    ]

    const result = await withTimeout(
      this.bridge.createStartUpPageContainer(
        new CreateStartUpPageContainer({
          containerTotalNum: 5,
          textObject: [list, page],
          imageObject,
        }),
      ),
      6000,
      StartUpPageCreateResult.invalid,
    )

    if (result !== StartUpPageCreateResult.success) {
      console.warn('[glasses] startup page failed', result)
      return false
    }

    this.started = true
    this.lastContent = built.content
    this.lastPageLabel = built.pageLabel

    await this.uploadImage(CONTAINER.lock, lockIconData(), 8000)
    await this.uploadImage(CONTAINER.ringA, ringPageData(state, this.page, 0), 8000)
    await this.uploadImage(CONTAINER.ringB, ringPageData(state, this.page, 1), 8000)
    this.lastRingKey = this.ringKey(state)
    this.lastRingUpdate = Date.now()

    this.unsubscribe = this.bridge.onEvenHubEvent((event) => this.handleEvent(event))
    return true
  }

  render(state: GlassesState): void {
    if (!this.started || this.disposed) return
    this.lastState = state

    const built = buildContent(state, this.page)
    this.page = built.page

    const contentChanged = built.content !== this.lastContent
    const pageLabelChanged = built.pageLabel !== this.lastPageLabel
    const ringKey = this.ringKey(state)
    const ringsChanged =
      ringKey !== this.lastRingKey || Date.now() - this.lastRingUpdate >= RING_REFRESH_MS
    if (!contentChanged && !pageLabelChanged && !ringsChanged) return

    this.lastContent = built.content
    this.lastPageLabel = built.pageLabel
    if (ringsChanged) {
      this.lastRingKey = ringKey
      this.lastRingUpdate = Date.now()
    }

    this.enqueue(async () => {
      if (this.disposed) return
      if (contentChanged) {
        await withTimeout(
          this.bridge.textContainerUpgrade(
            new TextContainerUpgrade({
              containerID: CONTAINER.list.id,
              containerName: CONTAINER.list.name,
              contentOffset: 0,
              contentLength: 0,
              content: built.content,
            }),
          ),
          5000,
          false,
        )
      }
      if (pageLabelChanged) {
        await withTimeout(
          this.bridge.textContainerUpgrade(
            new TextContainerUpgrade({
              containerID: CONTAINER.page.id,
              containerName: CONTAINER.page.name,
              contentOffset: 0,
              contentLength: 0,
              content: built.pageLabel,
            }),
          ),
          5000,
          false,
        )
      }
      if (ringsChanged && this.lastState) {
        await this.uploadImage(CONTAINER.ringA, ringPageData(this.lastState, this.page, 0), 5000)
        await this.uploadImage(CONTAINER.ringB, ringPageData(this.lastState, this.page, 1), 5000)
      }
    })
  }

  private ringKey(state: GlassesState): string {
    const start = this.page * ROWS_PER_PAGE
    const ids = state.rows
      .slice(start, start + ROWS_PER_PAGE)
      .map((row) => row.account.id)
      .join(',')
    return `${this.page}|${state.hidden ? 1 : 0}|${ids}`
  }

  private async uploadImage(
    target: { id: number; name: string },
    imageData: Uint8Array,
    timeout: number,
  ): Promise<void> {
    await withTimeout(
      this.bridge.updateImageRawData(
        new ImageRawDataUpdate({
          containerID: target.id,
          containerName: target.name,
          imageData,
        }),
      ),
      timeout,
      ImageRawDataUpdateResult.sendFailed,
    )
  }

  focusAccount(index: number): void {
    if (index < 0) return
    this.page = Math.floor(index / ROWS_PER_PAGE)
    if (this.lastState) this.render(this.lastState)
  }

  async exit(): Promise<void> {
    if (!this.started || this.disposed) return
    await withTimeout(this.bridge.shutDownPageContainer(1), 4000, false)
  }

  dispose(): void {
    this.disposed = true
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
  }

  private enqueue(task: () => Promise<void>): void {
    this.queue = this.queue.then(task).catch((error) => {
      console.warn('[glasses] update failed', error)
    })
  }

  private changePage(delta: number): void {
    if (!this.lastState) return
    const pages = Math.max(1, Math.ceil(this.lastState.rows.length / ROWS_PER_PAGE))
    if (pages <= 1) return
    this.page = (this.page + delta + pages) % pages
    this.render(this.lastState)
  }

  private handleEvent(event: EvenHubEvent): void {
    if (this.disposed) return

    if (event.textEvent) {
      const type = event.textEvent.eventType ?? 0
      if (type === 1) this.changePage(1)
      else if (type === 2) this.changePage(-1)
      return
    }

    if (event.sysEvent) {
      const type = event.sysEvent.eventType ?? 0
      if (type === 0) this.callbacks.onToggleHidden()
      else if (type === 3) void this.exit()
      else if (type === 6 || type === 7) this.callbacks.onExit()
    }
  }
}
