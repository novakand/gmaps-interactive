
import { Inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class MapboxIsochroneService {
    private readonly base = 'https://api.mapbox.com/isochrone/v1/mapbox';
    private token: string = 'pk.eyJ1Ijoibm92YWthbmQiLCJhIjoiY2p3OXFlYnYwMDF3eTQxcW5qenZ2eGNoNCJ9.PTZDfrwxfMd-hAwzZjwPTg'
    constructor(
        private http: HttpClient,

    ) {
    }
    getIsochrone(params: any): Observable<any> {
        const {
            lng,
            lat,
            minutes,
            profile = 'driving-traffic',
            denoise = 1,
            polygons = true,
            generalize
        } = params;

        const coords = `${lng},${lat}`;
        const url = `${this.base}/${encodeURIComponent(profile)}/${encodeURIComponent(coords)}`;

        let httpParams = new HttpParams()
            .set('access_token', this.token)
            .set('contours_minutes', Array.isArray(minutes) ? minutes.join(',') : String(minutes))
            .set('polygons', String(polygons))
            .set('denoise', String(denoise));

        if (typeof generalize === 'number') {
            httpParams = httpParams.set('generalize', String(generalize));
        }

        return this.http.get<any>(url, { params: httpParams });
    }
}
