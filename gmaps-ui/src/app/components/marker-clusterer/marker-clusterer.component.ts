import {
    AfterContentInit,
  ApplicationRef,
  Component,
  ContentChild,
  EmbeddedViewRef,
  Input,
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
export class MarkerClustererComponent
  implements OnChanges, OnDestroy, AfterContentInit {

  /** Карта */
  @Input() map: google.maps.Map | null | undefined;

  /** Точки */
  @Input() points: ClusterPoint[] = [];

  /** Алгоритм: 'grid' | 'super' */
  @Input() algorithm: 'grid' | 'super' = 'super';

  // Параметры алгоритмов
  @Input() maxZoom?: number;   // общий
  @Input() gridSize = 60;      // GridAlgorithm
  @Input() radius = 200;        // SuperClusterAlgorithm
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

  constructor(private appRef: ApplicationRef) {}

  ngAfterContentInit(): void {
    this.contentReady = true;
    this.rebuild();
  }

  ngOnChanges(_: SimpleChanges): void {
    if (this.contentReady) this.rebuild();
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

  private rebuild() {
    if (!this.map) return;
    this.ensureAdvancedAvailable();

    this.destroyClusterer();

    // Маркеры (всегда AdvancedMarkerElement)
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
        const { el } = this.renderTemplate(
          this.clusterTpl ?? this.defaultClusterTpl(),
          { $implicit: count, count, position, markers },
          'cluster'
        );
        return new google.maps.marker.AdvancedMarkerElement({
          position,
          content: el,
          zIndex: 100 + count,
        });
      },
    };

    this.clusterer = new MarkerClusterer({
      map: this.map,
      markers: this.markerInstances as any,
      algorithm,
      renderer: renderer as any,
    });
  }

  private createAdvancedMarker(p: ClusterPoint) {
    const tpl = this.markerTpl ?? this.defaultMarkerTpl();
    const { el } = this.renderTemplate(tpl, { $implicit: p, point: p }, 'marker');
    return new google.maps.marker.AdvancedMarkerElement({
      position: p.position,
      title: p.title,
      content: el,
    });
  }

  /** Рендерит ng-template в HTMLElement и подключает View к Angular CD */
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

  private defaultMarkerTpl(): TemplateRef<any> {
    // простой дефолтный pin (если #marker не задан)
    const tpl = document.createElement('template');
    tpl.innerHTML = `<div class="pin"><span class="dot"></span></div>`;
    // упакуем в Angular TemplateRef через хак: создадим временный контейнер
    // но в standalone проще вернуть заранее скомпилированный шаблон.
    // Поэтому оставляем как минимальный DOM без биндингов:
    return {
      createEmbeddedView: () => {
        const view = {
          rootNodes: [tpl.content.firstElementChild!.cloneNode(true)],
          destroy: () => {},
          detach: () => {},
        } as any as EmbeddedViewRef<any>;
        return view;
      },
    } as any as TemplateRef<any>;
  }

  private defaultClusterTpl(): TemplateRef<any> {
    const tpl = document.createElement('template');
    tpl.innerHTML = `<div class="cluster-badge"></div>`;
    return {
      createEmbeddedView: (ctx: any) => {
        const el = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement;
        el.textContent = String(ctx?.$implicit ?? ctx?.count ?? '');
        const view = {
          rootNodes: [el],
          destroy: () => {},
          detach: () => {},
        } as any as EmbeddedViewRef<any>;
        return view;
      },
    } as any as TemplateRef<any>;
  }

  private destroyClusterer() {
    if (this.clusterer) {
      this.clusterer.clearMarkers();
      this.clusterer.setMap(null);
      this.clusterer = undefined;
    }
    // AdvancedMarkerElement: снимаем с карты через свойство map
    for (const m of this.markerInstances) (m as any).map = null;
    this.markerInstances = [];

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