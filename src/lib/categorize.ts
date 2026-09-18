/**
 * Default categories and a keyword matcher derived from 4 years of the user's spreadsheet
 * (including its common spellings: burgur, dhoodh, miscelleneous, rikshaw…).
 */

export interface CategorySeed {
  id: string
  name: string
  icon: string
  color: string
  keywords: string[]
}

export const DEFAULT_CATEGORIES: CategorySeed[] = [
  {
    id: 'food',
    name: 'Food & Drinks',
    icon: 'utensils',
    color: '#F97316',
    keywords: [
      'chai', 'tea', 'coffee', 'cafe', 'café', 'poha', 'samosa', 'vada pav', 'vadapav', 'dabeli', 'daabeli', 'kachori',
      'burger', 'burgur', 'pizza', 'shwarma', 'shawarma', 'biryani', 'dosa', 'lunch', 'dinner', 'breakfast', 'nashta',
      'nashto', 'jaman', 'food', 'roll', 'rolls', 'maggi', 'sandwich', 'juice', 'ice cream', 'ice creame', 'icecream',
      'cake', 'misal', 'pav', 'bhel', 'chaat', 'chat', 'pani puri', 'panipuri', 'momos', 'thaali', 'thali', 'zomato',
      'swiggy', 'eatclub', 'mcdonalds', 'kfc', 'subway', 'dominos', 'pizza hut', 'sprite', 'coke', 'mountain dew',
      'mojito', 'lassi', 'softy', 'waffles', 'appe', 'paratha', 'omelette', 'egg roll', 'egg rice', 'sev', 'mixture',
      'puri', 'chips', 'kurkure', 'sweets', 'snacks', 'bhajji', 'bhajya', 'noodles', 'manchurian', 'manchrian', 'chole',
      'kulcha', 'kulche', 'naan', 'roti', 'hotel', 'restaurant', 'iftar', 'sehri', 'sehori', 'bbq', 'broasted', 'pasta',
      'bowl', 'toast', 'shake', 'brota', 'upma', 'bun', 'khamboli', 'mirchi', 'thepla', 'fries', 'french fries', 'chip',
      'sub', 'nashto', 'chai nashto',
    ],
  },
  {
    id: 'groceries',
    name: 'Groceries',
    icon: 'shopping-basket',
    color: '#22C55E',
    keywords: [
      'groceries', 'grocery', 'dmart', 'd mart', 'zepto', 'zepo', 'blinkit', 'jiomart', 'bigbasket', 'instamart', 'milk',
      'dhoodh', 'doodh', 'bread', 'eggs', 'egg tray', 'veggies', 'vegies', 'vegetable', 'vegetables', 'sabji', 'sabzi',
      'onions', 'onion', 'tomatoes', 'tomato', 'banana', 'fruits', 'fruit', 'watermelon', 'watemelon', 'muskmelon', 'curd',
      'paneer', 'butter', 'masala', 'jeeru', 'lasan', 'ginger', 'cabbage', 'loki', 'atta', 'aata', 'chawal', 'rice',
      'oats', 'dryfruits', 'dry fruits', 'fresh pocket', 'saman', 'kitchen', 'kitcehn',
    ],
  },
  {
    id: 'transport',
    name: 'Transport',
    icon: 'car',
    color: '#3B82F6',
    keywords: [
      'petrol', 'cng', 'diesel', 'fuel', 'metro', 'auto', 'rikshaw', 'rickshaw', 'cab', 'uber', 'ola', 'rapido', 'bus',
      'train', 'train ticket', 'train tickets', 'ticket', 'tickets', 'platform', 'platform ticket', 'parking', 'toll',
      'bike wash', 'bike repair', 'bike brake', 'puncture', 'garage', 'challan', 'chalan', 'rto', 'rto fee', 'chartered',
      'travel expense', 'train expense', 'gaari',
    ],
  },
  {
    id: 'home',
    name: 'Rent & Home',
    icon: 'house',
    color: '#8B5CF6',
    keywords: [
      'rent', 'maid', 'water can', 'paani can', 'water', 'paani', 'electricity', 'electricity bill', 'elec bill',
      'electrycity bill', 'light bill', 'gas', 'deposit', 'fan repair', 'bulb', 'lock', 'mattress', 'matt', 'fridge',
      'bedsheet', 'floor cleaner', 'detergent', 'new flat', 'aata chakki', 'handwash', 'extension', 'extesion', 'fan',
    ],
  },
  {
    id: 'bills',
    name: 'Bills & Subscriptions',
    icon: 'receipt',
    color: '#EAB308',
    keywords: [
      'recharge', 'mobile recharge', 'wifi', 'wifi bill', 'google play', 'google drive', 'google recharge', 'hostinger',
      'aws', 'netflix', 'spotify', 'prime', 'hotstar', 'youtube premium', 'subscription', 'broadband', 'dth', 'bill',
    ],
  },
  {
    id: 'shopping',
    name: 'Shopping',
    icon: 'shopping-bag',
    color: '#EC4899',
    keywords: [
      'jeans', 'tshirt', 't-shirt', 'shirt', 'lower', 'socks', 'vest', 'hoodie', 'belt', 'cover', 'wallet', 'clogs',
      'watch battery', 'earbuds', 'power bank', 'trunk', 'attar', 'clothes', 'shoes', 'amazon', 'flipkart', 'myntra',
      'cup', 'keys', 'clip', 'ring', 'battery cell', 'lighter', 'phone repair', 'shirt alter', 'cover sg',
    ],
  },
  {
    id: 'health',
    name: 'Health & Fitness',
    icon: 'heart-pulse',
    color: '#EF4444',
    keywords: [
      'meds', 'med', 'medicine', 'medicines', 'medicenes', 'doctor', 'gym', 'protein', 'pharmacy', 'hospital', 'clinic',
      'swimming cap', 'swimming', 'test', 'lab',
    ],
  },
  {
    id: 'personal',
    name: 'Personal Care',
    icon: 'sparkles',
    color: '#14B8A6',
    keywords: [
      'haircut', 'hair cut', 'laundry', 'shampoo', 'face wash', 'soap', 'toothpaste', 'sunscreen', 'roll on', 'rosemary',
      'rosemary leaves', 'salon', 'grooming',
    ],
  },
  {
    id: 'travel',
    name: 'Travel & Trips',
    icon: 'plane',
    color: '#6366F1',
    keywords: ['trip', 'trek', 'travel', 'tour', 'boating', 'flight', 'holiday', 'mumbai trip', 'bus round trip', 'ali baug', 'indore'],
  },
  {
    id: 'entertainment',
    name: 'Entertainment',
    icon: 'gamepad-2',
    color: '#D946EF',
    keywords: ['pool', 'turf', 'bowling', 'football', 'match', 'bat', 'movie', 'pvr', 'inox', 'cricket', 'game', 'kites', 'house party', 'party', 'bet'],
  },
  {
    id: 'education',
    name: 'Education & Work',
    icon: 'graduation-cap',
    color: '#84CC16',
    keywords: ['printout', 'print', 'prints', 'stationery', 'pen', 'course', 'driving school', 'books', 'book', 'xerox', 'stepsils'],
  },
  {
    id: 'gifts',
    name: 'Gifts & Community',
    icon: 'gift',
    color: '#06B6D4',
    keywords: ['gift', 'sabil', 'fmb', 'donation', 'gullak', 'mala', 'charity', 'zam zam'],
  },
  {
    id: 'misc',
    name: 'Miscellaneous',
    icon: 'circle-ellipsis',
    color: '#94A3B8',
    keywords: ['misc', 'miscellaneous', 'miscelleneous', 'miscilineous', 'miscel', 'miscell', 'unk', 'other'],
  },
]

export const FALLBACK_CATEGORY_ID = 'misc'

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ऀ-ॿ]+/g, ' ')
    .trim()
}

function levenshteinWithin1(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
      continue
    }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (a.length < b.length) j++
    else {
      i++
      j++
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

export interface CategoryLike {
  id: string
  keywords: string[]
  archived?: boolean
}

/**
 * Returns the best category id for an item name, or null when nothing matches.
 * Longest keyword wins ("pizza hut" beats "pizza"; "egg roll" beats "roll").
 * Typos of 1 edit are tolerated for words of 5+ letters.
 */
export function suggestCategory(name: string, categories: CategoryLike[] = DEFAULT_CATEGORIES): string | null {
  const norm = normalizeName(name)
  if (!norm) return null
  const padded = ` ${norm} `
  const words = norm.split(' ')

  let best: { id: string; score: number } | null = null
  for (const cat of categories) {
    if (cat.archived) continue
    for (const kw of cat.keywords) {
      const k = normalizeName(kw)
      if (!k) continue
      let score = 0
      if (padded.includes(` ${k} `)) score = k.length * 10
      else if (!k.includes(' ') && k.length >= 5 && words.some((w) => w.length >= 5 && levenshteinWithin1(w, k))) score = k.length * 5
      if (score && (!best || score > best.score)) best = { id: cat.id, score }
    }
  }
  return best?.id ?? null
}
