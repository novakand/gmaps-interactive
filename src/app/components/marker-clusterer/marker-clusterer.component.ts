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
  template: ''
})
export class MarkerClustererComponent implements OnChanges, OnDestroy, AfterContentInit {

  @Input() map: google.maps.Map | null | undefined;
  @Input() points: ClusterPoint[] = [];
  @Input() algorithm: 'grid' | 'super' = 'super';
  @Input() maxZoom?: number;
  @Input() gridSize = 60;
  @Input() radius = 200;
  @Input() minPoints = 2;

  @ContentChild('marker', { read: TemplateRef, static: true })
  markerTpl?: TemplateRef<any>;

  @ContentChild('cluster', { read: TemplateRef, static: true })
  clusterTpl?: TemplateRef<any>;

  private contentReady = false;
  private clusterer?: MarkerClusterer;
  private markerInstances: google.maps.marker.AdvancedMarkerElement[] = [];
  private markerViews: EmbeddedViewRef<any>[] = [];
  private clusterViews: EmbeddedViewRef<any>[] = [];
  private rebuildScheduled = false;

  constructor(private appRef: ApplicationRef, private ngZone: NgZone) { }

  ngAfterContentInit(): void {
    this.contentReady = true;
    this.scheduleRebuild();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.contentReady) return;

    if (changes['map'] && !this.map) return;

    if (changes['points'] && changes['points'].previousValue === changes['points'].currentValue) {
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
    this.ngZone.runOutsideAngular(() => {
      this.destroyClusterer();

      this.markerInstances = this.points.map((p) => this.createAdvancedMarker(p));
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

      const renderer = {
        render: (args: any) => {
          const { count, position, markers } = args;

          if (this.clusterTpl) {
            const { el } = this.renderTemplate(
              this.clusterTpl,
              { $implicit: count, count, position, markers },
              'cluster'
            );
            return new google.maps.marker.AdvancedMarkerElement({
              position,
              content: el,
              gmpClickable: true,
              zIndex: 100 + count,
              collisionBehavior: 'REQUIRED_AND_HIDES_OPTIONAL' as any
            });
          }
          const el = this.createDefaultClusterEl(count);
          return new google.maps.marker.AdvancedMarkerElement({
            position,
            content: el,
            zIndex: 100 + count,
            gmpClickable: true,
            collisionBehavior: 'REQUIRED_AND_HIDES_OPTIONAL' as any
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
    if (this.markerTpl) {
      const { el } = this.renderTemplate(this.markerTpl, { $implicit: p, point: p }, 'marker');
      return new google.maps.marker.AdvancedMarkerElement({
        position: p.position,
        title: p.title,
        content: el,
        gmpClickable: true,
      });
    }

    const el = this.createDefaultPinEl(p);
    return new google.maps.marker.AdvancedMarkerElement({
      position: p.position,
      title: p.title,
      content: el,
      gmpClickable: true,
    });
  }

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

  private createDefaultPinEl(p: ClusterPoint): HTMLElement {
    const root = document.createElement('div');
    root.className = 'pin';
    const dot = document.createElement('span');
    dot.className = 'dot';
    root.appendChild(dot);
    return root;
  }

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