import { describe, expect, it } from 'vitest'
import { suggestCategory } from './categorize'

describe('suggestCategory', () => {
  it.each([
    ['chai', 'food'],
    ['Burgur bun', 'food'],
    ['pizza hut', 'food'],
    ['egg roll', 'food'],
    ['dmart contri', 'groceries'],
    ['dhoodh', 'groceries'],
    ['petrol', 'transport'],
    ['train tickets', 'transport'],
    ['rent', 'home'],
    ['electrycity bill', 'home'],
    ['recharge', 'bills'],
    ['google play', 'bills'],
    ['jeans', 'shopping'],
    ['medicenes', 'health'],
    ['haircut', 'personal'],
    ['mumbai trip', 'travel'],
    ['turf', 'entertainment'],
    ['printout', 'education'],
    ['fmb', 'gifts'],
    ['miscelleneous', 'misc'],
    ['miscellanous', 'misc'], // 1-letter typo
  ])('%s → %s', (name, expected) => {
    expect(suggestCategory(name)).toBe(expected)
  })

  it('returns null when nothing matches', () => {
    expect(suggestCategory('shivam')).toBeNull()
    expect(suggestCategory('')).toBeNull()
  })

  it('ignores archived categories', () => {
    expect(suggestCategory('chai', [{ id: 'food', keywords: ['chai'], archived: true }])).toBeNull()
  })
})
