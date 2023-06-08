export const displayMap = (locations) => {
  mapboxgl.accessToken =
    'pk.eyJ1IjoiZHViYmVyZGluayIsImEiOiJjbGhqYzVyZWIwZ2lwM25vZTdjMHdiZGJqIn0.UKebEksLhe1ZrU6lkgS5Ug';

  var map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/dubberdink/clhjch60k01ij01quey6rdf7o',
    scrollZoom: false,
  });

  const bounds = new mapboxgl.LngLatBounds();

  locations.forEach((loc) => {
    // Create marker
    const el = document.createElement('div');
    el.className = 'marker';

    // Add marker
    new mapboxgl.Marker({
      element: el,
      anchor: 'bottom',
    })
      .setLngLat(loc.coordinates)
      .addTo(map);

    // Add popup
    new mapboxgl.Popup({
      offset: 30,
    })
      .setLngLat(loc.coordinates)
      .setHTML(`<p>Day ${loc.day}: ${loc.description}</p>`)
      .addTo(map);

    // Extend map bounds to include current location
    bounds.extend(loc.coordinates);
  });

  map.fitBounds(bounds, {
    padding: {
      top: 200,
      bottom: 150,
      left: 100,
      right: 100,
    },
  });
  window.scrollTo(0, 0);
};
