// gmaps-geocode.service.ts
import { Injectable, inject, NgZone } from '@angular/core';
import { Observable, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class GmapsGeocodeService {
  private readonly zone = inject(NgZone);
  private geocoder?: google.maps.Geocoder;

  init() {
    if (this.geocoder) return;
    this.zone.runOutsideAngular(() => {
      this.geocoder = new google.maps.Geocoder();
    });
  }

  reverse$(latLng: google.maps.LatLng | google.maps.LatLngLiteral): Observable<google.maps.GeocoderResult[] | null> {
    this.init();
    if (!this.geocoder) return of(null);

    const loc = latLng instanceof google.maps.LatLng ? latLng : new google.maps.LatLng(latLng.lat, latLng.lng);
    const req: google.maps.GeocoderRequest = { location: loc };

    return new Observable(sub => {
      this.geocoder!.geocode(req, (results, status) => {
        if (status === google.maps.GeocoderStatus.OK) {
          sub.next(results ?? []);
          sub.complete();
        } else if (status === google.maps.GeocoderStatus.ZERO_RESULTS) {
          sub.next([]);
          sub.complete();
        } else {
          sub.error(status);
        }
      });
    });
  }
}
