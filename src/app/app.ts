import { CommonModule } from '@angular/common';
import { Component, signal, ViewChild } from '@angular/core';
import { GoogleMap, GoogleMapsModule } from '@angular/google-maps';
import { MarkerClustererComponent } from './components/marker-clusterer/marker-clusterer.component';
import { MapControlsComponent } from './components/map-controls/map-controls.component';
import { MapControlComponent } from './components/map-control/map-control.component';

@Component({
  selector: 'app-root',
  imports: [CommonModule, GoogleMapsModule, MarkerClustererComponent,MapControlsComponent,MapControlComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('gmaps-ui');
  @ViewChild(GoogleMap) mapCmp!: GoogleMap;
  map: google.maps.Map | null = null;
  points: { position: google.maps.LatLngLiteral }[] = [];

  options: google.maps.MapOptions = {
    center: { lat: 59.3293, lng: 18.0686 },
    zoom: 10,
    disableDefaultUI: true,
    minZoom: 3,
    restriction: { strictBounds: false, latLngBounds: { north: 83.8, south: -83.8, west: -180, east: 180 } },
    mapId: 'a870aaade7ac6f22',
    gestureHandling: 'greedy',
  };

  markers = [
    { position: { lat: 59.334591, lng: 18.06324 }, title: 'Center' },
  ];

  private toLiteral(
    c: google.maps.MapOptions['center']
  ): google.maps.LatLngLiteral {
    if (!c) throw new Error('Center is not set');
    return c instanceof google.maps.LatLng ? { lat: c.lat(), lng: c.lng() } : c;
  }

  onMapInit(map: google.maps.Map) { this.map = map; }

  ngAfterViewInit() {
    const gmap = this.mapCmp.googleMap!;
    // пример нативного доступа:
    // new google.maps.Marker({ map: gmap, position: { lat: 59.338, lng: 18.08 } });
  }

  ngOnInit() {
    const c = this.toLiteral(this.options.center);
    this.points = Array.from({ length: 400 }, () => ({
      position: {
        lat: c.lat + (Math.random() - 0.5) * 0.6,
        lng: c.lng + (Math.random() - 0.5) * 0.9,
      },
    }));
  }
}
