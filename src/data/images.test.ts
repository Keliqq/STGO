import { describe, expect, it } from 'vitest'
import { fixtureGameData } from '../test/fixtures.ts'
import { areaIconId, difficultyIconId, iconUrl } from './images.ts'

describe('иконки локаций и сложности', () => {
  it('у каждой области из данных есть иконка', () => {
    const missing = fixtureGameData().questAreas.map((a) => a.name).filter((n) => areaIconId(n) === null)
    expect(missing).toEqual([])
  })

  it('URL формируются в fankit stcentral-hub', () => {
    expect(iconUrl('area', 'forest')).toBe(
      'https://stcentral-hub.github.io/fankit/Quest%20Areas/Quests/icon_global_questarea_forest_small.png',
    )
    expect(iconUrl('difficulty', 'extreme')).toContain('/fankit/Quest%20Difficulties/icon_difficulty_extreme.png')
  })

  it('числовые «сложности» (тиры) без иконки', () => {
    expect(difficultyIconId('Extreme')).toBe('extreme')
    expect(difficultyIconId('13')).toBeNull()
  })
})
