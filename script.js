const map = L.map('map').setView([39.8283, -98.5795], 4);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let markers = [];

function clearMarkers() {
    markers.forEach(marker => {
        map.removeLayer(marker);
    });

    markers = [];
}

async function geocodeAddress(address) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;

    const response = await fetch(url, {
        headers: {
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error('Geocoding request failed');
    }

    const data = await response.json();

    if (!data || data.length === 0) {
        throw new Error('Address not found');
    }

    return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
    };
}

async function findHospitals(lat, lon) {
    const query = `
[out:json][timeout:25];
(
  node["amenity"="hospital"](around:10000,${lat},${lon});
  way["amenity"="hospital"](around:10000,${lat},${lon});
  relation["amenity"="hospital"](around:10000,${lat},${lon});
);
out center;
`;

    const response = await fetch(
        'https://overpass-api.de/api/interpreter',
        {
            method: 'POST',
            body: query
        }
    );

    if (!response.ok) {
        throw new Error('Hospital search failed');
    }

    return await response.json();
}

function openDirections(lat, lon) {
}