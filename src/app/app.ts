import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, Input, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import { GoogleMap, GoogleMapsModule } from '@angular/google-maps';
import { MarkerClustererComponent } from './components/marker-clusterer/marker-clusterer.component';
import { MapControlsComponent } from './components/map-controls/map-controls.component';
import { MapControlComponent } from './components/map-control/map-control.component';
import { MapDrawingComponent } from './components/map-drawing/map-drawing-control.component';
import { catchError, filter, map, Observable, of, Subject, take, takeUntil, tap } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { DrawerModule } from 'primeng/drawer';
import { AutoCompleteCompleteEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { FormsModule } from '@angular/forms';
import { SelectButton } from 'primeng/selectbutton';
import { Slider } from 'primeng/slider';
import { MapIsochroneComponent } from './components/map-isochrone/map-isochrone.component';
import { ProgressBarModule } from 'primeng/progressbar';
import { LoadProgressService } from './services/load-progress.service';
import { HttpClient } from '@angular/common/http';
import { Feature, FeatureCollection, GeoJsonProperties, Geometry, MultiPolygon, Point, Polygon } from 'geojson';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import pointsWithinPolygon from '@turf/points-within-polygon';
import { SelectButtonModule } from 'primeng/selectbutton';
import { featureCollection } from '@turf/helpers';
import { IconDrawComponent } from './components/icons/draw/draw.component';
import { IconDrawSelectedComponent } from './components/icons/draw-selected/draw-selected.component';
import { IconIsochroneComponent } from './components/icons/isochrone/isochrone.component';
import { IconIsochroneSelectedComponent } from './components/icons/isochrone-selected/isochrone-selected.component';
import { MapFullscreenComponent } from './components/map-fullscreen/map-fullscreen.component';
import { MapZoomControlComponent } from './components/map-zoom-control/map-zoom-control.component';
import { MapFilterComponent } from './components/map-filter/map-filter.component';
import { MapFilterStateService } from './components/map-filter/services/map-filter.service';

type Mode = 'draw' | 'isochrone';
export interface AreaProvider {
  /** Текущая область (Polygon/MultiPolygon) как FeatureCollection */
  getGeoJson$(): Observable<FeatureCollection<Geometry, GeoJsonProperties> | null>;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule,
    GoogleMapsModule,
    ButtonModule,
    ToggleButtonModule,
    MarkerClustererComponent,
    MapControlsComponent,
    MapControlComponent,
    AutoCompleteModule,
    FormsModule,
    DrawerModule,
    SelectButton,
    Slider,
    MapZoomControlComponent,
    MapFullscreenComponent,
    SelectButtonModule,
    MapIsochroneComponent,
    MapFilterComponent,
    MapDrawingComponent, ProgressBarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnDestroy, OnInit  {
  protected readonly title = signal('gmaps-ui');
  @ViewChild(GoogleMap) mapCmp!: GoogleMap;
  @ViewChild('drawing') drawing!: MapDrawingComponent;
  @ViewChild('isochrone') isochrone!: MapIsochroneComponent;
  public map: google.maps.Map | null = null;
  public mapOptions: google.maps.MapOptions = {
    center: { lat: 40.41622141966852, lng: -3.703246203018122 },
    zoom: 10,
    disableDefaultUI: true,
    minZoom: 3,
    restriction: { strictBounds: false, latLngBounds: { north: 83.8, south: -83.8, west: -180, east: 180 } },
    mapId: 'a870aaade7ac6f22',
    gestureHandling: 'greedy',
    clickableIcons: false
  };
  private http = inject(HttpClient);
  private destroyRef = inject(DestroyRef);
  public allPointsFC!: FeatureCollection<Point, any>;
  public selectedPoint: { position: google.maps.LatLngLiteral; data: any } | null = null;
  public selectedPointId: string | null = null;
  private pointById = new Map<string, any>()
  public isVisible = false;
  public isFilterVisible = false;
  public isVisiblePanel = true;
  public isVisibleInwofindow = false;
  public points: Array<{ position: google.maps.LatLngLiteral; data?: any; color?: string }> = [];
  public style = {
    strokeColor: '#1a73e8',
    strokeOpacity: 1,
    strokeWeight: 2,
    fillColor: '#1a73e8',
    fillOpacity: 0.2,
    editable: false,
    visible: true
  }
  private _destroy$ = new Subject<boolean>();

  public modeOptions: Array<{
    justify: Mode;
    icon: any;
    iconSelected: any;
  }> = [
      { icon: IconDrawComponent, iconSelected: IconDrawSelectedComponent, justify: 'draw' },
      { icon: IconIsochroneComponent, iconSelected: IconIsochroneSelectedComponent, justify: 'isochrone' }
    ];

  public modevalue: Mode | null = null;
  public totalCount = 0;
  public areaAllowedIds = null;
  public isSelected = (opt: { justify: Mode }) => this.modevalue === opt.justify;

  public onVisibleChangePanel(visible) {
    this.isVisiblePanel = visible;
    this._cdr.detectChanges();
  }

  public onVisibleFilterChange(visible) {
    this.isFilterVisible = !visible;
    this._cdr.detectChanges();
  }


  public selectPoint(point: any) {
    this.selectedPointId = point?.data?.id ?? null;
    this._cdr.detectChanges()
    this.selectedPoint = point;
    this._cdr.detectChanges()
    this.isVisibleInwofindow = true;
    this._cdr.detectChanges()
  }

  constructor(
    private _cdr: ChangeDetectorRef,
    private fs: MapFilterStateService,

  ) {
    this._watchAttributeFilters();
  }

  public onMapInit(map: google.maps.Map) {
    this.map = map;
  }

  public ngAfterViewInit() { }

  public ngOnInit() {
    this.http.get<FeatureCollection<Point, any>>('assets/data/points.json')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((fc) => {
        this.allPointsFC = fc;
        this.totalCount = fc.features.length;
        const views: any[] = [];
        this.pointById.clear();

        for (const f of fc.features) {
          const [lng, lat] = f.geometry.coordinates;
          const view: any = {
            position: { lat, lng },
            data: f.properties,
            color: f.properties?.typeColor,
          };
          views.push(view);
          const id = f.properties?.id ?? String(views.length - 1);
          this.pointById.set(id, view);
        }
        this.points = views;
        this.fs.setItems(fc.features as any);
        this._cdr.detectChanges()
      });
  }

  public ngOnDestroy(): void {
    this._destroy$.next(true);
    this._destroy$.complete();
  }

  public onChangesMode(ev: any) {
    this.drawing?.onRemove();
    this._closeIsochroneAndShowAll();
    if (ev.originalEvent.checked) {
      if (ev.value === 'draw') this.drawing.onDraw();
      if (ev.value === 'isochrone') this.onVisibleSearchChange(true);
      this.modevalue = ev.value;
    } else {
      this.modevalue = null;
    }
  }

  public onVisibleSearchChange(visible: boolean): void {
    this.isVisible = visible;
    this._cdr.detectChanges();
    if (!visible) this._closeIsochroneAndShowAll();
  }

  private _closeIsochroneAndShowAll(): void {
    this.isochrone?.onRemove?.();
    this.areaAllowedIds = null;

    const byAttrs = this.fs.applyOnce();
    const ids = new Set(byAttrs.map(n => n?.properties?.id).filter(Boolean));
    this.applyCombinedFilters(ids);

    this.isVisible = false;
    this.selectedPointId = null;
    this._cdr.detectChanges();
  }

  private _watchAttributeFilters(): void {
    this.fs.filtered$.subscribe(filteredItems => {
      const ids = new Set<string>();
      for (const it of filteredItems ?? []) {
        const id = it?.properties?.id;
        if (id) ids.add(id);
      }
      this.applyCombinedFilters(ids);
    });
  }

  private applyCombinedFilters(attributeIds: Set<string>): void {
    const base = this.areaAllowedIds;
    const finalIds = base
      ? new Set([...attributeIds].filter(id => base.has(id)))
      : attributeIds;

    const next: any[] = [];
    for (const id of finalIds) {
      const v = this.pointById.get(id);
      if (v) next.push(v);
    }
    this.points = next;
    this._cdr.markForCheck();
  }


  get shownCount(): number {
    return this.points.length;
  }

  get isFiltered(): boolean {
    return this.totalCount > 0 && this.shownCount < this.totalCount;
  }


  public onClose(visible: boolean): void {
    this.isVisibleInwofindow = visible;
    this.selectedPointId = null
    this._cdr.detectChanges()
  }

  public onDraw(event) {
    event ? this.drawing.onDraw() : this.drawing.onRemove()
  }

  public onAddFeature(_: google.maps.Data.AddFeatureEvent, src: AreaProvider) {
    this.filterByArea(src);
    this.onClose(false)
  }

  public onSetGeometry(_: google.maps.Data.SetGeometryEvent, src: AreaProvider) {
    this.filterByArea(src);
  }

  public onRemoveFeature(_: google.maps.Data.RemoveFeatureEvent, _src: AreaProvider) {
    this.areaAllowedIds = null;
    this.onClose(false);
    this.isVisibleInwofindow = false;

    const now = this.fs.applyOnce();
    const ids = new Set(now.map(n => n?.properties?.id).filter(Boolean));
    this.applyCombinedFilters(ids);
  }

  private filterByArea(src: AreaProvider) {
    src.getGeoJson$()
      .pipe(
        filter((fc): fc is FeatureCollection<Geometry, GeoJsonProperties> => !!fc),
        take(1),
        takeUntil(this._destroy$),
      )
      .subscribe(fc => this.applyTurfClip(fc));
  }

  private applyTurfClip(drawnFC: FeatureCollection) {
    if (!this.allPointsFC) return;

    const polys: Array<Feature<Polygon | MultiPolygon>> = [];
    for (const f of drawnFC.features) {
      const t = f.geometry?.type;
      if (t === 'Polygon' || t === 'MultiPolygon') polys.push(f as any);
    }
    if (polys.length === 0) {
      this.areaAllowedIds = null;
      const now = this.fs.applyOnce();
      const ids = new Set(now.map(n => n?.properties?.id).filter(Boolean));
      this.applyCombinedFilters(ids);
      return;
    }

    const picked = new Set<string>();
    for (const poly of polys) {
      const insideFC = pointsWithinPolygon(this.allPointsFC, poly);
      for (const pf of insideFC.features) {
        const id = pf.properties?.id ?? '';
        if (id) picked.add(id);
      }
    }

    this.areaAllowedIds = picked;
    const now = this.fs.applyOnce();
    const ids = new Set(now.map(n => n?.properties?.id).filter(Boolean));
    this.applyCombinedFilters(ids);
  }

}


