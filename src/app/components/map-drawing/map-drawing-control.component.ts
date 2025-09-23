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
import { BehaviorSubject, concat, defer, forkJoin, from, fromEventPattern, interval, Observable, of, race, Subject, Subscription } from 'rxjs';
import { filter, map, switchMap, take, takeUntil, tap } from 'rxjs/operators';
import { GoogleMap, MapEventManager } from '@angular/google-maps';
import { simplify } from "@turf/simplify";
import { DEFAULT_DRAWING_OPTIONS } from './constants/drawing-options.constant';
import { Feature, FeatureCollection, GeoJsonProperties, Geometry, MultiPolygon, Polygon, Position } from 'geojson';
import { featureCollection, feature } from "@turf/helpers";
import { MapControlComponent } from '../map-control/map-control.component';
import { MapControlsComponent } from '../map-controls/map-controls.component';
import { TerraDraw, TerraDrawFreehandLineStringMode, TerraDrawPolygonMode } from 'terra-draw';
import { TerraDrawGoogleMapsAdapter } from 'terra-draw-google-maps-adapter';
@Component({
  selector: 'map-drawing-control',
  templateUrl: './map-drawing-control.component.html',
  styleUrls: ['./map-drawing-control.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    MapControlsComponent, MapControlComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class MapDrawingComponent implements OnInit, OnDestroy {
  public readonly _map: GoogleMap = inject(GoogleMap);
  private readonly _ngZone = inject(NgZone);
  private _eventManager = new MapEventManager(this._ngZone);
  private _destroy$ = new Subject<void>();
  private _gmap!: google.maps.Map;
  private _tdraw?: TerraDraw;
  _isFreehand = false;

  
  public ngOnInit(): void {
   if (!this._map._isBrowser) return;

  this._ngZone.runOutsideAngular(() => {
    from(this._map._resolveMap())
      .pipe(take(1))
      .subscribe((map) => this._initialize(map));
  });
  }

  private _initialize(map: google.maps.Map): void {
     if (this._tdraw) return;
    this._ngZone.runOutsideAngular(() => {
      this._eventManager.setTarget(map);
      this._gmap = map
      this._eventManager.getLazyEmitter('tilesloaded')
        .pipe(take(1), tap(() => this.initTerraDraw()))
        .subscribe()
    });
  }


  ngOnDestroy(): void {
    try { this._tdraw?.stop(); } catch { }
    this._eventManager.destroy();
    this._destroy$.next();
    this._destroy$.complete();
  }

  private initTerraDraw(): void {
    const adapter = new TerraDrawGoogleMapsAdapter({
      lib: google.maps,
      map: this._gmap,
      coordinatePrecision: 9,
    });

    this._tdraw = new TerraDraw({
      adapter,
      modes: [
        new TerraDrawPolygonMode({
          styles: {
            // fillColor: '#1a73e8',
            // fillOpacity: 0.2,
            // outlineColor: '#1a73e8',
            // outlineWidth: 2,
          },
        }),
        new TerraDrawFreehandLineStringMode({
          styles: {
            // lineStringColor: '#1a73e8',
            // lineStringWidth: 2,
          },
        }),
      ],
    });

    this._tdraw.start();
    (this._tdraw as any).setMode?.('static');
    this._isFreehand = false;

    (this._tdraw as any).on(
      'finish',
      (ids: string[], ctx: { mode: string; action: string }) => {
        if (ctx?.mode === 'freehand-linestring' && ctx?.action === 'draw') {
          this._collapseLineStringToPolygon(ids?.[ids.length - 1]);
          this._setMapGestures(false);
        }
      }
    );
  }

  /** Схлопнуть последнюю LineString в Polygon и оставить ровно одну фигуру */
  private _collapseLineStringToPolygon(possibleId?: string): void {
    const td: any = this._tdraw;
    if (!td) return;

    // 1) берём снимок и находим созданную линию:
    const snapshot: any = td.getSnapshot?.();
    const all: any[] = Array.isArray(snapshot) ? snapshot : (snapshot?.features ?? []);

    // по id -> иначе — последняя LineString
    let line: any =
      possibleId &&
      all.find((f) => f?.id === possibleId && f?.geometry?.type === 'LineString');
    if (!line) {
      const lines = all.filter((f) => f?.geometry?.type === 'LineString');
      line = lines.length ? lines[lines.length - 1] : undefined;
    }
    if (!line) return;

    const coords: number[][] = line.geometry?.coordinates ?? [];
    if (coords.length < 3) {
      line.id && td.removeFeatures?.([line.id]);
      td.setMode?.('static');
      this._isFreehand = false;
      return;
    }

    // 2) замыкаем кольцо и создаём полигон
    const ring = [...coords];
    const [lng0, lat0] = ring[0];
    const [lngN, latN] = ring[ring.length - 1];
    if (lng0 !== lngN || lat0 !== latN) ring.push([lng0, lat0]);

    td.addFeatures?.([
      {
        type: 'Feature',
        properties: { mode: 'polygon' }, // чтобы PolygonMode применил стиль
        geometry: { type: 'Polygon', coordinates: [ring] },
      },
    ]);

    // 3) удаляем исходную линию (если есть id) и подчистим любые LineString
    line.id && td.removeFeatures?.([line.id]);
    const after1: any = td.getSnapshot?.();
    const a1: any[] = Array.isArray(after1) ? after1 : (after1?.features ?? []);
    const lineIds = a1
      .filter((f) => f?.geometry?.type === 'LineString')
      .map((f) => f?.id)
      .filter((id): id is string => typeof id === 'string');
    if (lineIds.length) td.removeFeatures?.(lineIds);

    // 4) держим ровно один полигон
    const after2: any = td.getSnapshot?.();
    const a2: any[] = Array.isArray(after2) ? after2 : (after2?.features ?? []);
    const polygonIds = a2
      .filter((f) => f?.geometry?.type === 'Polygon')
      .map((f) => f?.id)
      .filter((id): id is string => typeof id === 'string');
    if (polygonIds.length > 1) {
      const keep = polygonIds[polygonIds.length - 1];
      const toRemove = polygonIds.filter((id) => id !== keep);
      toRemove.length && td.removeFeatures?.(toRemove);
    }

    // 5) выключаем рисование
    td.setMode?.('static');
    this._isFreehand = false;
  }


  /* ------------ UI ------------ */

  public toggleDraw(): void {
    if (!this._tdraw) return;

    const td: any = this._tdraw;
    const mode = td.getMode?.();

    // выключение
    if (mode === 'freehand-linestring') {
      td.setMode?.('static');
      this._isFreehand = false;
      this._setMapGestures(false);
      return;
    }

    // перед стартом чистим всё (гарантируем одну фигуру)
    const snap: any = td.getSnapshot?.();
    const feats = Array.isArray(snap) ? snap : (snap?.features ?? []);
    const ids = feats.map((f: any) => f?.id).filter((id: any): id is string => typeof id === 'string');
    if (ids.length) td.removeFeatures?.(ids);

    // включаем режим
    td.setMode?.('freehand-linestring');
    this._isFreehand = true;
    this._setMapGestures(true); 
  }

  private _setMapGestures(lock: boolean) {
  if (!this._gmap) return;

 if (!this._gmap) return;

  const div = this._gmap.getDiv() as HTMLElement;

  this._gmap.setOptions(
    lock
      ? {
          draggable: false,
          disableDoubleClickZoom: true,
          keyboardShortcuts: false,
          gestureHandling: 'none' as any,
          clickableIcons: false,
        }
      : {
          draggable: true,
          disableDoubleClickZoom: false,
          keyboardShortcuts: true,
          gestureHandling: 'greedy' as any, // можно 'auto', но greedy обычно удобнее
          clickableIcons: true,
        }
  );

  // важно для iOS/Safari: гарантируем, что тач-движения не уйдут в скролл/панорамирование
  div.style.touchAction = lock ? 'none' : '';
  (div.style as any).webkitUserSelect = lock ? 'none' : ''; // доп. защита на iOS
  (this._gmap as any).set('draggableCursor', lock ? 'crosshair' : null);
}
}