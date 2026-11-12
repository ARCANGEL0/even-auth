import jsQR from 'jsqr'

const maxSide = 1600

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) return createImageBitmap(file)
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function scan(source: ImageBitmap | HTMLImageElement, scale: number): string | null {
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(source, 0, 0, width, height)
  const { data } = ctx.getImageData(0, 0, width, height)
  return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null
}

export async function readQr(file: Blob): Promise<string | null> {
  const bitmap = await loadBitmap(file)
  const fit = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  for (const scale of [fit, fit / 2, fit * 0.75]) {
    const text = scan(bitmap, scale)
    if (text) return text
  }
  return null
}

export function isImage(file: File): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|heic)$/i.test(file.name)
}

export function base64Blob(base64: string, type = 'image/jpeg'): Blob {
  const bin = atob(base64.replace(/^data:[^,]+,/, ''))
  return new Blob([Uint8Array.from(bin, (char) => char.charCodeAt(0))], { type })
}

export function canStream(): boolean {
  return Boolean(navigator.mediaDevices?.getUserMedia)
}

export async function startScanner(video: HTMLVideoElement, onText: (text: string) => void): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 } },
    audio: false,
  })
  video.srcObject = stream
  await video.play()

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  let frame = 0
  let active = true

  const stop = () => {
    active = false
    cancelAnimationFrame(frame)
    for (const track of stream.getTracks()) track.stop()
    video.srcObject = null
  }

  const loop = () => {
    if (!active || !ctx) return
    if (video.readyState >= 2 && video.videoWidth > 0) {
      const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight))
      canvas.width = Math.round(video.videoWidth * scale)
      canvas.height = Math.round(video.videoHeight * scale)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const hit = jsQR(data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' })
      if (hit?.data) {
        stop()
        onText(hit.data)
        return
      }
    }
    frame = requestAnimationFrame(loop)
  }

  frame = requestAnimationFrame(loop)
  return stop
}
