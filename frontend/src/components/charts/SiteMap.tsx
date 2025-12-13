import { Suspense, lazy } from 'react'
import type { Site } from '@/types'

// Lazy load the map content to avoid Leaflet's window access at module load time
const SiteMapContent = lazy(() => import('./SiteMapContent'))

interface SiteMapProps {
  sites: Site[]
  selectedSites: string[]
  onSiteToggle: (siteCode: string) => void
  height?: number
}

// Loading placeholder component
function MapPlaceholder({ height }: { height: number }) {
  return (
    <div
      className="relative rounded-lg overflow-hidden bg-muted/30 flex items-center justify-center"
      style={{ height }}
    >
      <div className="text-muted-foreground text-sm">Loading map...</div>
    </div>
  )
}

export default function SiteMap({ sites, selectedSites, onSiteToggle, height = 400 }: SiteMapProps) {
  return (
    <Suspense fallback={<MapPlaceholder height={height} />}>
      <SiteMapContent
        sites={sites}
        selectedSites={selectedSites}
        onSiteToggle={onSiteToggle}
        height={height}
      />
    </Suspense>
  )
}
