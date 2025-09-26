import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, Input, NgZone, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { filter, Subject, takeUntil } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { GoogleMap, MapEventManager } from '@angular/google-maps';

@Component({
    selector: 'map-zoom-control',
    templateUrl: './map-zoom-control.component.html',
    styleUrls: ['./map-zoom-control.component.scss'],
    imports: [CommonModule, ButtonModule, TooltipModule, FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MapZoomControlComponent implements OnDestroy, OnInit, AfterViewInit {

    public map: google.maps.Map;
    public isDisabled = false;
    private readonly _map = inject(GoogleMap);
    private readonly _ngZone = inject(NgZone);
    private _eventManager = new MapEventManager(inject(NgZone));

    private _destroy$ = new Subject<boolean>();

    @Input() public isShowZoomControl = true;
    @Input() public isDisableZoomControl = false;
    @Input() public isResetZoomControl = true;
    @Input() public isDisabledZoomOut = false;
    @Input() public isDisabledZoomIn = false;
    @Input() public tooltipZoomIn = 'Zoom in';
    @Input() public tooltipZoomOut = 'Zoom out';

    constructor(
        private _cdr: ChangeDetectorRef,
    ) {
        this._watchForLoadChanges();
    }

    public ngOnInit(): void {}

    public ngAfterViewInit() {}

    public ngOnDestroy(): void {
        this._destroy$.next(true);
        this._destroy$.complete();
        this._eventManager.destroy();
    }

    private _watchForLoadChanges() {
        this._map.mapInitialized
            .pipe(
                filter(Boolean),
                takeUntil(this._destroy$),
            )
            .subscribe((map: any) => {
                this.map = map;
                this._watchForZoomChanges();
            });
    }

    public onZoomOutChange(): void {
        this.map?.setZoom(this.map.getZoom()! - 1);
        this._onZoomChange();
    }

    public onZoomInChange(): void {
        this.map?.setZoom(this.map.getZoom()! + 1);
        this._onZoomChange();
    }

    private _watchForZoomChanges(): void {
        this._map.idle
            .pipe(
                takeUntil(this._destroy$),
            )
            .subscribe(() => this._onZoomChange());
    }

    private _onZoomChange(): void {
        const zoom = this.map.getZoom();
        this.isDisabledZoomIn = zoom === this.map?.get('maxZoom');
        this.isDisabledZoomOut = zoom === this.map?.get('minZoom');
        this._cdr.detectChanges();
    }

}