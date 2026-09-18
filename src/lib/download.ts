export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function canShareFiles(): boolean {
  try {
    return Boolean(navigator.canShare?.({ files: [new File(['x'], 'x.json', { type: 'application/json' })] }))
  } catch {
    return false
  }
}

/** Opens the Android share sheet (Drive, WhatsApp, Files…). Returns false if the user cancelled. */
export async function shareBlob(blob: Blob, filename: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type })
  try {
    await navigator.share({ files: [file], title: filename })
    return true
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return false
    throw e
  }
}

export function todayStamp(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
