import {
  Component,
  Input,
  Output,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  NgZone,
  inject,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, forkJoin, from, fromEvent, merge, Observable, Subject, Subscription } from 'rxjs';
import { distinctUntilChanged, filter, map, scan, switchMap, take, takeUntil, tap } from 'rxjs/operators';
import { GoogleMap, MapEventManager } from '@angular/google-maps';
import { simplify } from "@turf/simplify";
import { Feature, FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import { featureCollection, feature } from "@turf/helpers";
import { MapControlComponent } from '../map-control/map-control.component';
import { MapControlsComponent } from '../map-controls/map-controls.component';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { ButtonModule } from 'primeng/button';
@Component({
  selector: 'map-drawing-control',
  templateUrl: './map-drawing-control.component.html',
  styleUrls: ['./map-drawing-control.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    ToggleButtonModule,
    MapControlsComponent, MapControlComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class MapDrawingComponent implements OnInit, OnDestroy {
  public dataLayer?: google.maps.Data;

  public isDraw = false;
  public isEdit = false;

  public readonly _map: GoogleMap = inject(GoogleMap);
  private readonly _ngZone = inject(NgZone);
  public map!: google.maps.Map;

  private readonly _geoJson = new BehaviorSubject<Feature | FeatureCollection | null>(null);
  private readonly _style = new BehaviorSubject<google.maps.Data.StyleOptions>({});
  private readonly _destroy$ = new Subject<void>();

  private drawStartSubscription?: Subscription;
  public shapeExists$ = new BehaviorSubject<boolean>(false);

  private _eventManager = new MapEventManager(this._ngZone);
  private _eventManagerDrawing = new MapEventManager(this._ngZone);
  private _eventManagerDataLayer = new MapEventManager(this._ngZone);

  @Input() public drawMode = 'freehand';
  @Input() public allowMultiple = false;

  private _freehandPolyline?: google.maps.Polyline;
  private _freehandMoveL?: google.maps.MapsEventListener;
  private _freehandUpL?: google.maps.MapsEventListener;
  private _freehandDownL?: google.maps.MapsEventListener;

  private _overlayView?: google.maps.OverlayView;
  private _activePointerId?: number;

  private _ptrDown?: (e: PointerEvent) => void;
  private _ptrMove?: (e: PointerEvent) => void;
  private _ptrUp?: (e: PointerEvent) => void;

  @Input() public isDisabledControl = false;
  @Input() public isShowControl = true;
  @Input() public tolerance = 0.01;
  @Input() public fitBounds = false;

  constructor(private cd: ChangeDetectorRef) { }

  private static readonly DEFAULT_DATA_STYLE: google.maps.Data.StyleOptions = {
    strokeColor: '#1a73e8',
    strokeOpacity: 1,
    strokeWeight: 2,
    fillColor: '#1a73e8',
    fillOpacity: 0.2,
    editable: false,
    visible: true,
  };

  private _applyDataStyle(extra?: Partial<google.maps.Data.StyleOptions>): void {
    if (!this.dataLayer) return;
    const merged = {
      ...MapDrawingComponent.DEFAULT_DATA_STYLE,
      ...this._style.getValue(),
      ...(extra || {}),
    };
    this.dataLayer.setStyle(merged);
  }

  private _setEditable(editable: boolean): void {
    this._applyDataStyle({ editable });
  }

  @Input()
  set geoJson(geometry: Feature | FeatureCollection | null) {
    this._geoJson.next(geometry);
    this.shapeExists$.next(!!geometry);
    this.cd.detectChanges();
  }

  @Input()
  set style(style: google.maps.Data.StyleOptions) {
    this._style.next(style || {});
  }

  @Output() readonly setGeometry: Observable<google.maps.Data.SetGeometryEvent> =
    this._eventManagerDataLayer.getLazyEmitter<google.maps.Data.SetGeometryEvent>('setgeometry');
  @Output() readonly addFeature: Observable<google.maps.Data.SetGeometryEvent> =
    this._eventManagerDataLayer.getLazyEmitter<google.maps.Data.SetGeometryEvent>('addfeature');
  @Output() readonly removeFeature: Observable<google.maps.Data.SetGeometryEvent> =
    this._eventManagerDataLayer.getLazyEmitter<google.maps.Data.SetGeometryEvent>('removefeature');

  public ngOnInit(): void {
    if (this._map._isBrowser) {
      this._ngZone.runOutsideAngular(() => {
        forkJoin({ map: from(this._map._resolveMap()) }).subscribe(({ map }) => {
          this._initialize(map);
        });
      });
    }
  }

  private _initialize(map: google.maps.Map): void {
    this.map = map;

    this._ngZone.runOutsideAngular(() => {
      this.dataLayer = new google.maps.Data({ map });
      this._eventManagerDataLayer.setTarget(this.dataLayer);
      this._eventManager.setTarget(map);
      this._applyDataStyle();

      this._overlayView = new google.maps.OverlayView();
      this._overlayView.onAdd = () => { };
      this._overlayView.onRemove = () => { };
      this._overlayView.draw = () => { };
      this._overlayView.setMap(map);

      this._watchForGeoJsonChanges();
      this._watchForStyleChanges();
    });
  }

  public ngOnDestroy(): void {
    this._cancelFreehand();
    this._eventManagerDrawing.destroy();
    this._eventManagerDataLayer.destroy();
    this._eventManager.destroy();
    this.drawStartSubscription?.unsubscribe();
    this._destroy$.next();
    this._destroy$.complete();
    this._removeDownListener();
  }

  private _watchForStyleChanges(): void {
    this._style
      .pipe(
        takeUntil(this._destroy$),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))
      )
      .subscribe(() => this._applyDataStyle());
  }

  private _watchForGeoJsonChanges(): void {
    this._geoJson
      .pipe(
        takeUntil(this._destroy$),
        filter((g): g is Feature | FeatureCollection => !!g)
      )
      .subscribe(geoJson => {
        const simplified = this.simplifyFeatureCollection(geoJson, this.tolerance);
        this._removeAllFeaturesSafe();
        const features = this.dataLayer!.addGeoJson(simplified);

        this._setEditable(false);

        if (this.fitBounds && features.length > 0) {
          const bounds = new google.maps.LatLngBounds();
          features.forEach(f => this.extendBoundsFromFeature(f, bounds));
          this._map.googleMap?.fitBounds(bounds);
        }
      });
  }

  private _removeAllFeaturesSafe(): void {
    if (!this.dataLayer) return;
    const toRemove: google.maps.Data.Feature[] = [];
    this.dataLayer?.forEach(f => toRemove?.push(f));
    toRemove?.forEach(f => this.dataLayer?.remove(f));
  }

  private extendBoundsFromFeature(feature: google.maps.Data.Feature, bounds: google.maps.LatLngBounds): void {
    const geometry = feature.getGeometry();
    if (geometry?.getType() === 'Polygon') {
      const polygon = geometry as google.maps.Data.Polygon;
      polygon.getArray().forEach((ring: google.maps.Data.LinearRing) => {
        ring.getArray().forEach((latlng: google.maps.LatLng) => bounds.extend(latlng));
      });
    } else if (geometry?.getType() === 'MultiPolygon') {
      const multiPolygon = geometry as google.maps.Data.MultiPolygon;
      multiPolygon.getArray().forEach((polygon: google.maps.Data.Polygon) => {
        polygon.getArray().forEach((ring: google.maps.Data.LinearRing) => {
          ring.getArray().forEach((latlng: google.maps.LatLng) => bounds.extend(latlng));
        });
      });
    }
  }

  private _latLngFromPointer(e: PointerEvent): google.maps.LatLng | null {
    if (!this.map || !this._overlayView) return null;
    const proj = this._overlayView.getProjection();
    if (!proj) return null;

    const rect = (this.map.getDiv() as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ll = proj.fromContainerPixelToLatLng(new google.maps.Point(x, y));
    return ll ?? null;
  }

  private _startFreehand(): void {
    if (!this.map) return;

    this._setEditable(false);

    this.map.setOptions({
      clickableIcons: false,
      draggable: false,
      gestureHandling: 'none' as any,
      disableDoubleClickZoom: true,
    });
    this.map.set('draggableCursor', 'crosshair');

    const div = this.map.getDiv() as HTMLElement;
    const prevTouchAction = div.style.touchAction;
    div.style.touchAction = 'none';

    const polyOpts: google.maps.PolylineOptions = {
      map: this.map,
      strokeColor: this._style.getValue()?.strokeColor,
      strokeOpacity: this._style.getValue()?.strokeOpacity,
      strokeWeight: this._style.getValue()?.strokeWeight,
      clickable: false,
      editable: false,
    };
    this._freehandPolyline = new google.maps.Polyline(polyOpts);
    const path = this._freehandPolyline.getPath();

    this._ptrDown = (ev: PointerEvent) => {
      if (this._activePointerId != null) return;
      if (ev.pointerType === 'mouse' && ev.buttons !== 1) return;

      this._activePointerId = ev.pointerId;
      try { (div as any).setPointerCapture?.(ev.pointerId); } catch { }
      ev.preventDefault();

      const ll = this._latLngFromPointer(ev);
      if (ll) path.push(ll);
    };

    this._ptrMove = (ev: PointerEvent) => {
      if (this._activePointerId !== ev.pointerId) return;
      ev.preventDefault();

      const ll = this._latLngFromPointer(ev);
      if (ll) path.push(ll);
    };

    const finish = () => {
      if (this._activePointerId != null && (div as any).hasPointerCapture?.(this._activePointerId)) {
        try { (div as any).releasePointerCapture(this._activePointerId); } catch { }
      }
      this._activePointerId = undefined;

      if (this._ptrDown) div.removeEventListener('pointerdown', this._ptrDown, { capture: true } as any);
      if (this._ptrMove) div.removeEventListener('pointermove', this._ptrMove, { capture: true } as any);
      if (this._ptrUp) {
        window.removeEventListener('pointerup', this._ptrUp, { capture: true } as any);
        window.removeEventListener('pointercancel', this._ptrUp, { capture: true } as any);
      }
      this._ptrDown = this._ptrMove = this._ptrUp = undefined;

      const pts = path.getArray().slice();
      this._freehandPolyline?.setMap(null);
      this._freehandPolyline = undefined;

      if (pts.length >= 3) {
        const ring: number[][] = pts.map(ll => [ll.lng(), ll.lat()]);
        const [lng0, lat0] = ring[0];
        const [lngN, latN] = ring[ring.length - 1];
        if (lng0 !== lngN || lat0 !== latN) ring.push([lng0, lat0]);

        if (!this.allowMultiple) {
          this._removeAllFeaturesSafe();
        }

        const features = this.dataLayer!.addGeoJson(
          feature({ type: 'Polygon', coordinates: [ring] }, {})
        );
        this.shapeExists$.next(true);

        if (this.fitBounds && features.length > 0) {
          const bounds = new google.maps.LatLngBounds();
          features.forEach(f => this.extendBoundsFromFeature(f, bounds));
          this._map.googleMap?.fitBounds(bounds);
        }
      }

      this.map.setOptions({
        draggable: true,
        gestureHandling: 'auto' as any,
        disableDoubleClickZoom: false,
      });
      this.map.set('draggableCursor', null);
      div.style.touchAction = prevTouchAction;

      this.isDraw = false;
      this.cd.detectChanges();
    };

    this._ptrUp = (ev: PointerEvent) => {
      if (this._activePointerId !== ev.pointerId) return;
      ev.preventDefault();
      finish();
    };

    div.addEventListener('pointerdown', this._ptrDown, { passive: false, capture: true });
    div.addEventListener('pointermove', this._ptrMove, { passive: false, capture: true });
    window.addEventListener('pointerup', this._ptrUp, { passive: false, capture: true });
    window.addEventListener('pointercancel', this._ptrUp, { passive: false, capture: true });
  }

  private _cancelFreehand(): void {
    this._stopFreehandListeners();
    this.map?.setOptions?.({ draggableCursor: null, draggable: true, gestureHandling: 'auto' as any });
    const div = this.map?.getDiv?.() as HTMLElement | undefined;
    if (div) div.style.touchAction = '';
  }

  private _stopFreehandListeners(): void {
    this._stopFreehandListenersExceptDown();

    const div = this.map?.getDiv?.() as HTMLElement | undefined;
    if (div) {
      if (this._ptrDown) div.removeEventListener('pointerdown', this._ptrDown, { capture: true } as any);
      if (this._ptrMove) div.removeEventListener('pointermove', this._ptrMove, { capture: true } as any);
    }
    if (this._ptrUp) {
      window.removeEventListener('pointerup', this._ptrUp, { capture: true } as any);
      window.removeEventListener('pointercancel', this._ptrUp, { capture: true } as any);
    }
    this._ptrDown = this._ptrMove = this._ptrUp = undefined;
    this._activePointerId = undefined;

    if (this._freehandPolyline) {
      this._freehandPolyline.setMap(null);
      this._freehandPolyline = undefined;
    }
  }

  private _stopFreehandListenersExceptDown(): void {
    this._freehandMoveL?.remove();
    this._freehandUpL?.remove();
    this._freehandMoveL = this._freehandUpL = undefined;

    if (this._freehandPolyline) {
      this._freehandPolyline.setMap(null);
      this._freehandPolyline = undefined;
    }
  }

  private _removeDownListener(): void {
    this._freehandDownL?.remove();
    this._freehandDownL = undefined;
  }

  public onEdit(): void {
    this._setEditable(true);
    this._cancelFreehand();
  }

  public onStop(): void {
    this._setEditable(false);
  }

  public onRemove(): void {
    this._cancelFreehand();
    this._removeAllFeaturesSafe();
    this.shapeExists$.next(false);
  }

  public cancelDrawing(): void {
    this._cancelFreehand();
    this._setEditable(false);
    this.isDraw = false;
    this.cd.detectChanges();
  }

  public onDraw(): void {
    this._setEditable(false);
    if (!this.allowMultiple) this.onRemove();
    this._startFreehand();
    this.cd.detectChanges();
  }

  public toggleDraw(): void {
    this.isDraw = !this.isDraw;
    this.onDrawChange({ checked: this.isDraw });
    if (this.isDraw) this.isEdit = false;
  }

  public onDrawChange(event: { checked: boolean } | boolean): void {
    const on = typeof event === 'boolean' ? event : !!event?.checked;
    if (on) {
      if (!this.allowMultiple) this.onRemove();
      this._startFreehand();
    } else {
      this._cancelFreehand();
    }
  }

  public onEditChange({ checked }: { checked: boolean }): void {
    this._setEditable(checked);
    if (checked) this._cancelFreehand();
  }

  private simplifyFeatureCollection(
    input: Feature | FeatureCollection,
    baseTolerance: number
  ): FeatureCollection {
    const features: Feature[] = input.type === 'FeatureCollection' ? input.features : [input];
    const simplifiedFeatures: Feature[] = [];

    for (const f of features) {
      try {
        const geom = f.geometry as any;
        let pointCount = 0;

        if (geom.type === 'Polygon') {
          pointCount = geom.coordinates.reduce((acc: number, ring: any[]) => acc + ring.length, 0);
        } else if (geom.type === 'MultiPolygon') {
          pointCount = geom.coordinates.reduce(
            (acc: number, polygon: any[]) => acc + polygon.reduce((innerAcc: number, ring: any[]) => innerAcc + ring.length, 0),
            0
          );
        }

        const adjustedTolerance =
          pointCount > 500 ? baseTolerance :
            pointCount > 200 ? baseTolerance * 0.5 :
              pointCount > 100 ? baseTolerance * 0.3 :
                pointCount > 50 ? baseTolerance * 0.1 : 0;

        const simplified = simplify(f as any, { tolerance: adjustedTolerance, highQuality: false, mutate: false }) as any;

        if (simplified.geometry.type === 'Polygon' || simplified.geometry.type === 'MultiPolygon') {
          simplifiedFeatures.push(feature(simplified.geometry, (f as any).properties) as any);
        }
      } catch (e) {
        console.warn('Simplify error:', e);
      }
    }

    return featureCollection(simplifiedFeatures) as FeatureCollection<Geometry, GeoJsonProperties>;
  }

  public closeRing(coords: number[][]): number[][] {
    if (coords.length < 2) return coords;
    const [firstLng, firstLat] = coords[0];
    const [lastLng, lastLat] = coords[coords.length - 1];
    if (firstLng !== lastLng || firstLat !== lastLat) return [...coords, coords[0]];
    return coords;
  }

  public autoCloseGeometry(geometry: Geometry): Geometry {
    if (geometry.type === 'Polygon') {
      const rings = (geometry.coordinates as number[][][]).map(ring => this.closeRing(ring));
      return { ...geometry, coordinates: rings } as any;
    }
    if (geometry.type === 'MultiPolygon') {
      const normalized = (geometry.coordinates as any[]).map((poly: any) => {
        const rings = Array.isArray(poly[0][0]) ? poly : [poly];
        return rings.map((ring: number[][]) => this.closeRing(ring));
      });
      return { ...geometry, coordinates: normalized } as any;
    }
    return geometry;
  }

  public getGeoJson(): Promise<FeatureCollection | null> {
    return new Promise(resolve => {
      if (!this.dataLayer) return resolve(null);
      this.dataLayer.toGeoJson((data: object) => {
        const collection = data as FeatureCollection;
        for (const f of collection.features) {
          if (f.geometry) f.geometry = this.autoCloseGeometry(f.geometry);
        }
        resolve(collection);
      });
    });
  }

  public getGeoJson$(): Observable<FeatureCollection | null> {
    return from(this.getGeoJson());
  }
}












