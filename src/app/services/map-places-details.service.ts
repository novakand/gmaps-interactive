// gmaps-places-details.service.ts
import { Injectable, inject, NgZone } from '@angular/core';
import { Observable, of } from 'rxjs';
import { MapSessionService } from './map-session.service';

@Injectable({ providedIn: 'root' })
export class GmapsPlacesDetailsService {
  private readonly zone = inject(NgZone);
  private readonly session = inject(MapSessionService);

  private places?: google.maps.places.PlacesService;

  public init(map: google.maps.Map | HTMLElement) {
    if (this.places) return;
    this.zone.runOutsideAngular(() => {
      this.places = new google.maps.places.PlacesService(map as any);
    });
  }

  public details$(placeId: string, fields: (keyof google.maps.places.PlaceResult)[] = [
    'place_id','name','formatted_address','geometry'
  ] as any): Observable<google.maps.places.PlaceResult | null> {
    if (!placeId) return of(null);
    if (!this.places) return of(null);

    const req: google.maps.places.PlaceDetailsRequest = {
      placeId,
      sessionToken: this.session.token,
      language: 'ru',
      fields: fields as any,
    };

    return new Observable(sub => {
      this.places!.getDetails(req, (res, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && res) {
          sub.next(res);
          sub.complete();
          this.session.reset();
        } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
          sub.next(null);
          sub.complete();
        } else {
          sub.error(status);
        }
      });
    });
  }
}
