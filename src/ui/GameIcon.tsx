import { useState } from 'react'
import { championIconId, type IconKind, iconUrl } from '#/data/images.ts'
import type { GameData } from '#/data/types.ts'

interface GameIconProps {
  kind: IconKind
  /** Id из imageMap (см. iconUrl). null/undefined — сразу заглушка. */
  id: string | null | undefined
  /** Подпись: alt и всплывающая подсказка. */
  label?: string
  size?: number
  className?: string
  /** Иконка рядом с тем же текстом: пустой alt, чтобы подпись не дублировалась в доступном имени. */
  decorative?: boolean
}

/**
 * Иконка из игры. Картинка грузится лениво прямо с сайта Kabam / fankit stcentral-hub;
 * при ошибке загрузки или неизвестном id показывается заглушка с первой буквой подписи.
 */
export function GameIcon({ kind, id, label = '', size = 32, className = '', decorative = false }: GameIconProps) {
  const src = id ? iconUrl(kind, id) : null
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const box = { width: size, height: size }

  if (!src || failedSrc === src) {
    return (
      <span
        role={decorative ? undefined : 'img'}
        aria-hidden={decorative || undefined}
        aria-label={decorative ? undefined : label || 'нет картинки'}
        title={decorative ? undefined : label}
        style={{ ...box, fontSize: Math.max(10, size * 0.45) }}
        className={`inline-flex shrink-0 items-center justify-center rounded bg-neutral-200 font-semibold text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300 ${className}`}
      >
        {label.trim().charAt(0).toUpperCase() || '?'}
      </span>
    )
  }
  return (
    <img
      src={src}
      alt={decorative ? '' : label}
      // Пустой alt с title Chrome всё равно озвучивает — у декоративной иконки подсказки нет (текст рядом).
      title={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      style={box}
      className={`inline-block shrink-0 object-contain ${className}`}
      onError={() => setFailedSrc(src)}
    />
  )
}

/** Портрет чемпиона (иконка его лидерского навыка из fankit, см. `championIconId`). */
export function ChampionIcon({ data, name, size = 32, className = '', decorative = false }: { data: Pick<GameData, 'champions' | 'skills'>; name: string; size?: number; className?: string; decorative?: boolean }) {
  return <GameIcon kind="skill" id={championIconId(data, name)} label={name} size={size} className={`rounded-full ${className}`} decorative={decorative} />
}
