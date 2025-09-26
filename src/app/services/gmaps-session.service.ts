import { Injectable, inject, NgZone } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class GmapsSessionService {
  private readonly zone = inject(NgZone);
  private _token: google.maps.places.AutocompleteSessionToken | null = null;

  get token(): google.maps.places.AutocompleteSessionToken {
    if (!this._token) this.reset();
    return this._token!;
  }

  /** Пересоздать токен (рекомендуется после getDetails) */
  reset() {
    // вне Angular — чисто для симметрии, но не критично
    this.zone.runOutsideAngular(() => {
      this._token = new google.maps.places.AutocompleteSessionToken();
    });
  }
}