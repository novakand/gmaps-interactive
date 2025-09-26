import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, Input, signal, ViewChild } from '@angular/core';
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
type Tool = 'draw' | 'visible';
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
export class App {
  public showProgress: boolean = false;
  protected readonly title = signal('gmaps-ui');
  @ViewChild(GoogleMap) mapCmp!: GoogleMap;
  @ViewChild('drawing') drawing!: MapDrawingComponent;
  @ViewChild('isochrone') isochrone!: MapIsochroneComponent;
  map: google.maps.Map | null = null;
  private http = inject(HttpClient);
  public fullscreenClass = 'c-map';
  private destroyRef = inject(DestroyRef);
  value3: string = 'Expert';
  value5: number = 20;
  public  allPointsFC!: FeatureCollection<Point, any>;
  // отображение: то, что рисуем на карт
  // индекс для быстрого доступа к вьюшке по id
  selectedPoint: { position: google.maps.LatLngLiteral; data: any } | null = null;
  selectedPointId: string | null = null;
  private pointById = new Map<string, any>()
  public isVisible = false;
  public isFilterVisible = false;
  public isVisiblePanel = true;
  public isVisibleInwofindow = false;
  private allPoints: Array<{ position: google.maps.LatLngLiteral; data?: any; color?: string }> = [];
  points: Array<{ position: google.maps.LatLngLiteral; data?: any; color?: string }> = [];
  private clipPolys: google.maps.Polygon[] = [];
  private clipBounds?: google.maps.LatLngBounds;
  private _destroy$ = new Subject<boolean>();
  //icon: IconCenterComponent,  iconSelected
  justifyOptions: Array<{
    justify: Mode;
    icon: any;
    iconSelected: any;
  }> = [
      { icon: IconDrawComponent, iconSelected: IconDrawSelectedComponent, justify: 'draw' },
      { icon: IconIsochroneComponent, iconSelected: IconIsochroneSelectedComponent, justify: 'isochrone' }
    ];

  // текущее значение (инициализируйте, чтобы не было undefined)
  value: Mode | null = null;
  totalCount = 0;
  areaAllowedIds=null;
  // удобный хелпер (не обязателен)
  isSelected = (opt: { justify: Mode }) => this.value === opt.justify;
  options: google.maps.MapOptions = {
    center: { lat: 40.41622141966852, lng: -3.703246203018122 },
    zoom: 10,
    disableDefaultUI: true,
    minZoom: 3,
    restriction: { strictBounds: false, latLngBounds: { north: 83.8, south: -83.8, west: -180, east: 180 } },
    mapId: 'a870aaade7ac6f22',
    gestureHandling: 'greedy',
    clickableIcons: false
  };

  drawerOpen = false;

  public onVisibleChangePanel(visible) {
    this.isVisiblePanel = visible;
    this._cdr.detectChanges();
  }

   public onVisibleFilterChange(visible) {
    this.isFilterVisible = !visible;
    this._cdr.detectChanges();
  }

  openDrawer() { this.drawerOpen = true; }
  closeDrawer() { this.drawerOpen = false; }
  toggleDrawer() { this.isVisible = !this.isVisible; }

  selectPoint(p: any) {
    console.log('selectPoint', p)
    this.selectedPointId = p?.data?.id ?? null;
    this._cdr.detectChanges()
    this.selectedPoint = p;
    this._cdr.detectChanges()
    this.isVisibleInwofindow = true;
    this._cdr.detectChanges()
  }

  markers = [
    { position: { lat: 59.334591, lng: 18.06324 }, title: 'Center' },
  ];

  activeTool: Tool | null = null;

  constructor(
    private _loadProgressService: LoadProgressService,
    private _cdr: ChangeDetectorRef,
    private fs: MapFilterStateService,  

  ) {
    this._watchForLoadProgress();
     this._watchAttributeFilters();   

  }

  public onChangesMode(event) {
    console.log(event)
    event.value === 'draw' ? this.drawing.onDraw() : this.drawing.onRemove();
    event.value === 'isochrone' ? this.onVisibleChange(event.originalEvent.checked) : this.onVisibleChange(false)

  }


  private _watchAttributeFilters() {
    this.fs.filtered$.subscribe(filteredItems => {
      // соберём id из отфильтрованных элементов
      const ids = new Set<string>();
      for (const it of filteredItems ?? []) {
        const id = it?.properties?.id;
        if (id) ids.add(id);
      }
      this.applyCombinedFilters(ids);
    });
  }

  /** общий пересчёт points с учётом areaAllowedIds ∩ attributeIds */
  private applyCombinedFilters(attributeIds: Set<string>) {
    // если нет фильтра по области — берём только атрибутный набор
    const base = this.areaAllowedIds;
    const finalIds = base
      ? new Set([...attributeIds].filter(id => base.has(id)))
      : attributeIds;

    // превращаем id → вьюхи (pointById собран ранее)
    const next: any[] = [];
    for (const id of finalIds) {
      const v = this.pointById.get(id);
      if (v) next.push(v);
    }
    this.points = next;
    this._cdr.detectChanges();
  }

  private _watchForLoadProgress(): void {
    this._loadProgressService.inProgress
      .subscribe((progress: boolean) => {
        this.showProgress = progress;
      });
  }


  get shownCount(): number {
    return this.points.length;
  }

  /** есть ли активный фильтр области */
  get isFiltered(): boolean {
    return this.totalCount > 0 && this.shownCount < this.totalCount;
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

  public fitBounds() {
    //  if (this.fitBounds && features.length > 0) {
    //       const bounds = new google.maps.LatLngBounds();
    //       features.forEach(f => this.extendBoundsFromFeature(f, bounds));
    //       this.map?.fitBounds(bounds);
    //     }
  }


  public onVisibleChange(visible: boolean): void {
    this.isVisible = visible;
    this._cdr.detectChanges()
    !visible && this.isochrone?.onRemove();

  }

  public onClose(visible: boolean) {
    this.isVisibleInwofindow = visible;
    this.selectedPointId = null
    this._cdr.detectChanges()
  }

  style = {
    strokeColor: '#1a73e8',
    strokeOpacity: 1,
    strokeWeight: 2,
    fillColor: '#1a73e8',
    fillOpacity: 0.2,
    editable: false,   // по умолчанию фигуры НЕ редактируем
    visible: true
  }
  items: any[] = [];


  onMapInit(map: google.maps.Map) {
    this.map = map;
  }


  ngAfterViewInit() { }

  public onDraw(event) {
    event ? this.drawing.onDraw() : this.drawing.onRemove()
    console.log(event, 'event')
    // if (event) {
    //   this.drawing.onDraw();
    // } else {
    //   this.drawing.onRemove(); // или this.drawing.onStop() / _cancelFreehand() по вашей логике
    // }
  }

  public onAddFeature(_: google.maps.Data.AddFeatureEvent, src: AreaProvider) {
    this.filterByArea(src);
    this.onClose(false)
  }

  public onSetGeometry(_: google.maps.Data.SetGeometryEvent, src: AreaProvider) {
    this.filterByArea(src);
  }

 public onRemoveFeature(_: google.maps.Data.RemoveFeatureEvent, _src: AreaProvider) {
  this.areaAllowedIds = null; // нет ограничения по области
  this.onClose(false);
  this.isVisibleInwofindow = false;

  const now = this.fs.applyOnce();
  const ids = new Set(now.map(n => n?.properties?.id).filter(Boolean));
  this.applyCombinedFilters(ids);
}

  /** Общая функция для обоих источников */
  private filterByArea(src: AreaProvider) {
    src.getGeoJson$()
      .pipe(
        filter((fc): fc is FeatureCollection<Geometry, GeoJsonProperties> => !!fc),
        take(1),
        takeUntil(this._destroy$),
      )
      .subscribe(fc => this.applyTurfClip(fc));
  }

  /** Оставляем точки, которые попадают внутрь нарисованных Polygon/MultiPolygon */
 private applyTurfClip(drawnFC: FeatureCollection) {
  if (!this.allPointsFC) return;

  const polys: Array<Feature<Polygon | MultiPolygon>> = [];
  for (const f of drawnFC.features) {
    const t = f.geometry?.type;
    if (t === 'Polygon' || t === 'MultiPolygon') polys.push(f as any);
  }
  if (polys.length === 0) {
    // нет валидной области — значит фильтра по области нет
    this.areaAllowedIds = null;
    // Пересчёт только по атрибутным фильтрам: пусть сервис отдаст текущие ids
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

  // сохранили «разрешённые по области» id
  this.areaAllowedIds = picked;

  // возьмём текущий атрибутный результат и пересчитаем
  const now = this.fs.applyOnce();
  const ids = new Set(now.map(n => n?.properties?.id).filter(Boolean));
  this.applyCombinedFilters(ids);
}


  // public onAddFeature(data) {
  //   this.drawing.getGeoJson$()
  //     .pipe(
  //       filter(Boolean),
  //       take(1),
  //       takeUntil(this._destroy$),
  //       tap((geoJson) => console.log(geoJson))
  //     )
  //     .subscribe();
  // }

  ngOnInit() {
    this.http.get<FeatureCollection<Point, any>>('assets/data/points.json')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((fc) => {
        this.allPointsFC = fc;
        this.totalCount = fc.features.length;
        // соберём массив для рендера и индекс по id
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
        this.points = views; // старт: показываем все
         this.fs.setItems(fc.features as any);
        this._cdr.detectChanges()
      });
  }


}


