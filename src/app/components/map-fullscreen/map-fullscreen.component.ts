import { ChangeDetectionStrategy, Component, Inject, Input, OnDestroy, OnInit, PLATFORM_ID, } from '@angular/core';
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Subject } from 'rxjs';
import { FullscreenService } from '../../services/map-fullscreen.service';
import { FormsModule } from '@angular/forms';
import { TooltipModule } from 'primeng/tooltip';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { ButtonModule } from 'primeng/button';
@Component({
    selector: 'map-fullscreen-control',
    templateUrl: './map-fullscreen.component.html',
    styleUrls: ['./map-fullscreen.component.scss'],
    standalone:true,
    imports: [CommonModule, ButtonModule, ToggleButtonModule, FormsModule, TooltipModule],
    providers: [FullscreenService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MapFullscreenComponent implements OnDestroy, OnInit {

    public isFullscreen: boolean;
    private _isBrowser: boolean;
    private _container: any;
    private _destroy$ = new Subject<boolean>();

    @Input() public fullscreenClass: string | null = 'layout-map-container';

    public isFullscreen$;


    constructor(
        private fullscreenService: FullscreenService,
        @Inject(PLATFORM_ID) platformId: Object,
        @Inject(DOCUMENT) private document: Document
    ) {
        this._isBrowser = isPlatformBrowser(platformId);
        this.isFullscreen$ = this.fullscreenService.isFullscreen$;
    }

    public ngOnInit(): void {
        if (this._isBrowser) {
            this._container = this.document.querySelector(`.${this.fullscreenClass}`);
        }
    }

    public onFullscreenToggle() {
        this._isBrowser && this.fullscreenService.toggleFullscreen(this._container);
    }

    public ngOnDestroy(): void {
        this._destroy$.next(true);
        this._destroy$.complete();
    }
}