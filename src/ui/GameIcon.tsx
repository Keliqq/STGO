import { useState } from 'react'
import { type IconKind, iconUrl } from '#/data/images.ts'

interface GameIconProps {
  kind: IconKind
  /** Id из imageMap (см. iconUrl). null/undefined — сразу заглушка. */
  id: string | null | undefined
  /** Подпись: alt и всплывающая подсказка. */
  label?: string
  size?: number
  className?: string
}

/**
 * Иконка из игры. Картинка грузится лениво прямо с сайта Kabam / fankit stcentral-hub;
 * при ошибке загрузки или неизвестном id показывается заглушка с первой буквой подписи.
 */
export function GameIcon({ kind, id, label = '', size = 32, className = '' }: GameIconProps) {
  const src = id ? iconUrl(kind, id) : null
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const box = { width: size, height: size }

  if (!src || failedSrc === src) {
    return (
      <span
        role="img"
        aria-label={label || 'нет картинки'}
        title={label}
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
      alt={label}
      title={label}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      style={box}
      className={`inline-block shrink-0 object-contain ${className}`}
      onError={() => setFailedSrc(src)}
    />
  )
}
