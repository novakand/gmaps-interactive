import {
  TerraDrawChanges,
  SetCursor,
  TerraDrawStylingFunction,
  TerraDrawExtend,
} from "terra-draw";
import { GeoJsonObject } from "geojson";

export class DrawGoogleMapsAdapter extends TerraDrawExtend.TerraDrawBaseAdapter {
  constructor(
    config: {
      lib: typeof google.maps;
      map: google.maps.Map;
    } & TerraDrawExtend.BaseAdapterConfig,
  ) {
    super(config);
    this._lib = config.lib;
    this._map = config.map;

    this._coordinatePrecision =
      typeof config.coordinatePrecision === "number"
        ? config.coordinatePrecision
        : 9;
  }

  private _cursor: string | undefined;
  private _cursorStyleSheet: HTMLStyleElement | undefined;
  private _lib: typeof google.maps;
  private _map: google.maps.Map;
  private _overlay: google.maps.OverlayView | undefined;

  // Google listeners
  private _clickEventListener?: google.maps.MapsEventListener;

  // DOM (mobile) listeners
  private _pointerDownHandler?: (e: PointerEvent) => void;
  private _pointerMoveHandler?: (e: PointerEvent) => void;
  private _pointerUpHandler?: (e: PointerEvent) => void;
  private _touchStartHandler?: (e: TouchEvent) => void;
  private _touchMoveHandler?: (e: TouchEvent) => void;
  private _touchEndHandler?: (e: TouchEvent) => void;

  // event element + CSS restore
  private _eventEl?: HTMLElement;
  private _prevTouchAction?: string;

  private _readyCalled = false;

  private get _layers(): boolean {
    return Boolean(this.renderedFeatureIds?.size > 0);
  }

  private circlePath(cx: number, cy: number, r: number) {
    const d = r * 2;
    return `M ${cx} ${cy} m -${r}, 0 a ${r},${r} 0 1,0 ${d},0 a ${r},${r} 0 1,0 -${d},0`;
  }

  public register(callbacks: TerraDrawExtend.TerraDrawCallbacks) {
    super.register(callbacks);

    // ── Overlay для проекций px <-> LatLng (как в оригинале)
    this._overlay = new this._lib.OverlayView();
    this._overlay.draw = function () {};
    this._overlay.onAdd = () => {
      if (this._currentModeCallbacks?.onReady && !this._readyCalled) {
        this._currentModeCallbacks.onReady();
        this._readyCalled = true;
      }
    };
    this._overlay.onRemove = () => {};
    this._overlay.setMap(this._map);

    // ── Проксируем click по Data (нужно, т.к. он "съедает" click карты)
    this._clickEventListener = this._map.data.addListener(
      "click",
      (
        event: google.maps.MapMouseEvent & {
          domEvent: MouseEvent;
        },
      ) => {
        const l = this._listeners.find(({ name }) => name === "click");
        l?.callback(event);
      },
    );

    // ── Базовый слой событий: TerraDraw Base сам повесит mouse/pointer на element из getMapEventElement()
    //     Чтобы на мобилках движение не съедали жесты браузера — дадим элементу touch-action: none.
    this._eventEl = this.getMapEventElement();
    if (this._eventEl) {
      this._prevTouchAction = this._eventEl.style.touchAction;
      this._eventEl.style.touchAction = "none";
    }

    // ── ДОБАВКА: форвард мобильных указателей прямо в adapter callbacks (не трогаем мышь)
    const el = this._eventEl || (this._map.getDiv() as HTMLElement);

    const toLatLng = (clientX: number, clientY: number) => {
      if (!this._overlay) return null;
      const proj = this._overlay.getProjection?.();
      if (!proj) return null;
      const r = el.getBoundingClientRect();
      const pt = new this._lib.Point(clientX - r.left, clientY - r.top);
      return proj.fromContainerPixelToLatLng(pt);
    };

    // единый форвард в внутреннюю шину TerraDraw Base
    const forward = (
      name: "mousedown" | "mousemove" | "mouseup",
      latLng: google.maps.LatLng | null,
      domEvent: Event,
    ) => {
      const l = this._listeners.find(({ name: n }) => n === name);
      if (!l) return;
      // некоторые режимы допускают отсутствие latLng в mouseup
      if (latLng) l.callback({ latLng, domEvent } as any);
      else l.callback({ domEvent } as any);
    };

    if ("PointerEvent" in window) {
      // Только touch/pen; мышь не трогаем (ПК и так работает)
      this._pointerDownHandler = (e: PointerEvent) => {
        if (e.pointerType === "mouse") return;
        (el as any).setPointerCapture?.(e.pointerId);
        forward("mousedown", toLatLng(e.clientX, e.clientY), e);
        e.preventDefault();
        e.stopPropagation();
      };
      this._pointerMoveHandler = (e: PointerEvent) => {
        if (e.pointerType === "mouse") return;
        forward("mousemove", toLatLng(e.clientX, e.clientY), e);
        e.preventDefault();
        e.stopPropagation();
      };
      this._pointerUpHandler = (e: PointerEvent) => {
        if (e.pointerType === "mouse") return;
        forward("mouseup", toLatLng(e.clientX, e.clientY), e);
        e.preventDefault();
        e.stopPropagation();
      };

      el.addEventListener("pointerdown", this._pointerDownHandler, { passive: false });
      el.addEventListener("pointermove", this._pointerMoveHandler, { passive: false });
      el.addEventListener("pointerup", this._pointerUpHandler, { passive: false });
      el.addEventListener("pointercancel", this._pointerUpHandler, { passive: false });
    } else {
      // Старые iOS/Android: Touch Events
      this._touchStartHandler = (e: TouchEvent) => {
        const t = e.touches[0]; if (!t) return;
        forward("mousedown", toLatLng(t.clientX, t.clientY), e);
        e.preventDefault();
        e.stopPropagation();
      };
      this._touchMoveHandler = (e: TouchEvent) => {
        const t = e.touches[0]; if (!t) return;
        forward("mousemove", toLatLng(t.clientX, t.clientY), e);
        e.preventDefault();
        e.stopPropagation();
      };
      this._touchEndHandler = (e: TouchEvent) => {
        // координаты в end могут отсутствовать — ок
        forward("mouseup", null, e);
        e.preventDefault();
        e.stopPropagation();
      };

      el.addEventListener("touchstart", this._touchStartHandler, { passive: false });
      el.addEventListener("touchmove", this._touchMoveHandler, { passive: false });
      el.addEventListener("touchend", this._touchEndHandler, { passive: false });
      el.addEventListener("touchcancel", this._touchEndHandler, { passive: false });
    }
  }

  public unregister(): void {
    super.unregister();

    // Google
    this._clickEventListener?.remove();

    // DOM (mobile)
    const el = this._eventEl || (this._map.getDiv() as HTMLElement);

    if (this._pointerDownHandler) {
      el.removeEventListener("pointerdown", this._pointerDownHandler);
      el.removeEventListener("pointermove", this._pointerMoveHandler!);
      el.removeEventListener("pointerup", this._pointerUpHandler!);
      el.removeEventListener("pointercancel", this._pointerUpHandler!);
      this._pointerDownHandler = this._pointerMoveHandler = this._pointerUpHandler = undefined;
    }
    if (this._touchStartHandler) {
      el.removeEventListener("touchstart", this._touchStartHandler);
      el.removeEventListener("touchmove", this._touchMoveHandler!);
      el.removeEventListener("touchend", this._touchEndHandler!);
      el.removeEventListener("touchcancel", this._touchEndHandler!);
      this._touchStartHandler = this._touchMoveHandler = this._touchEndHandler = undefined;
    }

    if (this._eventEl && this._prevTouchAction !== undefined) {
      this._eventEl.style.touchAction = this._prevTouchAction;
      this._prevTouchAction = undefined;
      this._eventEl = undefined;
    }

    if (this._overlay && this._overlay.getMap()) {
      this._overlay.setMap(null);
    }
    this._overlay = undefined;
    this._readyCalled = false;
  }

  /**
   * ВАЖНО: TerraDraw Base берёт DOM-события с этого элемента.
   * На Google Maps корректный "event pane" может отличаться по слоям, поэтому:
   * 1) сначала пробуем оригинальный селектор из репо (z-index: 3),
   * 2) затем устойчивые варианты,
   * 3) в крайнем случае корневой div карты.
   */
  public getMapEventElement() {
    const root = this._map.getDiv() as HTMLDivElement;

    let el = root.querySelector('div[style*="z-index: 3;"]') as HTMLDivElement | null;
    if (el) return el;

    el = root.querySelector(".gm-style > div:nth-child(2)") as HTMLDivElement | null;
    if (el) return el;

    el = root.querySelector(".gm-style > div") as HTMLDivElement | null;
    if (el) return el;

    return root;
  }

  // ── координаты по событию ────────────────────────────────────────────────
  getLngLatFromEvent(event: PointerEvent | MouseEvent) {
    if (!this._overlay) throw new Error("cannot get overlay");

    const bounds = this._map.getBounds();
    if (!bounds) return null;

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const latLngBounds = new this._lib.LatLngBounds(sw, ne);

    const mapCanvas = this._map.getDiv();
    const rect = mapCanvas.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const screenCoord = new this._lib.Point(offsetX, offsetY);

    const projection = this._overlay.getProjection();
    if (!projection) return null;

    const latLng = projection.fromContainerPixelToLatLng(screenCoord);
    if (latLng && latLngBounds.contains(latLng)) {
      return { lng: latLng.lng(), lat: latLng.lat() };
    } else {
      return null;
    }
  }

  // ── project/unproject ────────────────────────────────────────────────────
  project(lng: number, lat: number) {
    if (!this._overlay) throw new Error("cannot get overlay");

    const bounds = this._map.getBounds();
    if (bounds === undefined) throw new Error("cannot get bounds");

    const projection = this._overlay.getProjection();
    if (projection === undefined) throw new Error("cannot get projection");

    const point = projection.fromLatLngToContainerPixel(
      new this._lib.LatLng(lat, lng),
    );

    if (point === null) throw new Error("cannot project coordinates");

    return { x: point.x, y: point.y };
  }

  unproject(x: number, y: number) {
    if (!this._overlay) throw new Error("cannot get overlay");

    const projection = this._overlay.getProjection();
    if (projection === undefined) throw new Error("cannot get projection");

    const latLng = projection.fromContainerPixelToLatLng(
      new this._lib.Point(x, y),
    );

    if (latLng === null) throw new Error("cannot unproject coordinates");

    return { lng: latLng.lng(), lat: latLng.lat() };
  }

  // ── курсор ───────────────────────────────────────────────────────────────
  setCursor(cursor: Parameters<SetCursor>[0]) {
    if (cursor === this._cursor) return;

    if (this._cursorStyleSheet) {
      this._cursorStyleSheet.remove();
      this._cursorStyleSheet = undefined;
    }

    if (cursor !== "unset") {
      const div = this._map.getDiv();
      const styleDiv = div.querySelector(".gm-style > div");

      if (styleDiv) {
        styleDiv.classList.add("terra-draw-google-maps");

        const style = document.createElement("style");
        style.innerHTML = `.terra-draw-google-maps { cursor: ${cursor} !important; }`;
        document.head.appendChild(style);
        this._cursorStyleSheet = style;
      }
    }

    this._cursor = cursor;
  }

  setDoubleClickToZoom(enabled: boolean) {
    this._map.setOptions({ disableDoubleClickZoom: !enabled ? true : false });
  }

  setDraggability(enabled: boolean) {
    this._map.setOptions({ draggable: enabled });
  }

  // ── рендер (как в оригинале) ─────────────────────────────────────────────
  private renderedFeatureIds: Set<TerraDrawExtend.FeatureId> = new Set();

  render(changes: TerraDrawChanges, styling: TerraDrawStylingFunction) {
    if (this._layers) {
      changes.deletedIds.forEach((deletedId) => {
        const featureToDelete = this._map.data.getFeatureById(deletedId);
        if (featureToDelete) {
          this._map.data.remove(featureToDelete);
          this.renderedFeatureIds.delete(deletedId);
        }
      });

      changes.updated.forEach((updatedFeature) => {
        if (!updatedFeature || !updatedFeature.id) {
          throw new Error("Feature is not valid");
        }

        const featureToUpdate = this._map.data.getFeatureById(
          updatedFeature.id,
        );

        if (!featureToUpdate) {
          throw new Error("Feature could not be found by Google Maps API");
        }

        // Remove all keys
        featureToUpdate.forEachProperty((_property, name) => {
          featureToUpdate.setProperty(name, undefined);
        });

        // Update all keys
        Object.keys(updatedFeature.properties).forEach((property) => {
          featureToUpdate.setProperty(
            property,
            updatedFeature.properties[property],
          );
        });

        switch (updatedFeature.geometry.type) {
          case "Point": {
            const coordinates = updatedFeature.geometry.coordinates as [
              number,
              number,
            ];

            featureToUpdate.setGeometry(
              new this._lib.Data.Point(
                new this._lib.LatLng(coordinates[1], coordinates[0]),
              ),
            );
            break;
          }
          case "LineString": {
            const coordinates = updatedFeature.geometry.coordinates as [
              number,
              number,
            ][];
            const path: google.maps.LatLng[] = [];
            for (let i = 0; i < coordinates.length; i++) {
              const [lng, lat] = coordinates[i];
              path.push(new this._lib.LatLng(lat, lng));
            }
            featureToUpdate.setGeometry(new this._lib.Data.LineString(path));
            break;
          }
          case "Polygon": {
            const coordinates = updatedFeature.geometry.coordinates as [
              number,
              number,
            ][][];
            const paths: google.maps.LatLng[][] = [];
            for (let i = 0; i < coordinates.length; i++) {
              const path: google.maps.LatLng[] = [];
              for (let j = 0; j < coordinates[i].length; j++) {
                const [lng, lat] = coordinates[i][j];
                path.push(new this._lib.LatLng(lat, lng));
              }
              paths.push(path);
            }
            featureToUpdate.setGeometry(new this._lib.Data.Polygon(paths));
            break;
          }
        }
      });

      // Create new features
      changes.created.forEach((createdFeature) => {
        this.renderedFeatureIds.add(createdFeature.id as string);
        this._map.data.addGeoJson(createdFeature);
      });
    }

    changes.created.forEach((feature) => {
      this.renderedFeatureIds.add(feature.id as string);
    });

    const featureCollection = {
      type: "FeatureCollection",
      features: [...changes.created],
    } as GeoJsonObject;

    this._map.data.addGeoJson(featureCollection);

    this._map.data.setStyle((feature) => {
      const mode = feature.getProperty("mode");
      const gmGeometry = feature.getGeometry();
      if (!gmGeometry) {
        throw new Error("Google Maps geometry not found");
      }
      const type = gmGeometry.getType();
      const properties: Record<string, any> = {};
      const id = feature.getId();

      feature.forEachProperty((value, property) => {
        properties[property] = value;
      });

      // @ts-ignore
      const calculatedStyles = styling[mode]({
        type: "Feature",
        id,
        geometry: {
          type: type as "Point" | "LineString" | "Polygon",
          coordinates: [],
        },
        properties,
      });

      switch (type) {
        case "Point": {
          const path = this.circlePath(0, 0, calculatedStyles.pointWidth);

          return {
            clickable: false,
            icon: {
              path,
              fillColor: calculatedStyles.pointColor,
              fillOpacity: 1,
              strokeColor: calculatedStyles.pointOutlineColor,
              strokeWeight: calculatedStyles.pointOutlineWidth,
              rotation: 0,
              scale: 1,
            },
            zIndex: calculatedStyles.zIndex,
          };
        }

        case "LineString":
          return {
            strokeColor: calculatedStyles.lineStringColor,
            strokeWeight: calculatedStyles.lineStringWidth,
            zIndex: calculatedStyles.zIndex,
          };

        case "Polygon":
          return {
            strokeColor: calculatedStyles.polygonOutlineColor,
            strokeWeight: calculatedStyles.polygonOutlineWidth,
            fillOpacity: calculatedStyles.polygonFillOpacity,
            fillColor: calculatedStyles.polygonFillColor,
            zIndex: calculatedStyles.zIndex,
          };
      }

      throw Error("Unknown feature type");
    });
  }

  private clearLayers() {
    if (this._layers) {
      this._map.data.forEach((feature) => {
        const id = feature.getId() as string;
        const hasFeature = this.renderedFeatureIds.has(id);
        if (hasFeature) {
          this._map.data.remove(feature);
        }
      });
      this.renderedFeatureIds = new Set();
    }
  }

  public clear() {
    if (this._currentModeCallbacks) {
      this._currentModeCallbacks.onClear();
      this.clearLayers();
    }
  }

  public getCoordinatePrecision(): number {
    return super.getCoordinatePrecision();
  }
}
