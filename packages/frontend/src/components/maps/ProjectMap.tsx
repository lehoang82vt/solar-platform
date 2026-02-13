'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Navigation, Loader2 } from 'lucide-react';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
const DEFAULT_CENTER: [number, number] = [106.6297, 10.8231]; // HCM
const DEFAULT_ZOOM = 12;

interface ProjectMapProps {
  latitude?: number | null;
  longitude?: number | null;
  onLocationChange: (lat: number, lng: number, address?: string) => void;
}

export default function ProjectMap({ latitude, longitude, onLocationChange }: ProjectMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null);
  const [locating, setLocating] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    latitude && longitude ? { lat: latitude, lng: longitude } : null
  );

  const reverseGeocode = useCallback(async (lat: number, lng: number): Promise<string | undefined> => {
    if (!MAPBOX_TOKEN) return undefined;
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&language=vi&limit=1`
      );
      const data = await res.json();
      return data.features?.[0]?.place_name;
    } catch {
      return undefined;
    }
  }, []);

  const handleLocationUpdate = useCallback(async (lat: number, lng: number) => {
    setCoords({ lat, lng });
    const address = await reverseGeocode(lat, lng);
    onLocationChange(lat, lng, address);
  }, [onLocationChange, reverseGeocode]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || !MAPBOX_TOKEN || mapRef.current) return;

    let cancelled = false;

    import('mapbox-gl').then((mapboxgl) => {
      if (cancelled || !mapContainer.current) return;

      mapboxgl.default.accessToken = MAPBOX_TOKEN;

      const center: [number, number] = longitude && latitude
        ? [longitude, latitude]
        : DEFAULT_CENTER;

      const map = new mapboxgl.default.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center,
        zoom: latitude ? 15 : DEFAULT_ZOOM,
      });

      map.addControl(new mapboxgl.default.NavigationControl(), 'top-right');

      const marker = new mapboxgl.default.Marker({
        color: '#2563eb',
        draggable: true,
      });

      if (latitude && longitude) {
        marker.setLngLat([longitude, latitude]).addTo(map);
      }

      marker.on('dragend', () => {
        const lngLat = marker.getLngLat();
        handleLocationUpdate(lngLat.lat, lngLat.lng);
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on('click', (e: any) => {
        marker.setLngLat(e.lngLat).addTo(map);
        handleLocationUpdate(e.lngLat.lat, e.lngLat.lng);
      });

      map.on('load', () => setMapLoaded(true));

      mapRef.current = map;
      markerRef.current = marker;
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGetLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        if (mapRef.current && markerRef.current) {
          markerRef.current.setLngLat([lng, lat]).addTo(mapRef.current);
          mapRef.current.flyTo({ center: [lng, lat], zoom: 16 });
        }
        handleLocationUpdate(lat, lng);
        setLocating(false);
      },
      () => {
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  if (!MAPBOX_TOKEN) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
        <MapPin className="w-8 h-8 mx-auto mb-2 text-gray-400" />
        Cần cấu hình NEXT_PUBLIC_MAPBOX_TOKEN để hiển thị bản đồ
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-blue-500" />
          Vị trí công trình
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleGetLocation}
          disabled={locating || !mapLoaded}
        >
          {locating ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Navigation className="w-4 h-4 mr-1" />
          )}
          Vị trí hiện tại
        </Button>
      </div>

      <div
        ref={mapContainer}
        className="w-full h-[250px] md:h-[350px] rounded-lg border overflow-hidden"
      />

      {coords && (
        <p className="text-xs text-gray-500">
          📍 {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
        </p>
      )}
      {!coords && (
        <p className="text-xs text-gray-400">
          Nhấn vào bản đồ hoặc bấm &quot;Vị trí hiện tại&quot; để ghim vị trí
        </p>
      )}
    </div>
  );
}
