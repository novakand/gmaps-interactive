import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, map } from 'rxjs';
import { FilterService as PFilterService } from 'primeng/api';

// === Типы ваших данных ===
export type FeatureLike = {
    properties?: {
        type?: string;
        employment?: string;
        salaryEUR?: number;
        id?: any;
        // ...другие поля не мешают
    };
};

// === Состояние фильтров ===
export interface FilterState {
    type: string[];                 // multiple autocomplete
    employment: string[];           // multiple autocomplete
    salaryRange: [number, number];  // [min, max]
    id?: any
}

// значения по умолчанию
const DEFAULT_STATE: FilterState = {
    type: [],
    employment: [],
    salaryRange: [0, Number.MAX_SAFE_INTEGER],
    id: 0

};

@Injectable({ providedIn: 'root' })
export class MapFilterStateService {
    // исходный набор записей
    private readonly _items$ = new BehaviorSubject<FeatureLike[]>([]);

    // состояние фильтров
    private readonly _state$ = new BehaviorSubject<FilterState>(DEFAULT_STATE);

    // публичные observable
    readonly items$ = this._items$.asObservable();
    readonly state$ = this._state$.asObservable();

    // отфильтрованный список (реактивно)
    readonly filtered$ = combineLatest([this.items$, this.state$]).pipe(
        map(([items, state]) => this._applyFilters(items, state))
    );

    // удобный геттер
    get value(): FilterState { return this._state$.value; }

    constructor(private readonly pfs: PFilterService) {
        // Регистрируем кастомный предикат для диапазона
        // Используем имя 'inRange' (как у p-table matchModes, но тут — наша логика)
        if (!this.pfs.filters['inRange']) {
            this.pfs.register('inRange', (value: number | null | undefined, range?: [number, number]) => {
                if (value == null || !range) return false;
                const [min, max] = range;
                return value >= min && value <= max;
            });
        }
        // На всякий случай регистрируем 'in' (вдруг не зарегистрирован)
        if (!this.pfs.filters['in']) {
            this.pfs.register('in', (value: string | number | null | undefined, list?: any[]) => {
                if (list == null || list.length === 0) return true; // пустой фильтр — пропускаем всё
                if (value == null) return false;
                return list.includes(value);
            });
        }
    }

    /** Задать исходные элементы для фильтрации */
    setItems(items: FeatureLike[]) {
        this._items$.next(items ?? []);
    }

    /** Полное обновление фильтр-стейта */
    setState(next: FilterState) {
        this._state$.next({ ...DEFAULT_STATE, ...next });
    }

    /** Частичное обновление фильтр-стейта */
    patch(p: Partial<FilterState>) {
        this._state$.next({ ...this._state$.value, ...p });
    }

    /** Сброс к дефолту */
    reset() {
        this._state$.next({ ...DEFAULT_STATE });
    }

    /** Применить фильтр «вручную» и получить массив (если нужно императивно) */
    applyOnce(items?: FeatureLike[], state?: FilterState): FeatureLike[] {
        return this._applyFilters(items ?? this._items$.value, state ?? this._state$.value);
    }

    // === Реальная фильтрация с помощью PrimeNG FilterService ===
    private _applyFilters(items: FeatureLike[], state: FilterState): FeatureLike[] {
        const { type, employment, salaryRange } = state;
        const inFn = this.pfs.filters['in'];
        const inRangeFn = this.pfs.filters['inRange'];

        return items.filter((it) => {
            const p = it?.properties ?? {};

            // type: multiple IN (пустой фильтр = пропускаем)
            const okType =
                (type?.length ?? 0) === 0
                    ? true
                    : inFn?.(p.type, type);

            // employment: multiple IN
            const okEmployment =
                (employment?.length ?? 0) === 0
                    ? true
                    : inFn?.(p.employment, employment);

            // salary: диапазон
            const okSalary =
                salaryRange && salaryRange.length === 2
                    ? inRangeFn?.(p.salaryEUR, salaryRange)
                    : true;

            return !!okType && !!okEmployment && !!okSalary;
        });
    }
}
