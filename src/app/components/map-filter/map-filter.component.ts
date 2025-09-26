import {
    Component,
    OnInit,
    OnDestroy,
    ChangeDetectionStrategy,
    inject,
    ChangeDetectorRef,
    Input,
    SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { GoogleMapsModule } from '@angular/google-maps';
import { MapControlComponent } from '../map-control/map-control.component';
import { MapControlsComponent } from '../map-controls/map-controls.component';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { ButtonModule } from 'primeng/button';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { SelectButton } from 'primeng/selectbutton';
import { Slider } from 'primeng/slider';
import { FeatureLike, MapFilterStateService } from './services/map-filter.service';
@Component({
    selector: 'app-map-filter',
    templateUrl: './map-filter.component.html',
    styleUrls: ['./map-filter.component.scss'],
    standalone: true,
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
        MapControlsComponent, MapControlComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})

export class MapFilterComponent implements OnInit, OnDestroy {
    @Input() items: FeatureLike[] = [];
    private readonly _cdr = inject(ChangeDetectorRef);
    private readonly _fb = inject(FormBuilder);
    private readonly fs = inject(MapFilterStateService);

    public form!: FormGroup;
    private _destroy$ = new Subject<void>();
    typeSuggestions: string[] = [];
    employmentSuggestions: string[] = [];

    private typeAll: string[] = [];
    private employmentAll: string[] = [];

    salaryMin = 0;
    salaryMax = 100000;
    salaryStep = 100;

    ngOnInit(): void {
        this._prepareLookups();
        this._buildForm();
    }

    ngOnChanges(ch: SimpleChanges): void {
        if ('items' in ch) {
            this._prepareLookups();
            this.fs.setItems(this.items as any);

            if (this.form) {
                const cur = this.form.get('salaryRange')?.value as [number, number];
                const isDefault = !cur || (cur[0] === 0 && cur[1] === Number.MAX_SAFE_INTEGER);
                if (isDefault) {
                    this.form.get('salaryRange')?.setValue([this.salaryMin, this.salaryMax], { emitEvent: true });
                }
            }
        }
    }

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
    }

    private _prepareLookups(): void {
        const types = new Set<string>();
        const emps = new Set<string>();
        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;

        for (const it of this.items || []) {
            const p = it?.properties || {};
            if (p.type) types.add(p.type);
            if (p.employment) emps.add(p.employment);
            if (typeof p.salaryEUR === 'number' && !Number.isNaN(p.salaryEUR)) {
                min = Math.min(min, p.salaryEUR);
                max = Math.max(max, p.salaryEUR);
            }
        }

        this.typeAll = Array.from(types).sort((a, b) => a.localeCompare(b));
        this.employmentAll = Array.from(emps).sort((a, b) => a.localeCompare(b));

        this.salaryMin = isFinite(min) ? Math.floor(min) : 0;
        this.salaryMax = isFinite(max) ? Math.ceil(max) : 100000;

        this.typeSuggestions = this.typeAll.slice(0, 10);
        this.employmentSuggestions = this.employmentAll.slice(0, 10);
    }

    private _buildForm(): void {
        const s = this.fs.value;

        this.form = this._fb.group({
            type: new FormControl<string[]>(s.type ?? [], { nonNullable: true }),
            employment: new FormControl<string[]>(s.employment ?? [], { nonNullable: true }),
            salaryRange: new FormControl<[number, number]>(
                (s.salaryRange as [number, number]) ?? [this.salaryMin, this.salaryMax],
                {
                    nonNullable: true,
                    validators: [
                        Validators.required,
                        (ctrl) => {
                            const v = ctrl.value as [number, number] | null;
                            if (!v) return null;
                            return v[0] <= v[1] ? null : { range: true };
                        }
                    ]
                }
            )
        });

        this.form.valueChanges
            .pipe(takeUntil(this._destroy$))
            .subscribe(v => {
                this.fs.patch({
                    type: v.type ?? [],
                    employment: v.employment ?? [],
                    salaryRange: v.salaryRange ?? [this.salaryMin, this.salaryMax],
                });
            });
    }

    searchType(ev: { query?: string }) {
        const q = (ev?.query || '').trim().toLowerCase();
        if (!q) {
            this.typeSuggestions = this.typeAll.slice(0, 20);
            return;
        }
        this.typeSuggestions = this.typeAll.filter(s => s.toLowerCase().includes(q)).slice(0, 20);
        this._cdr.markForCheck();
    }

    searchEmployment(ev: { query?: string }) {
        const q = (ev?.query || '').trim().toLowerCase();
        if (!q) {
            this.employmentSuggestions = this.employmentAll.slice(0, 20);
            return;
        }
        this.employmentSuggestions = this.employmentAll.filter(s => s.toLowerCase().includes(q)).slice(0, 20);
        this._cdr.markForCheck();
    }

    onApplyClick() {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }
    }


    get f() { return this.form.controls as any; }
}