console.log("script.js loaded");

/* =======================
   MAP INIT
======================= */
let map = L.map('map').setView([39.8283, -98.5795], 4);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

/* Fix map rendering inside flex layout */
setTimeout(() => map.invalidateSize(), 300);
window.addEventListener("resize", () => map.invalidateSize());

/* =======================
   STATE
======================= */
let markers = [];
let userLat = null;
let userLon = null;
let searchRadiusMiles = 10;
let searchTimeout = null;

/* =======================
   UTILITIES
======================= */
function clearMarkers() {
    markers.forEach(m => map.removeLayer(m));
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

function formatPhone(phone) {
    if (!phone) return null;

    const d = phone.replace(/\D/g, "");

    if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    if (d.length === 11 && d[0] === "1") return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;

    return phone;
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
}

function openGoogleMaps(lat, lon) {
    window.open(`https://www.google.com/maps?q=${lat},${lon}`, "_blank");
}

/* =======================
   SPECIALTY ENGINE
======================= */
function classifySpecialty(tags) {
    const text = ((tags.name || "") + " " + JSON.stringify(tags)).toLowerCase();

    if (text.includes("ortho")) return "orthopedics";
    if (text.includes("urgent")) return "urgent_care";
    if (text.includes("pediatric")) return "pediatrics";
    if (text.includes("family")) return "family_medicine";
    if (text.includes("primary")) return "primary_care";
    if (text.includes("chiro")) return "chiropractor";
    if (text.includes("neuro")) return "neurology";
    if (text.includes("cardio")) return "cardiology";
    if (text.includes("derma")) return "dermatology";
    if (text.includes("oncolog")) return "oncology";
    if (text.includes("radiolog")) return "radiology";
    if (text.includes("dent")) return "dentistry";

    return "unknown";
}

/* =======================
   GEOCODE
======================= */
async function geocode(address) {
    const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
    );

    const data = await res.json();
    if (!data.length) throw new Error("Location not found");

    return {
        lat: +data[0].lat,
        lon: +data[0].lon
    };
}

/* =======================
   OVERPASS SEARCH
======================= */
async function searchPlaces(lat, lon, radius) {

    const query = `
[out:json][timeout:25];
(
 node["amenity"~"hospital|clinic|doctors|dentist"](around:${radius * 1609.34},${lat},${lon});
 way["amenity"~"hospital|clinic|doctors|dentist"](around:${radius * 1609.34},${lat},${lon});
 relation["amenity"~"hospital|clinic|doctors|dentist"](around:${radius * 1609.34},${lat},${lon});
 node["healthcare"](around:${radius * 1609.34},${lat},${lon});
);
out center tags;
`;

    const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: query
    });

    return await res.json();
}

/* =======================
   RENDER UI (SIDEBAR STYLE)
======================= */
function renderResults(data) {

    const resultsDiv = document.getElementById("results");
    const status = document.getElementById("status");

    resultsDiv.innerHTML = "";
    clearMarkers();

    const typeFilter = document.getElementById("typeFilter").value;
    const specFilter = document.getElementById("specialtyFilter").value;

    if (!data || !data.length) {
        resultsDiv.innerHTML = `<p>No results found.</p>`;
        return;
    }

    const enriched = data.map(p => {
        const tags = p.tags || {};
        const lat = p.lat || p.center?.lat;
        const lon = p.lon || p.center?.lon;

        if (!lat || !lon) return null;

        return {
            ...p,
            tags,
            lat,
            lon,
            specialty: classifySpecialty(tags),
            distance: getDistanceMiles(userLat, userLon, lat, lon)
        };
    }).filter(Boolean);

    const filtered = enriched.filter(p => {

        const t = p.tags;

        if (typeFilter !== "all") {
            if (t.amenity !== typeFilter && t.healthcare !== typeFilter) {
                return false;
            }
        }

        if (specFilter !== "all" && p.specialty !== specFilter) {
            return false;
        }

        return true;
    });

    filtered.sort((a, b) => a.distance - b.distance);

    filtered.forEach(p => {

        const name = p.tags.name || "Unnamed Facility";
        const address = formatAddress(p.tags);
        const phone = formatPhone(p.tags.phone || p.tags["contact:phone"]);
        const dist = p.distance.toFixed(2);

        /* MARKER */
        const marker = L.marker([p.lat, p.lon])
            .addTo(map)
            .bindPopup(name);

        markers.push(marker);

        /* CARD */
        const div = document.createElement("div");
        div.className = "result-card";

        div.innerHTML = `
            <div class="card-header">
                <h3>${name}</h3>
                <span class="distance">${dist} mi</span>
            </div>

            <div class="card-body">

                <div class="field-row">
                    <span>${address}</span>
                    <button class="copy-btn">Copy</button>
                </div>

                ${phone ? `
                <div class="field-row">
                    <span>${phone}</span>
                    <button class="copy-btn">Copy</button>
                </div>` : ""}

                <div class="action-row">
                    <button class="map-btn">Open in Google Maps</button>
                </div>

            </div>
        `;

        /* EVENTS */

        div.onclick = () => {
            map.setView([p.lat, p.lon], 15);
        };

        div.querySelectorAll(".copy-btn").forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                copyToClipboard(btn.previousElementSibling.innerText);

                btn.innerText = "Copied";
                setTimeout(() => btn.innerText = "Copy", 1000);
            };
        });

        div.querySelector(".map-btn").onclick = (e) => {
            e.stopPropagation();
            openGoogleMaps(p.lat, p.lon);
        };

        resultsDiv.appendChild(div);
    });

    status.textContent =
        `Found ${filtered.length} locations within ${searchRadiusMiles} miles`;
}

/* =======================
   MAIN SEARCH
======================= */
async function runSearch() {

    const address = document.getElementById("address").value.trim();
    const status = document.getElementById("status");

    if (!address) return alert("Enter an address");

    try {
        status.textContent = "Finding location...";

        const loc = await geocode(address);

        userLat = loc.lat;
        userLon = loc.lon;

        map.setView([userLat, userLon], 12);

        L.marker([userLat, userLon])
            .addTo(map)
            .bindPopup("Search Location");

        status.textContent = "Searching nearby medical facilities...";

        const data = await searchPlaces(userLat, userLon, searchRadiusMiles);

        renderResults(data.elements || []);

    } catch (err) {
        console.error(err);
        status.textContent = "Error: " + err.message;
    }
}

/* =======================
   INIT UI
======================= */
document.addEventListener("DOMContentLoaded", () => {

    document.getElementById("searchBtn").onclick = runSearch;

    const slider = document.getElementById("radius");
    const label = document.getElementById("radiusValue");

    slider.oninput = () => {
        searchRadiusMiles = +slider.value;
        label.textContent = searchRadiusMiles;

        if (userLat && userLon) {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(runSearch, 400);
        }
    };

});