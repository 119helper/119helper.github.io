export interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}

export interface KakaoLatLngBounds {
  extend(position: KakaoLatLng): void;
}

export interface KakaoMapInstance {
  addControl(control: unknown, position: unknown): void;
  panTo(position: KakaoLatLng): void;
  setBounds(bounds: KakaoLatLngBounds): void;
  setCenter(position: KakaoLatLng): void;
  setLevel(level: number): void;
}

export interface KakaoMarker {
  getPosition(): KakaoLatLng;
  setMap(map: KakaoMapInstance | null): void;
  setPosition(position: KakaoLatLng): void;
}

export interface KakaoOverlay {
  setMap(map: KakaoMapInstance | null): void;
}

export type KakaoShapeOverlay = KakaoOverlay;

export interface KakaoInfoWindow {
  close(): void;
  open(map: KakaoMapInstance, marker: KakaoMarker): void;
}

export interface KakaoMarkerClusterer {
  addMarkers(markers: KakaoMarker[]): void;
  clear(): void;
}

export type KakaoSize = object;
export type KakaoMarkerImage = object;

export interface KakaoGeocoderResult {
  address?: {
    address_name: string;
    b_code?: string;
    main_address_no?: string;
    mountain_yn?: string;
    region_1depth_name?: string;
    san_yn?: string;
    sub_address_no?: string;
  };
  x: string;
  y: string;
}

export interface KakaoRegionResult {
  region_type?: string;
  region_1depth_name: string;
  region_2depth_name?: string;
  region_3depth_name?: string;
}

export interface KakaoGeocoder {
  addressSearch(address: string, callback: (result: KakaoGeocoderResult[], status: string) => void): void;
  coord2RegionCode(lng: number, lat: number, callback: (result: KakaoRegionResult[], status: string) => void): void;
}

export interface KakaoMapsNamespace {
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  LatLngBounds: new () => KakaoLatLngBounds;
  Map: new (container: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMapInstance;
  Marker: new (options: { position: KakaoLatLng; map?: KakaoMapInstance | null; title?: string; image?: KakaoMarkerImage }) => KakaoMarker;
  CustomOverlay: new (options: { content: string; position: KakaoLatLng; yAnchor?: number; zIndex?: number }) => KakaoOverlay;
  InfoWindow: new (options: { content: string }) => KakaoInfoWindow;
  Circle: new (options: { center: KakaoLatLng; radius: number; strokeWeight?: number; strokeColor?: string; strokeOpacity?: number; strokeStyle?: string; fillColor?: string; fillOpacity?: number; map?: KakaoMapInstance | null }) => KakaoShapeOverlay;
  Polygon: new (options: { path: KakaoLatLng[]; strokeWeight?: number; strokeColor?: string; strokeOpacity?: number; strokeStyle?: string; fillColor?: string; fillOpacity?: number; map?: KakaoMapInstance | null }) => KakaoShapeOverlay;
  MarkerClusterer?: new (options: { map: KakaoMapInstance; averageCenter: boolean; minLevel: number; disableClickZoom?: boolean; styles?: Record<string, string>[] }) => KakaoMarkerClusterer;
  MarkerImage: new (src: string, size: KakaoSize) => KakaoMarkerImage;
  Size: new (width: number, height: number) => KakaoSize;
  ZoomControl: new () => unknown;
  ControlPosition: { RIGHT: unknown };
  event: { addListener(target: unknown, type: string, handler: (...args: unknown[]) => void): void };
  load(callback: () => void): void;
  services?: {
    Geocoder: new () => KakaoGeocoder;
    Status: { OK: string };
  };
}

declare global {
  interface Window {
    kakao: { maps: KakaoMapsNamespace };
  }
}
