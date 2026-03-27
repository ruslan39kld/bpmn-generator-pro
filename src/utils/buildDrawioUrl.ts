import pako from 'pako'
export { buildDrawioXml } from './buildDrawioXml'
export type { BpmnStep } from './buildDrawioXml'

/**
 * Compresses draw.io XML and returns a URL that opens it directly in app.diagrams.net.
 * Uses pako.deflateRaw — the same algorithm the official draw.io editor expects.
 */
export function buildDrawioUrl(xml: string): string {
  const encoded = encodeURIComponent(xml)
  const compressed = pako.deflateRaw(encoded)
  const b64 = btoa(
    Array.from(compressed, (b: number) => String.fromCharCode(b)).join('')
  )
  const payload = JSON.stringify({ type: 'xml', compressed: true, data: b64 })
  return `https://app.diagrams.net/?pv=0&grid=0#create=${encodeURIComponent(payload)}`
}
