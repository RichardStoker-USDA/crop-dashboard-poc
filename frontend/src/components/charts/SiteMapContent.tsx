// This component is lazy-loaded to avoid Leaflet's window access at module load time
import { useEffect, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { Site } from '@/types'
import { cropColors } from '@/lib/utils'

interface SiteMapContentProps {
  sites: Site[]
  selectedSites: string[]
  onSiteToggle: (siteCode: string) => void
  height: number
}

// Component to fit map bounds to markers - must be inside MapContainer
function FitBounds({ sites }: { sites: Site[] }) {
  const map = useMap()

  useEffect(() => {
    if (sites.length === 0) return

    try {
      const validSites = sites.filter(
        s => typeof s.latitude === 'number' &&
             typeof s.longitude === 'number' &&
             !isNaN(s.latitude) &&
             !isNaN(s.longitude)
      )

      if (validSites.length === 0) return

      const bounds = L.latLngBounds(
        validSites.map(site => [site.latitude, site.longitude] as [number, number])
      )
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 10 })
    } catch {
      // Silent fail - map will show default view
    }
  }, [sites, map])

  return null
}

// Custom marker icon creator
function createMarkerIcon(color: string, isSelected: boolean): L.DivIcon {
  const size = isSelected ? 28 : 20
  const borderWidth = isSelected ? 3 : 2
  const borderColor = isSelected ? '#ffffff' : 'rgba(255,255,255,0.8)'

  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        background-color: ${color};
        border: ${borderWidth}px solid ${borderColor};
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        cursor: pointer;
        transition: all 0.2s ease;
        ${isSelected ? 'transform: scale(1.1);' : ''}
      "></div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })
}

export default function SiteMapContent({ sites, selectedSites, onSiteToggle, height }: SiteMapContentProps) {
  // Memoize the icon creator
  const getMarkerIcon = useCallback((color: string, isSelected: boolean) => {
    return createMarkerIcon(color, isSelected)
  }, [])

  // California center as default
  const defaultCenter: [number, number] = [36.7783, -119.4179]
  const defaultZoom = 6

  // Calculate center from sites if available
  const center = sites.length > 0
    ? [
        sites.reduce((sum, s) => sum + (s.latitude || 0), 0) / sites.length,
        sites.reduce((sum, s) => sum + (s.longitude || 0), 0) / sites.length,
      ] as [number, number]
    : defaultCenter

  return (
    <div className="relative rounded-lg overflow-hidden" style={{ height }}>
      <MapContainer
        center={center}
        zoom={defaultZoom}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitBounds sites={sites} />

        {sites.map(site => {
          const isSelected = selectedSites.includes(site.site_code)
          const color = cropColors[site.crop_name?.toLowerCase() || ''] || '#6B7280'

          return (
            <Marker
              key={site.id}
              position={[site.latitude, site.longitude]}
              icon={getMarkerIcon(color, isSelected)}
              eventHandlers={{
                click: () => onSiteToggle(site.site_code),
              }}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">{site.site_code}</div>
                  <div className="text-gray-600">{site.name}</div>
                  <div className="mt-1 flex items-center gap-1">
                    <span
                      className="w-2 h-2 rounded-full inline-block"
                      style={{ backgroundColor: color }}
                    />
                    <span className="capitalize">{site.crop_name}</span>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    {site.latitude.toFixed(4)}, {site.longitude.toFixed(4)}
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-2 left-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-lg p-2 text-xs z-[1000]">
        <div className="font-medium mb-1 text-gray-700 dark:text-gray-300">Crops</div>
        <div className="space-y-0.5">
          {Object.entries(cropColors).map(([crop, color]) => (
            <div key={crop} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full inline-block"
                style={{ backgroundColor: color }}
              />
              <span className="capitalize text-gray-600 dark:text-gray-400">
                {crop.replace('_', ' ')}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Selected count badge */}
      {selectedSites.length > 0 && (
        <div className="absolute top-2 right-2 bg-primary text-white px-2 py-1 rounded-full text-xs font-medium z-[1000]">
          {selectedSites.length} selected
        </div>
      )}
    </div>
  )
}
