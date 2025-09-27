import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { FeatureCollection } from 'geojson';

export type TravelMode = google.maps.TravelMode | 'driving-traffic';

export interface IsochronePersistState {
    timeValue: number;
    modeValue: TravelMode;
    autocompleteValue: { description: string; place_id: string } | null;
    selectedMarker?: { lat: number; lng: number; title?: string };
    geoJson?: FeatureCollection | null;
}

const DEFAULT_STATE: IsochronePersistState = {
    timeValue: 5,
    modeValue: google.maps.TravelMode.DRIVING,
    autocompleteValue: null,
    selectedMarker: undefined,
    geoJson: null
};

@Injectable({ providedIn: 'root' })
export class IsochroneStore {
    private readonly _state$ = new BehaviorSubject<IsochronePersistState>(DEFAULT_STATE);
    readonly state$ = this._state$.asObservable();

    get value(): IsochronePersistState { return this._state$.value; }
    patch(p: Partial<IsochronePersistState>) { this._state$.next({ ...this._state$.value, ...p }); }

    reset(keys?: (keyof IsochronePersistState)[]) {
        if (!keys || keys.length === 0) {
            this._state$.next({ ...DEFAULT_STATE });
            return;
        }
        const curr = { ...this._state$.value };
        for (const k of keys) (curr as any)[k] = (DEFAULT_STATE as any)[k];
        this._state$.next(curr);
    }
}
