// Mapbox helpers y configuración
export const MAPBOX_TOKEN = "pk.eyJ1IjoiZWxidWVubWVudSIsImEiOiJjbWdqMnRwZWMwZ2FvMmtuMjFvMGR1NXNiIn0.7ACTVWHp6JJ6l5kY5O3GzQ";
export const MAPBOX_STYLE = "mapbox://styles/mapbox/streets-v12";

// Obtener ruta entre dos puntos usando Mapbox Directions API
export async function getRoute(
  origin: [number, number], // [lng, lat]
  destination: [number, number]
): Promise<{
  geometry: GeoJSON.LineString;
  distance: number; // en metros
  duration: number; // en segundos
} | null> {
  try {
    const [originLng, originLat] = origin;
    const [destLng, destLat] = destination;
    
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${originLng},${originLat};${destLng},${destLat}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.error('Error obteniendo ruta:', data);
      return null;
    }
    
    const route = data.routes[0];
    
    return {
      geometry: route.geometry,
      distance: route.distance,
      duration: route.duration
    };
  } catch (error) {
    console.error('Error obteniendo ruta:', error);
    return null;
  }
}

// Calcular distancia entre dos puntos (Haversine)
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3; // Radio de la Tierra en metros
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distancia en metros
}

// Formatear distancia
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

// Formatear duración
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

