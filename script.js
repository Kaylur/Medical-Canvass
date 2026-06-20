console.log("script.js loaded");

let map = L.map('map').setView([39.8283, -98.5795], 4);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let markers = [];
let userLat = null;
let userLon = null;

/* ---------------- CLEAR MARKERS ---------------- */
function clearMarkers() {
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
}

/* ---------------- DISTANCE (HAVERSINE) ---------------- */
function getDistanceMiles(lat1, lon1, lat2, lon2) {
    const R = 3958.8;

    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/* ---------------- GEOCODE ---------------- */
async function geocodeAddress(address) {
    const url =
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;

    const res = await fetch(url);

    if (!res.ok) {
        throw new Error("Geocoding request failed");
    }

    const data = await res.json();

    if (!data.length) {
        throw new Error("Address not found");
    }

    return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
    };
}

/* ---------------- OVERPASS SEARCH ---------------- */
async function findHospitals(lat, lon) {
    const query = `
[out:json][timeout:25];
(
  node["amenity"="hospital"](around:10000,${lat},${lon});
  way["amenity"="hospital"](around:10000,${lat},${lon});
  relation["amenity"="hospital"](around:10000,${lat},${lon});
);
out center tags;
`;

    const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: query
    });

    if (!res.ok) {
        throw new Error("Hospital search failed");
    }

    return await res.json();
}

/* ---------------- FORMAT ADDRESS (IMPROVED) ---------------- */
function formatAddress(tags) {
    if (!tags) return "Address not available";

    // best possible full address first
    if (tags["addr:full"]) return tags["addr:full"];

    const parts = [
        tags["addr:housenumber"],
        tags["addr:street"],
        tags["addr:city"],
        tags["addr:state"],
        tags["addr:postcode"]
    ].filter(Boolean);

    return parts.length > 0
        ? parts.join(", ")
        : "Address not available";
}

/* ---------------- CLEAN FIELD HELPERS ---------------- */
function cleanText(value, fallback) {
    if (!value || value.trim() === "") return fallback;
    return value;
}

/* ---------------- DISPLAY RESULTS ---------------- */
function displayResults(elements) {
    const resultsDiv = document.getElementById("results");

    resultsDiv.innerHTML = "";
    clearMarkers();

    if (!elements || elements.length === 0) {
        resultsDiv.innerHTML =
            "<p>No hospitals found nearby.</p>";
        return;
    }

    // enrich with distance
    const enriched = elements.map(place => {
        const tags = place.tags || {};

        const lat = place.lat || place.center?.lat;
        const lon = place.lon || place.center?.lon;

        if (!lat || !lon) return null;

        const distance = getDistanceMiles(
            userLat,
            userLon,
            lat,
            lon
        );

        return {
            ...place,
            tags,
            lat,
            lon,
            distance
        };
    }).filter(Boolean);

    // sort closest first
    enriched.sort((a, b) => a.distance - b.distance);

    enriched.forEach(place => {
        const tags = place.tags;

        const name = cleanText(tags.name, "Unnamed Hospital");
        const address = formatAddress(tags);

        const phone = cleanText(
            tags.phone || tags["contact:phone"],
            "Phone not available"
        );

        const distanceText = place.distance.toFixed(2);

        // marker
        const marker = L.marker([place.lat, place.lon])
            .addTo(map)
            .bindPopup(`
                <b>${name}</b><br>
                ${distanceText} miles
            `);

        markers.push(marker);

        // result card (cleaned output)
        const div = document.createElement("div");
        div.className = "result-card";

        div.innerHTML = `
            <h3>${name}</h3>

            <p><strong>Distance:</strong> ${distanceText} miles</p>

            ${address !== "Address not available"
                ? `<p><strong>Address:</strong> ${address}</p>`
                : ""}

            ${phone !== "Phone not available"
                ? `<p><strong>Phone:</strong> ${phone}</p>`
                : ""}
        `;

        resultsDiv.appendChild(div);
    });
}

/* ---------------- SEARCH FUNCTION ---------------- */
async function searchFacilities() {
    const address = document.getElementById("address").value.trim();
    const status = document.getElementById("status");

    if (!address) {
        alert("Please enter an address");
        return;
    }

    try {
        status.textContent = "Searching...";

        const location = await geocodeAddress(address);

        userLat = location.lat;
        userLon = location.lon;

        map.setView([userLat, userLon], 12);

        L.marker([userLat, userLon])
            .addTo(map)
            .bindPopup("Search Location");

        const hospitals = await findHospitals(userLat, userLon);

        displayResults(hospitals.elements || []);

        status.textContent =
            `Found ${hospitals.elements.length} hospitals (closest first).`;

    } catch (err) {
        console.error(err);
        status.textContent = "Error: " + err.message;
    }
}

/* ---------------- BUTTON HOOK ---------------- */
document.addEventListener("DOMContentLoaded", () => {
    document
        .getElementById("searchBtn")
        .addEventListener("click", searchFacilities);

    console.log("Search ready");
});