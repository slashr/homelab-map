export interface CapitalLabel {
  name: string;
  lat: number;
  lng: number;
}

export const capitalLabels: CapitalLabel[] = [
  { name: 'Washington, D.C.', lat: 38.9072, lng: -77.0369 },
  { name: 'Berlin', lat: 52.52, lng: 13.405 },
  { name: 'London', lat: 51.5074, lng: -0.1278 },
  { name: 'Paris', lat: 48.8566, lng: 2.3522 },
  { name: 'Madrid', lat: 40.4168, lng: -3.7038 },
  { name: 'Rome', lat: 41.9028, lng: 12.4964 },
  { name: 'Ottawa', lat: 45.4215, lng: -75.6972 },
  { name: 'Canberra', lat: -35.2809, lng: 149.13 },
  { name: 'Brasília', lat: -15.7939, lng: -47.8828 },
  { name: 'New Delhi', lat: 28.6139, lng: 77.209 },
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503 },
  { name: 'Pretoria', lat: -25.7479, lng: 28.2293 },
];
