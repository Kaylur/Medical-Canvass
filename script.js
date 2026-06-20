console.log("script.js loaded");

/* ---------------- MAP INIT ---------------- */
let map = L.map('map').setView([39.8283, -98.5795], 4);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

/* ---------------- STATE ---------------- */
let markers = [];
let userLat = null;
let userLon = null;
let searchRadiusMiles = 10;

let searchTimeout = null;

/* ---------------- UTILS ---------------- */
function clearMarkers() {
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
}

function getDistanceMiles(lat1, lon1, lat2, lon2) {
    const R = 3958.8;

    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

function cleanText(value, fallback) {
    if (!value || value.trim() === "") return fallback;
    return value;
}

function formatAddress(tags) {
    if (!tags) return "Address not available";

    if (tags["addr:full"]) return tags["addr:full"];

    const parts = [
        tags["addr:housenumber"],
        tags["addr:street"],
        tags["addr:city"],
        tags["addr:state"],
        tags["addr:postcode"]
    ].filter(Boolean);

    return parts.length ? parts.join(", ") : "Address not available";
}

/* ---------------- GEOCODE ---------------- */
async function geocodeAddress(address) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("Geocoding request failed");

    const data = await res.json();
    if (!data.length) throw new Error("Address not found");

    return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
    };
}

/* ---------------- OVERPASS ---------------- */
async function findHospitals(lat, lon, radiusMiles) {

    const query = `
[out:json][timeout:25];
(
  node["amenity"="hospital"](around:${radiusMiles * 1609.34},${lat},${lon});
  way["amenity"="hospital"](around:${radiusMiles * 1609.34},${lat},${lon});
  relation["amenity"="hospital"](around:${radiusMiles * 1609.34},${lat},${lon});
);
out center tags;
`;

    const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: query
    });

    if (!res.ok) throw new Error("Hospital search failed");

    return await res.json();
}

/* ---------------- DISPLAY (PRO STYLE) ---------------- */
function displayResults(elements) {
    const resultsDiv = document.getElementById("results");
    const status = document.getElementById("status");

    resultsDiv.innerHTML = "";
    clearMarkers();

    if (!elements || elements.length === 0) {
        resultsDiv.innerHTML = `<p class="empty">No hospitals found nearby.</p>`;
        return;
    }

    const enriched = elements.map(place => {
        const tags = place.tags || {};

        const lat = place.lat || place.center?.lat;
        const lon = place.lon || place.center?.lon;

        if (!lat || !lon) return null;

        const distance = getDistanceMiles(userLat, userLon, lat, lon);

        return {
            ...place,
            tags,
            lat,
            lon,
            distance
        };
    }).filter(Boolean);

    enriched.sort((a, b) => a.distance - b.distance);

    enriched.forEach(place => {
        const tags = place.tags;

        const name = cleanText(tags.name, "Unnamed Hospital");
        const address = formatAddress(tags);
        const phone = cleanText(tags.phone || tags["contact:phone"], null);

        const distanceText = place.distance.toFixed(2);

        /* -------- MARKER -------- */
        const marker = L.marker([place.lat, place.lon])
            .addTo(map)
            .bindPopup(`
                <b>${name}</b><br>
                ${distanceText} miles
            `);

        markers.push(marker);

        /* -------- RESULT CARD (SIDEBAR STYLE) -------- */
        const div = document.createElement("div");
        div.className = "result-card";

        div.innerHTML = `
            <div class="card-header">
                <h3>${name}</h3>
                <span class="distance">${distanceText} mi</span>
            </div>

            <div class="card-body">
                <p>${address !== "Address not available" ? address : ""}</p>
                ${phone ? `<p>${phone}</p>` : ""}
            </div>
        `;

        /* click card ? zoom map */
        div.addEventListener("click", () => {
            map.setView([place.lat, place.lon], 15);
        });

        resultsDiv.appendChild(div);
    });

    status.textContent =
        `Found ${enriched.length} hospitals within ${searchRadiusMiles} miles (sorted by distance).`;
}

/* ---------------- SEARCH CORE ---------------- */
async function searchFacilities() {
    const address = document.getElementById("address").value.trim();
    const status = document.getElementById("status");

    if (!address) {
        alert("Please enter an address");
        return;
    }

    try {
        status.textContent = "Locating address...";

        const location = await geocodeAddress(address);

        userLat = location.lat;
        userLon = location.lon;

        map.setView([userLat, userLon], 12);

        L.marker([userLat, userLon])
            .addTo(map)
            .bindPopup("Search Location");

        status.textContent = "Searching hospitals...";

        const hospitals = await findHospitals(
            userLat,
            userLon,
            searchRadiusMiles
        );

        displayResults(hospitals.elements || []);

    } catch (err) {
        console.error(err);
        status.textContent = "Error: " + err.message;
    }
}

/* ---------------- INIT UI ---------------- */
document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("searchBtn");
    const slider = document.getElementById("radius");
    const radiusLabel = document.getElementById("radiusValue");

    btn.addEventListener("click", searchFacilities);

    /* live slider UX */
    slider.addEventListener("input", () => {
        searchRadiusMiles = parseInt(slider.value);
        radiusLabel.textContent = searchRadiusMiles;

        /* debounce auto-refresh */
        if (userLat && userLon) {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                searchFacilities();
            }, 500);
        }
    });

    console.log("Pro search system ready");
});