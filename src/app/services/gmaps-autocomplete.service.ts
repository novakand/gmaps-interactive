// gmaps-autocomplete.service.ts
import { Injectable, inject, NgZone } from '@angular/core';
import { Observable, of } from 'rxjs';
import { GmapsSessionService } from './gmaps-session.service';

@Injectable({ providedIn: 'root' })
export class GmapsAutocompleteService {
  private readonly zone = inject(NgZone);
  private readonly session = inject(GmapsSessionService);

  private svc?: google.maps.places.AutocompleteService;

  init() {
    if (this.svc) return;
    this.zone.runOutsideAngular(() => {
      this.svc = new google.maps.places.AutocompleteService();
    });
  }

  predictions$(input: string, opts?: Partial<google.maps.places.AutocompleteRequest>): Observable<google.maps.places.AutocompletePrediction[]> {
    if (!input?.trim()) return of([]);
    this.init();
    if (!this.svc) return of([]);

    const req: google.maps.places.AutocompleteRequest = {
      input,
      sessionToken: this.session.token,
      language: 'ru',
      ...opts,
    };

    return new Observable(sub => {
      this.svc!.getPlacePredictions(req, (preds, status) => {
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
