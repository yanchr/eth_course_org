import { useState } from 'react'
import { ExternalLink, MapPinOff, ZoomIn, ZoomOut } from 'lucide-react'
import { CAMPUS_META } from '../lib/buildings'
import { parseRoom } from '../lib/campus'
import { cn } from '../lib/cn'
import { CampusBadge } from './CampusBadge'
import { IconButton } from './ui/IconButton'

interface CampusMapOverlayProps {
  room: string
  className?: string
}

const ZOOM = 2.4

function ethLocationUrl(code: string, rest: string): string {
  const [floor = '', room = ''] = rest.split(/\s+/)
  const params = new URLSearchParams({ building: code, floor, room, lang: 'en' })
  return `https://ethz.ch/en/utils/location.html?${params.toString()}`
}

export function CampusMapOverlay({ room, className }: CampusMapOverlayProps) {
  const [zoomed, setZoomed] = useState(false)
  const loc = parseRoom(room)
  if (!loc) return null

  const meta = CAMPUS_META[loc.campus]
  const coords = loc.coords
  const scale = zoomed && coords ? ZOOM : 1

  return (
    <figure className={cn('flex flex-col gap-2.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <CampusBadge campus={loc.campus} />
        <a
          href={ethLocationUrl(loc.code, loc.rest)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-zinc-500 transition-colors duration-150 ease-out hover:bg-zinc-100 hover:text-zinc-900"
        >
          ETH room info
          <ExternalLink className="size-3" />
        </a>
      </div>

      <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100">
        <div
          className="absolute inset-0 transition-transform duration-300 ease-out"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: coords ? `${coords.x}% ${coords.y}%` : 'center',
          }}
        >
          <img
            src={meta.map}
            alt={`${meta.name} map`}
            draggable={false}
            className="absolute inset-0 size-full object-cover select-none"
          />

          {coords && (
            <button
              type="button"
              onClick={() => setZoomed((z) => !z)}
              aria-label={`${loc.code} on ${meta.name}. ${zoomed ? 'Zoom out' : 'Zoom in'}`}
              className="group absolute rounded-full"
              style={{
                top: `${coords.y}%`,
                left: `${coords.x}%`,
                transform: `translate(-50%, -50%) scale(${1 / scale})`,
                transition: 'transform 300ms ease-out',
              }}
            >
              <svg width="72" height="72" viewBox="0 0 72 72" className="overflow-visible" aria-hidden="true">
                <circle
                  cx="36"
                  cy="36"
                  r="12"
                  className="animate-pin-pulse fill-zinc-900/25 [transform-box:fill-box] [transform-origin:center]"
                />
                <rect
                  x="20"
                  y="20"
                  width="32"
                  height="32"
                  rx="6"
                  className="fill-zinc-900/10 stroke-zinc-900 transition-[stroke-width] duration-150 ease-out group-hover:[stroke-width:2.5]"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                />
                <circle cx="36" cy="36" r="4.5" className="fill-zinc-900 stroke-white" strokeWidth="2" />
              </svg>
              <span className="pointer-events-none absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 rounded-md bg-zinc-900 px-2 py-0.5 text-xs font-semibold tracking-wide whitespace-nowrap text-white shadow-lg">
                {loc.code}
                {loc.rest && <span className="ml-1 font-normal text-zinc-300">{loc.rest}</span>}
              </span>
            </button>
          )}
        </div>

        {coords ? (
          <IconButton
            label={zoomed ? 'Zoom out' : 'Zoom in'}
            onClick={() => setZoomed((z) => !z)}
            className="absolute right-2 bottom-2 border border-zinc-200 bg-white/90 text-zinc-700 shadow-sm backdrop-blur"
          >
            {zoomed ? <ZoomOut className="size-4" /> : <ZoomIn className="size-4" />}
          </IconButton>
        ) : (
          <div className="absolute inset-x-2 bottom-2 flex items-center gap-2 rounded-xl border border-zinc-200 bg-white/95 px-3 py-2 text-xs text-zinc-600 shadow-sm backdrop-blur">
            <MapPinOff className="size-4 shrink-0 text-zinc-400" />
            <span>
              Building <strong className="font-semibold text-zinc-900">{loc.code}</strong> isn't on the map yet, so its
              campus was inferred from its code.
            </span>
          </div>
        )}
      </div>
    </figure>
  )
}
