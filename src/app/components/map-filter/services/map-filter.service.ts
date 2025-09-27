import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, map } from 'rxjs';
import { FilterService as PFilterService } from 'primeng/api';

export type FeatureLike = {
    properties?: {
        type?: string;
        employment?: string;
        salaryEUR?: number;
        id?: any;
    };
};

export interface FilterState {
    type: string[];                
    employment: string[];         
    salaryRange: [number, number]; 
    id?: any
}

const DEFAULT_STATE: FilterState = {
    type: [],
    employment: [],
    salaryRange: [0, Number.MAX_SAFE_INTEGER],
    id: 0

};

@Injectable({ providedIn: 'root' })
export class MapFilterStateService {
   
    private readonly _items$ = new BehaviorSubject<FeatureLike[]>([]);
    private readonly _state$ = new BehaviorSubject<FilterState>(DEFAULT_STATE);

    readonly items$ = this._items$.asObservable();
    readonly state$ = this._state$.asObservable();

    readonly filtered$ = combineLatest([this.items$, this.state$]).pipe(
        map(([items, state]) => this._applyFilters(items, state))
    );

    get value(): FilterState { return this._state$.value; }

    constructor(private readonly pfs: PFilterService) {
        if (!this.pfs.filters['inRange']) {
            this.pfs.register('inRange', (value: number | null | undefined, range?: [number, number]) => {
                if (value == null || !range) return false;
                const [min, max] = range;
                return value >= min && value <= max;
            });
        }
        if (!this.pfs.filters['in']) {
            this.pfs.register('in', (value: string | number | null | undefined, list?: any[]) => {
                if (list == null || list.length === 0) return true; // пустой фильтр — пропускаем всё
                if (value == null) return false;
                return list.includes(value);
            });
        }
    }

    setItems(items: FeatureLike[]) {
        this._items$.next(items ?? []);
    }

    setState(next: FilterState) {
        this._state$.next({ ...DEFAULT_STATE, ...next });
    }

    patch(p: Partial<FilterState>) {
        this._state$.next({ ...this._state$.value, ...p });
    }

    reset() {
        this._state$.next({ ...DEFAULT_STATE });
    }

    applyOnce(items?: FeatureLike[], state?: FilterState): FeatureLike[] {
        return this._applyFilters(items ?? this._items$.value, state ?? this._state$.value);
    }

    private _applyFilters(items: FeatureLike[], state: FilterState): FeatureLike[] {
        const { type, employment, salaryRange } = state;
        const inFn = this.pfs.filters['in'];
        const inRangeFn = this.pfs.filters['inRange'];

        return items.filter((it) => {
            const p = it?.properties ?? {};

            const okType =
                (type?.length ?? 0) === 0
                    ? true
                    : inFn?.(p.type, type);

            const okEmployment =
                (employment?.length ?? 0) === 0
                    ? true
                    : inFn?.(p.employment, employment);

            const okSalary =
                salaryRange && salaryRange.length === 2
                    ? inRangeFn?.(p.salaryEUR, salaryRange)
                    : true;

            return !!okType && !!okEmployment && !!okSalary;
        });
    }
}
