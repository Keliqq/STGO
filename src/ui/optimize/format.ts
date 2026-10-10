/** Доля → проценты с одним знаком: 0.1234 → "12.3%". */
export const pct = (x: number): string => `${(x * 100).toFixed(1)}%`

/** Разница долей → процентные пункты со знаком: 0.05 → "+5.0 п.п.". */
export const signedPp = (x: number): string => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)} п.п.`
