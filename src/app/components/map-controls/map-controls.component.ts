// src/app/shared/map-controls.component.ts
import {
    AfterViewInit,
    Component,
    ElementRef,
    HostBinding,
    Inject,
    Input,
    OnChanges,
    OnDestroy,
    SimpleChanges,
} from '@angular/core';

@Component({
    selector: 'app-map-controls',
    standalone: true,
    templateUrl: `./map-controls.component.html`,
    styleUrl: './map-controls.component.scss'
})
export class MapControlsComponent implements AfterViewInit, OnChanges, OnDestroy {
  
    @Input() map!: google.maps.Map;
    @Input() position: keyof typeof google.maps.ControlPosition | google.maps.ControlPosition = 'TOP_RIGHT';
    @Input() orientation: 'horizontal' | 'vertical' = 'horizontal';

    @HostBinding('class.horizontal') get isH() { return this.orientation === 'horizontal'; }
    @HostBinding('class.vertical') get isV() { return this.orientation === 'vertical'; }

    private container!: any;
    private currentPos?: google.maps.ControlPosition;

    constructor(@Inject(ElementRef) private hostRef: ElementRef<HTMLElement>) { }

    ngAfterViewInit(): void {
        this.container = this.hostRef.nativeElement; 
        this.attachToMap();
    }

    ngOnChanges(ch: SimpleChanges): void {
        if (this.container && (ch['map'] || ch['position'])) {
            this.attachToMap();
        }
    }

    ngOnDestroy(): void {
        if (this.map && this.currentPos !== undefined) {
            this.removeFromPosition(this.currentPos);
        }
    }

    private attachToMap() {
        if (!this.map) return;
        const pos = this.toCtrlPos(this.position);
        if (pos === undefined) return;

        if (this.currentPos !== undefined) {
            this.removeFromPosition(this.currentPos);
        }

        this.map.controls[pos].push(this.container as any);
        this.currentPos = pos;
    }

    private removeFromPosition(pos: google.maps.ControlPosition) {
        const arr = this.map.controls[pos];
        const list = arr.getArray();
        const idx = list.indexOf(this.container as any);
        if (idx > -1) arr.removeAt(idx);
    }

    private toCtrlPos(
        p: keyof typeof google.maps.ControlPosition | google.maps.ControlPosition
    ) {
        if (typeof p === 'number') return p;
        return (google.maps.ControlPosition as any)[p] as google.maps.ControlPosition;
    }
}