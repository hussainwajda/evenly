/**
 * Parses the spreadsheet habit "item - amount" into a name and amount.
 * Accepts: "chai 12", "chai - 12", "petrol-375", "nashto = 60", "₹120 dinner",
 * "rs 50 auto", "1,250.50 groceries", "fridge - 1800 received".
 */

export interface QuickAddResult {
  name: string
  /** paise */
  amount: number
  /** "received" / "recieved" suffix seen in the sheet */
  received: boolean
}

const NUM = String.raw`(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(?:₹|rs\.?|\/-)?`
const TRAILING = new RegExp(String.raw`^(.*?)[\s\-=:–—]*${NUM}\s*(received|recieved)?\s*$`, 'i')
const LEADING = new RegExp(String.raw`^\s*${NUM}[\s\-=:–—]+(.+?)\s*$`, 'i')

function cleanName(raw: string): string {
  return raw
    .replace(/[\s\-=:–—]+$/g, '')
    .replace(/^[\s\-=:–—]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function toPaise(numText: string): number {
  return Math.round(Number(numText.replace(/,/g, '')) * 100)
}

export function parseQuickAdd(input: string | null | undefined): QuickAddResult | null {
  if (input == null) return null
  const text = String(input).trim()
  if (!text) return null

  const trailing = text.match(TRAILING)
  if (trailing) {
    const name = cleanName(trailing[1])
    const amount = toPaise(trailing[2])
    if (name && /[a-zऀ-ॿ]/i.test(name) && amount > 0) {
      return { name, amount, received: Boolean(trailing[3]) }
    }
  }

  const leading = text.match(LEADING)
  if (leading) {
    const name = cleanName(leading[2])
    const amount = toPaise(leading[1])
    if (name && /[a-zऀ-ॿ]/i.test(name) && amount > 0) {
      return { name, amount, received: false }
    }
  }

  return null
}

/** "  burgur  BUN " → "Burgur bun" — tidy casing for display. */
export function tidyName(name: string): string {
  const t = name.replace(/\s{2,}/g, ' ').trim()
  if (!t) return t
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
}
