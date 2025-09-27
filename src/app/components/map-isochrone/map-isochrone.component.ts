import {
    Component,
    OnInit,
    OnDestroy,
    ChangeDetectionStrategy,
    NgZone,
    inject,
    ChangeDetectorRef,
    Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, FormsModule, Validators } from '@angular/forms';
import { BehaviorSubject, forkJoin, from, Observable, of, Subject } from 'rxjs';
import { catchError, filter, map, take, takeUntil, tap } from 'rxjs/operators';
import { GoogleMap, GoogleMapsModule, MapEventManager } from '@angular/google-maps';
import { MapControlComponent } from '../map-control/map-control.component';
import { MapControlsComponent } from '../map-controls/map-controls.component';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { ButtonModule } from 'primeng/button';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { SelectButton } from 'primeng/selectbutton';
import { Slider } from 'primeng/slider';
import { MapboxIsochroneService } from './services/isochrone.service';
import { Feature, FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import { MapAutocompleteService } from '../../services/map-autocomplete.service';
import { GmapsPlacesDetailsService } from '../../services/map-places-details.service';
import { MapSessionService } from '../../services/map-session.service';
import { MapGeocodeService } from '../../services/map-geocode.service';
import { FormBuilder, FormControl, ReactiveFormsModule } from '@angular/forms';
import { IsochroneStore } from './services/isochrone-store.service';
@Component({
    selector: 'map-isochrone',
    templateUrl: './map-isochrone.component.html',
    styleUrls: ['./map-isochrone.component.scss'],
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        SelectButton,
        Slider,
        ReactiveFormsModule,
        GoogleMapsModule,
        AutoCompleteModule,
        ToggleButtonModule,
        MapControlComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})

export class MapIsochroneComponent implements OnInit, OnDestroy {

    public readonly _map = inject(GoogleMap);
    private readonly _ngZone = inject(NgZone);
    private readonly _cdr = inject(ChangeDetectorRef);
    private readonly mapbox = inject(MapboxIsochroneService);
    private _fb = inject(FormBuilder);
    private readonly store = inject(IsochroneStore);

    private readonly autocompleteSvc = inject(MapAutocompleteService);
    private readonly detailsSvc = inject(GmapsPlacesDetailsService);
    private readonly geocodeSvc = inject(MapGeocodeService);
    private readonly session = inject(MapSessionService);

    public map!: google.maps.Map;
    public dataLayer?: google.maps.Data;
    public form: FormGroup;

    private _eventManagerDataLayer = new MapEventManager(this._ngZone);


    private _destroy$ = new Subject<void>();

    private readonly _geoJson = new BehaviorSubject<Feature | FeatureCollection | null>(null);
    private readonly _style = new BehaviorSubject<google.maps.Data.StyleOptions>({});


    @Output() readonly setGeometry: Observable<google.maps.Data.SetGeometryEvent> =
        this._eventManagerDataLayer.getLazyEmitter<google.maps.Data.SetGeometryEvent>('setgeometry');

    @Output() readonly addFeature: Observable<google.maps.Data.AddFeatureEvent> =
        this._eventManagerDataLayer.getLazyEmitter<google.maps.Data.AddFeatureEvent>('addfeature');

    @Output() readonly removeFeature: Observable<google.maps.Data.RemoveFeatureEvent> =
        this._eventManagerDataLayer.getLazyEmitter<google.maps.Data.RemoveFeatureEvent>('removefeature');

    public selectedMarker?: { position: google.maps.LatLng | google.maps.LatLngLiteral; title?: string };
    public autocompleteData: Array<{ description: string; place_id: string }> = [];

    public drivingOptions: any[] = [
        { label: 'By car', value: google.maps.TravelMode.DRIVING },
        { label: 'By bike', value: google.maps.TravelMode.BICYCLING },
        { label: 'Walking', value: google.maps.TravelMode.WALKING },
    ];

    get timeValue(): number { return this.form?.get('timeValue')?.value ?? 5; }
    get modeValue(): any { return this.form?.get('modeValue')?.value ?? 'driving-traffic'; }
    get autocompleteValue(): { description: string; place_id: string } | null {
        return this.form?.get('autocompleteValue')?.value ?? null;
    }

    set geoJson(geometry: Feature | FeatureCollection | null) { this._geoJson.next(geometry); }
    set style(style: google.maps.Data.StyleOptions) { this._style.next(style || {}); }

    ngOnInit(): void {
        this._buildForm();

        if (this._map._isBrowser) {
            this._ngZone.runOutsideAngular(() => {
                from(this._map._resolveMap())
                    .pipe(take(1), takeUntil(this._destroy$))
                    .subscribe((map) => this._initialize(map));
            });
        }
    }

    public ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
        this._eventManagerDataLayer.destroy();
        this.clearIsochroneLayer();
    }

    private _initialize(map: google.maps.Map): void {
        this.map = map;
        this._ngZone.runOutsideAngular(() => {
            this.detailsSvc.init(this.map);
            this.geocodeSvc.init();
            this.autocompleteSvc.init();

            this.dataLayer = new google.maps.Data({ map });
            this._eventManagerDataLayer.setTarget(this.dataLayer);
            this._applyDataStyle();
            this._watchForStyleChanges();
            this._watchForGeoJsonChanges();
            this._restoreFromStore();
        });
    }

    private _buildForm(): void {
        const s = this.store.value;
        this.form = this._fb.group({
            timeValue: new FormControl(s.timeValue ?? 5, [Validators.required]),
            modeValue: new FormControl(s.modeValue ?? 'driving-traffic', [Validators.required]),
            autocompleteValue: new FormControl(s.autocompleteValue ?? null, [Validators.required, Validators.minLength(3)]),
        });

        this.form.valueChanges
            .pipe(takeUntil(this._destroy$))
            .subscribe(v => {
                this.store.patch({
                    timeValue: v.timeValue ?? 5,
                    modeValue: (v.modeValue ?? 'driving-traffic') as any,
                    autocompleteValue: v.autocompleteValue ?? null
                });
            });
    }

    private _restoreFromStore(): void {
        const s = this.store.value;

        if (s.selectedMarker) {
            const pos = new google.maps.LatLng(s.selectedMarker.lat, s.selectedMarker.lng);
            this.selectedMarker = { position: pos, title: s.selectedMarker.title ?? '' };
            this.map.setCenter(pos);
        }

        if (s.geoJson && this.dataLayer) {
            this.clearIsochroneLayer();
            this.dataLayer.addGeoJson(s.geoJson as any);

            const bounds = new google.maps.LatLngBounds();
            this.dataLayer.forEach(f => this.extendBoundsFromFeature(f, bounds));
            if (!bounds.isEmpty()) this.map.fitBounds(bounds);
            this._geoJson.next(s.geoJson);
        }

        if (s.autocompleteValue) {
            this.form.get('autocompleteValue')!.setValue(s.autocompleteValue, { emitEvent: false });
        }

        this._cdr.detectChanges();
    }

    private _watchForStyleChanges(): void {
        this._style.pipe(takeUntil(this._destroy$)).subscribe(() => this._applyDataStyle());
    }

    private _watchForGeoJsonChanges(): void {
        this._geoJson
            .pipe(takeUntil(this._destroy$), filter((g): g is Feature | FeatureCollection => !!g))
            .subscribe((geoJson) => {
                if (!this.dataLayer) return;
                this.clearIsochroneLayer();
                this.dataLayer.addGeoJson(geoJson as any);

                const bounds = new google.maps.LatLngBounds();
                this.dataLayer.forEach(f => this.extendBoundsFromFeature(f, bounds));
                if (!bounds.isEmpty()) this.map.fitBounds(bounds);

                if ((geoJson as any).type === 'FeatureCollection') {
                    this.store.patch({ geoJson: geoJson as any });
                }
            });
    }

    private _applyDataStyle(extra?: Partial<google.maps.Data.StyleOptions>): void {
        if (!this.dataLayer) return;
        const merged: google.maps.Data.StyleOptions = {
            strokeColor: '#1a73e8',
            strokeOpacity: 1,
            strokeWeight: 2,
            fillColor: '#1a73e8',
            fillOpacity: 0.2,
            editable: false,
            visible: true,
            ...this._style.getValue(),
            ...(extra || {}),
        };
        this.dataLayer.setStyle(merged);
    }

    public onRemove(): void {
        this._removeAllFeaturesSafe();
    }

    private _removeAllFeaturesSafe(): void {
        if (!this.dataLayer) return;
        const toRemove: google.maps.Data.Feature[] = [];
        this.dataLayer?.forEach(f => toRemove?.push(f));
        toRemove?.forEach(f => this.dataLayer?.remove(f));
    }

    public calculateIsochrone(): void {

        if (!this.form.valid) return;

        const center = this.map?.getCenter();
        const origin = this.selectedMarker?.position ?? center;
        if (!origin || !this.map) return;

        this.clearIsochroneLayer();

        const originLL =
            origin instanceof google.maps.LatLng
                ? origin
                : new google.maps.LatLng(origin.lat, origin.lng);

        const mode = this.modeValue;
        const profile =
            mode === 'driving-traffic' || mode === google.maps.TravelMode.DRIVING
                ? 'driving-traffic'
                : mode === google.maps.TravelMode.BICYCLING
                    ? 'cycling'
                    : 'walking';

        const minutes = Math.max(1, Math.round(this.timeValue));

        this.mapbox.getIsochrone({
            lng: originLL.lng(),
            lat: originLL.lat(),
            minutes,
            profile,
            denoise: 1,
            polygons: true,
        })
            .pipe(
                take(1),
                catchError((err) => { console.error('Mapbox isochrone error:', err); return of(null); })
            )
            .subscribe((fc) => {
                if (!fc) return;
                this.drawIsochroneFromFC(fc);
                this.store.patch({ geoJson: fc });
            });
    }

    private clearIsochroneLayer(): void {
        if (!this.dataLayer) return;
        const toRemove: google.maps.Data.Feature[] = [];
        this.dataLayer.forEach((f) => toRemove.push(f));
        toRemove.forEach((f) => this.dataLayer!.remove(f));
    }

    private drawIsochroneFromFC(fc: FeatureCollection<Geometry, GeoJsonProperties>): void {
        if (!this.map || !this.dataLayer || !fc?.features?.length) return;
        this.dataLayer.addGeoJson(fc as any);
        const bounds = new google.maps.LatLngBounds();
        this.dataLayer.forEach((f) => this.extendBoundsFromFeature(f, bounds));
        if (!bounds.isEmpty()) this.map.fitBounds(bounds);
        this._geoJson.next(fc);
    }

    private extendBoundsFromFeature(feature: google.maps.Data.Feature, bounds: google.maps.LatLngBounds): void {
        const geometry = feature.getGeometry();
        if (geometry?.getType() === 'Polygon') {
            const polygon = geometry as google.maps.Data.Polygon;
            polygon.getArray().forEach((ring: google.maps.Data.LinearRing) =>
                ring.getArray().forEach((latlng: google.maps.LatLng) => bounds.extend(latlng))
            );
        } else if (geometry?.getType() === 'MultiPolygon') {
            const multiPolygon = geometry as google.maps.Data.MultiPolygon;
            multiPolygon.getArray().forEach((polygon: google.maps.Data.Polygon) => {
                polygon.getArray().forEach((ring: google.maps.Data.LinearRing) =>
                    ring.getArray().forEach((latlng: google.maps.LatLng) => bounds.extend(latlng))
                );
            });
        }
    }

    public search(event: any) {
        const q = (event.query || '').trim();
        if (!q) { this.autocompleteData = []; return; }
        this._cdr.detectChanges();

        this.autocompleteSvc.predictions$(q)
            .pipe(
                take(1),
                map(preds => preds.map(p => ({ description: p.description!, place_id: p.place_id! }))),
                catchError(() => of([]))
            )
            .subscribe(list => {
                this.autocompleteData = list;
                this._cdr.detectChanges();
            });
    }

    public onSelectCenter() {
        const center = this.map.getCenter();
        if (!center) return;

        const pos = new google.maps.LatLng(center.lat(), center.lng());
        this.selectedMarker = { position: pos, title: '' };
        this.map.setCenter(center);

        this.geocodeSvc.reverse$(pos)
            .pipe(
                take(1),
                map(results => {
                    const r = results?.[0];
                    return r ? { description: r.formatted_address ?? '', place_id: r.place_id ?? '' } : null;
                }),
                catchError(() => of(null))
            )
            .subscribe(res => {
                if (res) {
                    this.form.get('autocompleteValue')!.setValue(res);
                    this.store.patch({ autocompleteValue: res, selectedMarker: { lat: pos.lat(), lng: pos.lng(), title: '' } });
                    this._cdr.detectChanges();
                }
            });
    }

    public onMarkerDragEnd(event: google.maps.MapMouseEvent) {
        const latLng = event?.latLng;
        if (!latLng) return;

        this.selectedMarker = { position: latLng, title: this.selectedMarker?.title ?? '' };

        this.geocodeSvc.reverse$(latLng)
            .pipe(
                take(1),
                map(results => {
                    const r = results?.[0];
                    return r ? { description: r.formatted_address ?? '', place_id: r.place_id ?? '' } : null;
                }),
                catchError(() => of(null))
            )
            .subscribe(res => {
                if (res) this.form.get('autocompleteValue')!.setValue(res);
                this.store.patch({ selectedMarker: { lat: latLng.lat(), lng: latLng.lng(), title: this.selectedMarker?.title } });
                this._cdr.detectChanges();
            });
    }

    public onSelectPlace = (e: any) => {
        const sel = e?.value;
        if (!sel?.place_id) return;

        this.detailsSvc.details$(sel.place_id, [
            'place_id', 'name', 'formatted_address', 'geometry', 'address_components'
        ] as any)
            .pipe(take(1), tap(() => this.session.reset()), catchError(() => of(null)))
            .subscribe(res => {
                if (!res || !this.map) return;
                const loc = res.geometry?.location;
                if (!loc) return;

                const pos = new google.maps.LatLng(loc.lat(), loc.lng());
                this.selectedMarker = { position: pos, title: res.name || sel.description };
                this.form.get('autocompleteValue')!.setValue(sel, { emitEvent: false });

                this.store.patch({
                    autocompleteValue: sel,
                    selectedMarker: { lat: pos.lat(), lng: pos.lng(), title: res.name || sel.description }
                });

                this._cdr.detectChanges();
                const viewport = res.geometry?.viewport;
                if (viewport) this.map.fitBounds(viewport);
            });
    };

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

    public onClear() {
        this.onRemove();
        this.store.reset();
        this.selectedMarker = null;
        this._cdr.detectChanges();
    }

    public getGeoJson$(): Observable<FeatureCollection | null> {
        return from(this.getGeoJson());
    }
}