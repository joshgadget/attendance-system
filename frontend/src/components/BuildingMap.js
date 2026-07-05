import React, { useEffect, useRef, useState } from 'react';

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_DRAW_CSS = 'https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css';
const LEAFLET_DRAW_JS = 'https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js';

export default function BuildingMap({ center, polygonCoordinates, onPolygonChange, readOnly }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const drawnItemsRef = useRef(null);
  const drawControlRef = useRef(null);
  const markerRef = useRef(null);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [L, setL] = useState(null);

  useEffect(() => {
    if (document.getElementById('leaflet-css')) {
      loadLeaflet();
      return;
    }
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = LEAFLET_CSS;
    document.head.appendChild(link);

    const drawLink = document.createElement('link');
    drawLink.id = 'leaflet-draw-css';
    drawLink.rel = 'stylesheet';
    drawLink.href = LEAFLET_DRAW_CSS;
    document.head.appendChild(drawLink);

    loadLeaflet();
  }, []);

  const loadLeaflet = () => {
    if (window.L) {
      initLeaflet(window.L);
      return;
    }
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.onload = () => {
      const drawScript = document.createElement('script');
      drawScript.src = LEAFLET_DRAW_JS;
      drawScript.onload = () => initLeaflet(window.L);
      document.body.appendChild(drawScript);
    };
    document.body.appendChild(script);
  };

  const initLeaflet = (L) => {
    setL(L);
    setLeafletLoaded(true);
  };

  useEffect(() => {
    if (!leafletLoaded || !L || !mapRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapRef.current, {
      center: center ? [center[0], center[1]] : [6.988, 3.902],
      zoom: 17,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnItemsRef.current = drawnItems;

    if (polygonCoordinates && polygonCoordinates.length >= 3) {
      const latLngs = polygonCoordinates.map(([lng, lat]) => [lat, lng]);
      const polygon = L.polygon(latLngs, { color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.2, weight: 2 });
      drawnItems.addLayer(polygon);
      map.fitBounds(polygon.getBounds().pad(0.1));
    } else if (center) {
      markerRef.current = L.circleMarker([center[0], center[1]], {
        radius: 8,
        color: '#ef4444',
        fillColor: '#ef4444',
        fillOpacity: 0.8,
        weight: 2,
      }).addTo(map);
    }

    if (!readOnly) {
      const drawControl = new L.Control.Draw({
        edit: { featureGroup: drawnItems },
        draw: {
          polygon: { allowIntersection: false, showArea: true, shapeOptions: { color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.2, weight: 2 } },
          polyline: false,
          rectangle: false,
          circle: false,
          circlemarker: false,
          marker: false,
        },
      });
      map.addControl(drawControl);
      drawControlRef.current = drawControl;

      map.on(L.Draw.Event.CREATED, (event) => {
        drawnItems.clearLayers();
        drawnItems.addLayer(event.layer);
        extractPolygon(event.layer, onPolygonChange);
      });

      map.on(L.Draw.Event.EDITED, () => {
        drawnItems.eachLayer((layer) => extractPolygon(layer, onPolygonChange));
      });

      map.on(L.Draw.Event.DELETED, () => {
        if (onPolygonChange) onPolygonChange(null);
      });
    }

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [leafletLoaded, L, center && center[0], center && center[1], readOnly]);

  const extractPolygon = (layer, callback) => {
    if (!callback) return;
    const latLngs = layer.getLatLngs();
    if (latLngs.length === 0) return;
    const coords = latLngs[0].map((ll) => [ll.lng, ll.lat]);
    callback(coords);
  };

  return (
    <div className="building-map-wrapper">
      <div ref={mapRef} style={{ height: '400px', width: '100%', borderRadius: '12px', zIndex: 0 }} />
      {!leafletLoaded && (
        <div className="flex items-center justify-center h-[400px] bg-slate-100 rounded-xl text-slate-500 text-sm">
          Loading map...
        </div>
      )}
    </div>
  );
}
