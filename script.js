let map;
let markers = [];

/* ---------------- MAP INIT ---------------- */
function initMap() {
    map = L.map("map").setView([39.8283, -98.5795], 4);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);
}

/* ---------------- UTIL: CLEAR MARKERS ---------------- */
function clearMarkers() {
    markers.forEach(m => map.removeLayer(m));
    markers = [];
}

/* ---------------- GEOCODE ---------------- */
async function geocode(address) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data.length) throw new Error("Address not found");

    return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
    };
}

/* ---------------- FIND HOSPITALS ---------------- */
async function findHospitals(lat, lon) {
    const query = `
[out:json];
(
  node["amenity"="hospital"](around:10000,${lat},${lon});
  way["amenity"="hospital"](around:10000,${lat},${lon});
  relation["amenity"="hospital"](around:10000,${lat},${lon});
);
out center;
`;

    const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: query
    });

    return await res.json();
}

/* ---------------- DISPLAY RESULTS ---------------- */
function displayResults(data) {
    const results = document.getElementById("results");
    results.innerHTML = "";

    clearMarkers();

    if (!data || !data.length) {
        results.innerHTML = "<p>No hospitals found.</p>";
        return;
    }

    data.forEach(place => {
        const tags = place.tags || {};
        const name = tags.name || "Unnamed Hospital";

        const lat = place.lat || place.center?.lat;
        const lon = place.lon || place.center?.lon;

        if (!lat || !lon) return;

        const marker = L.marker([lat, lon])
            .addTo(map)
            .bindPopup(name);

        markers.push(marker);

        const div = document.createElement("div");
        div.className = "result";
        div.innerHTML = `
      <h3>${name}</h3>
      <p>${lat}, ${lon}</p>
      <button onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}')">
        Directions
      </button>
    `;

        results.appendChild(div);
    });
}

/* ---------------- MAIN SEARCH FUNCTION ---------------- */
async function searchFacilities() {
    const address = document.getElementById("address").value;
    const status = document.getElementById("status");

    if (!address) {
        alert("Enter an address");
        return;
    }

    try {
        status.textContent = "Searching...";

        const loc = await geocode(address);

        map.setView([loc.lat, loc.lon], 13);

        const userMarker = L.marker([loc.lat, loc.lon])
            .addTo(map)
            .bindPopup("Search location");

        markers.push(userMarker);

        const hospitals = await findHospitals(loc.lat, loc.lon);

        displayResults(hospitals.elements || []);

        status.textContent = `Found ${hospitals.elements.length} hospitals`;

    } catch (err) {
        console.error(err);
        status.textContent = "Error: " + err.message;
    }
}

/* ---------------- FIX: BUTTON WIRING ---------------- */
document.addEventListener("DOMContentLoaded", () => {
    console.log("script loaded");

    initMap();

    document
        .getElementById("searchBtn")
        .addEventListener("click", searchFacilities);
});