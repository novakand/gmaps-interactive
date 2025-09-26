import {
    AfterContentInit,
  ApplicationRef,
  Component,
  ContentChild,
  EmbeddedViewRef,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  TemplateRef,
} from '@angular/core';
import { MarkerClusterer, SuperClusterAlgorithm, GridAlgorithm } from '@googlemaps/markerclusterer';

export type ClusterPoint = {
  position: google.maps.LatLngLiteral;
  title?: string;
  data?: any;
};

@Component({
  selector: 'app-marker-clusterer',
  standalone: true,
  template: '' // слой без UI
})
export class MarkerClustererComponent implements OnChanges, OnDestroy, AfterContentInit {
  /** Карта */
  @Input() map: google.maps.Map | null | undefined;

  /** Точки */
  @Input() points: ClusterPoint[] = [];

  /** Алгоритм: 'grid' | 'super' */
  @Input() algorithm: 'grid' | 'super' = 'super';

  // Параметры алгоритмов
  @Input() maxZoom?: number;   // общий
  @Input() gridSize = 60;      // GridAlgorithm
  @Input() radius = 200;       // SuperClusterAlgorithm
  @Input() minPoints = 2;      // SuperClusterAlgorithm

  /** Шаблон маркера (HTML для AdvancedMarkerElement) */
  @ContentChild('marker', { read: TemplateRef, static: true })
  markerTpl?: TemplateRef<any>;

  /** Шаблон кластера (HTML для AdvancedMarkerElement) */
  @ContentChild('cluster', { read: TemplateRef, static: true })
  clusterTpl?: TemplateRef<any>;

  private contentReady = false;
  private clusterer?: MarkerClusterer;

  // ⚠️ только AdvancedMarkerElement
  private markerInstances: google.maps.marker.AdvancedMarkerElement[] = [];
  private markerViews: EmbeddedViewRef<any>[] = [];
  private clusterViews: EmbeddedViewRef<any>[] = [];

  // дебаунс перестройки
  private rebuildScheduled = false;

  constructor(private appRef: ApplicationRef, private ngZone: NgZone) {}

  ngAfterContentInit(): void {
    this.contentReady = true;
    this.scheduleRebuild();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.contentReady) return;

    // мелкая оптимизация: если нет карты — смысла нет
    if (changes['map'] && !this.map) return;

    // Если points ссылка та же и не менялись другие входы — не перестраиваем
    if (changes['points'] && changes['points'].previousValue === changes['points'].currentValue) {
      // пропускаем; другие входы всё равно могут триггерить
    }

    this.scheduleRebuild();
  }

  ngOnDestroy(): void {
    this.destroyClusterer();
  }

  private ensureAdvancedAvailable() {
    const has = !!(google.maps as any).marker?.AdvancedMarkerElement;
    if (!has) {
      throw new Error(
        "[MarkerClustererComponent] 'AdvancedMarkerElement' not available. " +
        "Load Google Maps JS API with libraries=marker."
      );
    }
  }

  /** Планирует rebuild в конце тика (склеивает множественные изменения) */
  private scheduleRebuild() {
    if (this.rebuildScheduled) return;
    this.rebuildScheduled = true;
    Promise.resolve().then(() => {
      this.rebuildScheduled = false;
      this.rebuild();
    });
  }

  private rebuild() {
    if (!this.map) return;
    this.ensureAdvancedAvailable();

    // тяжёлую работу — вне Angular
    this.ngZone.runOutsideAngular(() => {
      this.destroyClusterer();

      // Маркеры (AdvancedMarkerElement)
      this.markerInstances = this.points.map((p) => this.createAdvancedMarker(p));

      // Алгоритм
      const algorithm =
        this.algorithm === 'super'
          ? new SuperClusterAlgorithm({
              maxZoom: this.maxZoom,
              radius: this.radius,
              minPoints: this.minPoints,
            })
          : new GridAlgorithm({
              maxZoom: this.maxZoom,
              gridSize: this.gridSize,
            });

      // Рендерер кластеров (тоже AdvancedMarkerElement)
      const renderer = {
        render: (args: any) => {
          const { count, position, markers } = args;

          // Если есть шаблон — рендерим как раньше (с Angular View)
          if (this.clusterTpl) {
            const { el } = this.renderTemplate(
              this.clusterTpl,
              { $implicit: count, count, position, markers },
              'cluster'
            );
            return new google.maps.marker.AdvancedMarkerElement({
              position,
              content: el,
              zIndex: 100 + count,
            });
          }

          // Иначе — лёгкий DOM без Angular View (быстрее)
          const el = this.createDefaultClusterEl(count);
          return new google.maps.marker.AdvancedMarkerElement({
            position,
            content: el,
            zIndex: 100 + count,
            gmpClickable: true,
          });
        },
      };

      this.clusterer = new MarkerClusterer({
        map: this.map!,
        markers: this.markerInstances as any,
        algorithm,
        renderer: renderer as any,
      });
    });
  }

  private createAdvancedMarker(p: ClusterPoint) {
    // Если пользователь дал шаблон — рендерим как раньше
    if (this.markerTpl) {
      const { el } = this.renderTemplate(this.markerTpl, { $implicit: p, point: p }, 'marker');
      return new google.maps.marker.AdvancedMarkerElement({
        position: p.position,
        title: p.title,
        content: el,
        gmpClickable: true,
      });
    }

    // Иначе — лёгкий DOM (без Angular View) => сильно быстрее
    const el = this.createDefaultPinEl(p);
    return new google.maps.marker.AdvancedMarkerElement({
      position: p.position,
      title: p.title,
      content: el,
      gmpClickable: true,
    });
  }

  /** Рендерит ng-template в HTMLElement и подключает View к Angular CD (как было) */
  private renderTemplate<T>(
    tpl: TemplateRef<T>,
    context: T,
    bucket: 'marker' | 'cluster'
  ): { el: HTMLElement; view: EmbeddedViewRef<T> } {
    const view = tpl.createEmbeddedView(context);
    this.appRef.attachView(view);
    const container = document.createElement('div');
    view.rootNodes.forEach((node) => container.appendChild(node));
    (bucket === 'marker' ? this.markerViews : this.clusterViews).push(view);
    return { el: container, view };
  }

  /** Лёгкий pin-элемент (если #marker не задан) */
  private createDefaultPinEl(p: ClusterPoint): HTMLElement {
    const root = document.createElement('div');
    root.className = 'pin';
    const dot = document.createElement('span');
    dot.className = 'dot';
    root.appendChild(dot);
    return root;
  }

  /** Лёгкий элемент кластера (если #cluster не задан) */
  private createDefaultClusterEl(count: number): HTMLElement {
    const el = document.createElement('div');
    el.className = 'cluster-badge';
    el.textContent = String(count);
    return el;
  }

  private destroyClusterer() {
    if (this.clusterer) {
      this.clusterer.clearMarkers();
      this.clusterer.setMap(null);
      this.clusterer = undefined;
    }

    // AdvancedMarkerElement: снять с карты
    for (const m of this.markerInstances) (m as any).map = null;
    this.markerInstances = [];

    // если создавали Angular View (только когда есть шаблоны) — почистить
    for (const v of this.markerViews) {
      this.appRef.detachView(v);
      v.destroy();
    }
    for (const v of this.clusterViews) {
      this.appRef.detachView(v);
      v.destroy();
    }
    this.markerViews = [];
    this.clusterViews = [];
  }
}