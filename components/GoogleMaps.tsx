"use client";
import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  InfoWindow,
} from "@react-google-maps/api";
import { Button, Dropdown, Radio, Tooltip } from "antd";
import { Layers, Maximize2, Minimize2, ChevronUp, ChevronDown } from "lucide-react";
import { Job, JobType } from "@/types/job.type";
import { createCustomMarkerIcon } from "@/utils/customMapMarker";

// Declared outside the component to keep the reference stable across renders.
// Including 'drawing' here ensures the DrawingManager in ServiceZoneMap works
// even though both components share the same useJsApiLoader id.
export const GOOGLE_MAPS_LIBRARIES: ("drawing" | "geometry" | "places")[] = [
  "drawing",
  "geometry",
  "places",
];

type MapType = "roadmap" | "satellite" | "hybrid" | "terrain";

const containerStyle = {
  width: "100%",
  height: "100%",
};

const mapTypeStyles: React.CSSProperties = {
  position: "absolute",
  top: "10px",
  right: "10px",
  zIndex: 1,
  backgroundColor: "white",
  borderRadius: "0px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
  padding: "8px 0",
};

const defaultCenter = {
  lat: 37.7749,
  lng: -122.4194,
};

interface MarkerData {
  id: string | number;
  position: google.maps.LatLngLiteral;
  title?: string;
  description?: string;
  duration?: number;
  timeWindowStart?: string;
  timeWindowEnd?: string;
  jobType?: JobType | string;
  jobData?: Pick<Job, "id" | "address_formatted" | "status" | "location"> | Job | any;
  sequenceNumber?: number;
  color?: string;
  isDepot?: boolean;
  /** "start" | "end" | "depot" — which route endpoint this depot marker is. */
  depotKind?: string;
  draggable?: boolean;
  /** Index of the route this marker belongs to, used for route focus filtering. */
  routeIndex?: number;
}

interface PolylineData {
  id?: string;
  path: google.maps.LatLngLiteral[];
  options?: google.maps.PolylineOptions;
}

interface GoogleMapsProps {
  center?: google.maps.LatLngLiteral;
  zoom?: number;
  markers?: MarkerData[];
  polylines?: PolylineData[];
  InfoWindowModal?: React.FC<{ marker: MarkerData }>;
  selectedMarkerId?: string | number | null;
  onMarkerSelect?: (markerId: string | number | null) => void;
  /** Fired when the user clicks empty map space (not a marker or polyline). */
  onMapClick?: () => void;
  onMarkerDragEnd?: (
    markerId: string | number,
    newPosition: google.maps.LatLngLiteral,
  ) => void;
  showMapTypeControl?: boolean;
  showZoomControl?: boolean;
  showDirectionArrows?: boolean;
  onToggleFullscreen?: () => void;
  onToggleCollapse?: () => void;
  mapViewState?: "normal" | "fullscreen" | "collapsed";
}

const GoogleMaps: React.FC<GoogleMapsProps> = ({
  center = defaultCenter,
  zoom = 12,
  markers = [],
  polylines = [],
  InfoWindowModal,
  selectedMarkerId,
  onMarkerSelect,
  onMapClick,
  onMarkerDragEnd,
  showMapTypeControl = true,
  showZoomControl = true,
  showDirectionArrows = false,
  onToggleFullscreen,
  onToggleCollapse,
  mapViewState = "normal",
}) => {
  const { isLoaded } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY || "",
    version: "3.64",
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
  const [mapTypeId, setMapTypeId] = useState<MapType>("roadmap");
  const [selectedMarker, setSelectedMarker] = useState<MarkerData | null>(null);

  // Hold a state to the google.maps.Map instance so that its initialization triggers useEffect hooks.
  const [map, setMap] = useState<google.maps.Map | null>(null);
  // Hold references to all native google.maps.Polyline instances currently on the map.
  const nativePolylinesRef = useRef<google.maps.Polyline[]>([]);

  const onLoad = useCallback(
    function callback(mapInstance: google.maps.Map) {
      setMap(mapInstance);
      mapInstance.setCenter(center);
      mapInstance.setZoom(zoom);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const onUnmount = useCallback(() => {
    // Clean up all native polylines when the map unmounts.
    nativePolylinesRef.current.forEach((p) => p.setMap(null));
    nativePolylinesRef.current = [];
    setMap(null);
  }, []);

  const handleMapTypeChange = (type: MapType) => {
    setMapTypeId(type);
  };

  // Sync selected marker with external selectedMarkerId prop & trigger 3-jump bounce animation
  const [bouncingMarkerId, setBouncingMarkerId] = useState<string | number | null>(null);

  useEffect(() => {
    if (selectedMarkerId !== undefined && selectedMarkerId !== null) {
      const marker = markers.find((m) => String(m.id) === String(selectedMarkerId));
      setSelectedMarker(marker || null);
      setBouncingMarkerId(null);
      const rAF = requestAnimationFrame(() => {
        setBouncingMarkerId(selectedMarkerId);
      });
      const timer = setTimeout(() => {
        setBouncingMarkerId(null);
      }, 2100); // 3 bounce cycles (~700ms each)
      return () => {
        cancelAnimationFrame(rAF);
        clearTimeout(timer);
      };
    } else {
      setSelectedMarker(null);
      setBouncingMarkerId(null);
    }
  }, [selectedMarkerId, markers]);

  // Imperatively manage native google.maps.Polyline instances.
  // This guarantees old polylines are fully removed from the canvas whenever
  // the polylines prop changes — React declarative <Polyline> components from
  // @react-google-maps/api are not reliable for this because they can leave
  // orphaned native canvas objects behind when the list shrinks or changes.
  useEffect(() => {
    if (!map) return;

    // Destroy every existing native polyline.
    nativePolylinesRef.current.forEach((p) => p.setMap(null));
    nativePolylinesRef.current = [];

    // Create fresh native polylines for the current prop value.
    nativePolylinesRef.current = polylines.map((line) => {
      return new google.maps.Polyline({
        path: line.path,
        map: map,
        ...line.options,
      });
    });

    // Cleanup when effect re-runs or component unmounts.
    return () => {
      nativePolylinesRef.current.forEach((p) => p.setMap(null));
      nativePolylinesRef.current = [];
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polylines, map]);

  if (!isLoaded) {
    return <></>;
  }

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
      zoom={zoom}
      onLoad={onLoad}
      onUnmount={onUnmount}
      onClick={() => onMapClick?.()}
      options={{
        mapTypeId: mapTypeId,
        disableDefaultUI: true,
        zoomControl: showZoomControl ? true : false,
        styles: [
          {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "off" }],
          },
        ],
      }}
    >
      {/* Unified Map Controls Toolbar (Fullscreen, Collapse, Layers) */}
      {(onToggleFullscreen || onToggleCollapse || showMapTypeControl) && (
        <div
          style={{
            position: "absolute",
            top: "10px",
            right: "10px",
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            backgroundColor: "white",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            border: "1px solid #d9d9d9",
            borderRadius: "0px",
          }}
        >
          {onToggleFullscreen && (
            <Tooltip title={mapViewState === "fullscreen" ? "Exit Fullscreen" : "Fullscreen Map"}>
              <Button
                type="text"
                onClick={onToggleFullscreen}
                aria-label="Toggle Fullscreen Map"
                style={{
                  height: "38px",
                  width: "38px",
                  padding: 0,
                  borderRadius: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                className={`transition-colors ${
                  mapViewState === "fullscreen"
                    ? "!bg-[#003220] !text-white hover:!bg-[#002518] hover:!text-white"
                    : "hover:!bg-emerald-50 hover:!text-[#003220] text-gray-700"
                }`}
              >
                {mapViewState === "fullscreen" ? (
                  <Minimize2 size={16} color="#ffffff" />
                ) : (
                  <Maximize2 size={16} />
                )}
              </Button>
            </Tooltip>
          )}

          {onToggleCollapse && (
            <>
              {onToggleFullscreen && <div className="w-[1px] h-5 bg-gray-200" />}
              <Tooltip title={mapViewState === "collapsed" ? "Expand Map View" : "Collapse Map View"}>
                <Button
                  type="text"
                  onClick={onToggleCollapse}
                  aria-label="Toggle Collapse Map"
                  style={{
                    height: "38px",
                    width: "38px",
                    padding: 0,
                    borderRadius: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  className={`transition-colors ${
                    mapViewState === "collapsed"
                      ? "!bg-[#003220] !text-white hover:!bg-[#002518] hover:!text-white"
                      : "hover:!bg-emerald-50 hover:!text-[#003220] text-gray-700"
                  }`}
                >
                  {mapViewState === "collapsed" ? (
                    <ChevronDown size={16} color="#ffffff" />
                  ) : (
                    <ChevronUp size={16} />
                  )}
                </Button>
              </Tooltip>
            </>
          )}

          {showMapTypeControl && (
            <>
              {(onToggleFullscreen || onToggleCollapse) && <div className="w-[1px] h-5 bg-gray-200" />}
              <Dropdown
                popupRender={() => (
                  <div style={mapTypeStyles}>
                    <Radio.Group
                      value={mapTypeId}
                      onChange={(e) => handleMapTypeChange(e.target.value as MapType)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                        padding: "0 12px",
                      }}
                    >
                      <Radio value="roadmap">Roadmap</Radio>
                      <Radio value="satellite">Satellite</Radio>
                      <Radio value="hybrid">Hybrid</Radio>
                      <Radio value="terrain">Terrain</Radio>
                    </Radio.Group>
                  </div>
                )}
                trigger={["hover", "click"]}
                placement="bottomRight"
              >
                <Button
                  type="text"
                  style={{
                    height: "38px",
                    width: "38px",
                    padding: 0,
                    borderRadius: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#1f2937",
                  }}
                  className="hover:!bg-emerald-50 hover:!text-[#003220] transition-colors"
                >
                  <Layers size={16} />
                </Button>
              </Dropdown>
            </>
          )}
        </div>
      )}

      {/* Child components, such as markers, info windows, etc. */}
      {markers.map((marker) => {
        const markerNumber =
          marker.sequenceNumber ?? marker.jobData?.id ?? marker.id;

        const status =
          (marker.jobData && "status" in marker.jobData
            ? marker.jobData.status
            : undefined) || "draft";

        const isSelected =
          selectedMarker?.id === marker.id ||
          (selectedMarkerId !== undefined &&
            selectedMarkerId !== null &&
            String(selectedMarkerId) === String(marker.id));

        const isBouncing =
          bouncingMarkerId !== null &&
          String(bouncingMarkerId) === String(marker.id);

        const depotLabel = marker.isDepot
          ? marker.depotKind === "start"
            ? "Start"
            : marker.depotKind === "end"
              ? "End"
              : "Depot"
          : undefined;

        const icon = createCustomMarkerIcon(
          markerNumber,
          status,
          isSelected,
          marker.color,
          marker.isDepot,
          depotLabel,
        );

        return (
          <Marker
            key={marker.id}
            position={marker.position}
            title={marker.title}
            icon={icon}
            draggable={marker.draggable}
            zIndex={isSelected ? 9999 : (marker.sequenceNumber ?? 1)}
            animation={
              isBouncing && typeof window !== "undefined" && window.google?.maps?.Animation
                ? window.google.maps.Animation.BOUNCE
                : undefined
            }
            onClick={() => {
              setSelectedMarker(marker);
              setBouncingMarkerId(marker.id);
              setTimeout(() => setBouncingMarkerId(null), 2100);
              onMarkerSelect?.(marker.id);
            }}
            onDragEnd={(e) => {
              if (e.latLng && onMarkerDragEnd) {
                onMarkerDragEnd(marker.id, {
                  lat: e.latLng.lat(),
                  lng: e.latLng.lng(),
                });
              }
            }}
          />
        );
      })}

      {selectedMarker && InfoWindowModal && (
        <InfoWindow
          position={selectedMarker.position}
          onCloseClick={() => {
            setSelectedMarker(null);
            onMarkerSelect?.(null);
          }}
          options={{
            pixelOffset: new window.google.maps.Size(0, -30),
          }}
        >
          <InfoWindowModal marker={selectedMarker} />
        </InfoWindow>
      )}
    </GoogleMap>
  );
};

export default React.memo(GoogleMaps);
