import { Component } from '@angular/core';

@Component({
  selector: 'app-map-control',
  standalone: true,
  template: `<div class="gm-control"><ng-content></ng-content></div>`,
})
export class MapControlComponent {}