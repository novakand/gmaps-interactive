export const DEFAULT_DRAWING_OPTIONS: google.maps.drawing.DrawingManagerOptions = {
    drawingControl: false,
    drawingControlOptions: {
      position: null,
      drawingModes: []
    },
    markerOptions: {},
    polygonOptions: {
      fillColor: "#424F7D",
      fillOpacity: 0.6,
      strokeColor: "#424F7D",
      strokeWeight: 3,
      strokeOpacity:1,
      clickable: true,
      draggable: false,
      editable: true,
      paths: [],
      zIndex: 1,
    }
  };