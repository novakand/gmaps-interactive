
import { Injectable, inject, NgZone } from '@angular/core';
import { Observable, of } from 'rxjs';
import { MapSessionService } from './map-session.service';

@Injectable({ providedIn: 'root' })
export class MapAutocompleteService {
  private readonly zone = inject(NgZone);
  private readonly session = inject(MapSessionService);

  private placeService?: google.maps.places.AutocompleteService;

  public init() {
    if (this.placeService) return;
    this.zone.runOutsideAngular(() => {
      this.placeService = new google.maps.places.AutocompleteService();
    });
  }

  public predictions$(input: string, opts?: Partial<google.maps.places.AutocompleteRequest>): Observable<google.maps.places.AutocompletePrediction[]> {
    if (!input?.trim()) return of([]);
    this.init();
    if (!this.placeService) return of([]);

    const req: google.maps.places.AutocompleteRequest = {
      input,
      sessionToken: this.session.token,
      language: 'en',
      ...opts,
    };

    return new Observable(sub => {
      this.placeService!.getPlacePredictions(req, (preds, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && preds) {
          sub.next(preds);
          sub.complete();
        } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
          sub.next([]);
          sub.complete();
        } else {
          sub.error(status);
        }
      });
    });
  }
}
