console.log("script.js loaded");

/* =======================
   MAP INIT
======================= */
let map = L.map('map').setView([39.8283, -98.5795], 4);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

/* Fix map render inside flex layout */
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
   GOOGLE API 
======================= */
const GOOGLE_API_KEY = "AIzaSyBj-dyxJUvX_0i7VBsc36OAUZnv2u8lJ_I";

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

    return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * R;
}

function formatAddress(tags) {
    if (!tags) return null;

    if (tags["addr:full"]) return tags["addr:full"];

    const parts = [
        tags["addr:housenumber"],
        tags["addr:street"],
        tags["addr:city"],
        tags["addr:state"],
        tags["addr:postcode"]
    ].filter(Boolean);

    return parts.length ? parts.join(", ") : null;
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
   SPECIALTY CLASSIFIER
======================= */
function classifySpecialty(tags) {
    const t = ((tags.name || "") + " " + JSON.stringify(tags)).toLowerCase();

    if (t.includes("ortho")) return "orthopedics";
    if (t.includes("urgent")) return "urgent_care";
    if (t.includes("pediatric")) return "pediatrics";
    if (t.includes("family")) return "family_medicine";
    if (t.includes("primary")) return "primary_care";
    if (t.includes("chiro")) return "chiropractor";
    if (t.includes("neuro")) return "neurology";
    if (t.includes("cardio")) return "cardiology";
    if (t.includes("derma")) return "dermatology";
    if (t.includes("oncolog")) return "oncology";
    if (t.includes("radiolog")) return "radiology";
    if (t.includes("dent")) return "dentistry";

    return "unknown";
}

/* =======================
   GEOCODING
======================= */
async function geocode(address) {

    const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
    );

    const text = await res.text();

    let data;
    try {
        data = JSON.parse(text);
    } catch (err) {
        console.error("Geocode invalid response:", text);
        throw new Error("Geocoding failed");
    }

    if (!data.length) throw new Error("Location not found");

    return {
        lat: +data[0].lat,
        lon: +data[0].lon
    };
}

/* =======================
   OVERPASS QUERY (SAFE)
======================= */
async function searchPlaces(lat, lon, radius) {

    const safeRadius = Math.min(radius, 25);

    const query = `
[out:json][timeout:25];
(
 node["amenity"~"hospital|clinic|doctors|dentist"](around:${safeRadius * 1609.34},${lat},${lon});
 way["amenity"~"hospital|clinic|doctors|dentist"](around:${safeRadius * 1609.34},${lat},${lon});
 relation["amenity"~"hospital|clinic|doctors|dentist"](around:${safeRadius * 1609.34},${lat},${lon});
 node["healthcare"](around:${safeRadius * 1609.34},${lat},${lon});
);
out center tags;
`;

    await new Promise(r => setTimeout(r, 500));

    const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: query
    });

    const text = await res.text();

    try {
        const json = JSON.parse(text);

        if (!json || !json.elements) {
            throw new Error("Bad Overpass structure");
        }

        return json;

    } catch (err) {
        console.error("Overpass raw:", text);
        throw new Error("Overpass API failed or rate limited");
    }
}

/* =======================
   GOOGLE FALLBACK (SAFE HOOK ONLY)
======================= */
async function googleFallback(lat, lon) {
    try {
        // NOTE: This is intentionally disabled without API key
        if (GOOGLE_API_KEY === "AIzaSyBj-dyxJUvX_0i7VBsc36OAUZnv2u8lJ_I") return [];

        const url =
            `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
            `?location=${lat},${lon}` +
            `&radius=50000&type=hospital&key=${GOOGLE_API_KEY}`;

        const res = await fetch(url);
        const data = await res.json();

        return data.results || [];

    } catch (err) {
        console.warn("Google fallback failed:", err);
        return [];
    }
}

/* =======================
   ENRICHMENT (FIXES MISSING DATA)
======================= */
async function enrichPlaces(overpassData) {

    const googleData = await googleFallback(userLat, userLon);

    const googleIndex = new Map();

    // index google results by name (basic dedupe)
    googleData.forEach(g => {
        if (g.name) googleIndex.set(g.name.toLowerCase(), g);
    });

    return overpassData.map(p => {

        const tags = p.tags || {};
        const lat = p.lat || p.center?.lat;
        const lon = p.lon || p.center?.lon;

        if (!lat || !lon) return null;

        let name = tags.name;
        let phone = tags.phone || tags["contact:phone"];
        let address = formatAddress(tags);

        /* fallback enrichment */
        if (!name || !phone || !address) {

            const match = googleIndex.get((name || "").toLowerCase());

            if (match) {
                name = name || match.name;
                phone = phone || match.formatted_phone_number;
                address = address || match.vicinity || match.formatted_address;
            }
        }

        return {
            ...p,
            tags: {
                ...tags,
                name,
                phone,
                "addr:full": address
            },
            lat,
            lon,
            specialty: classifySpecialty(tags),
            distance: getDistanceMiles(userLat, userLon, lat, lon)
        };
    }).filter(Boolean);
}

/* =======================
   RENDER UI
======================= */
function renderResults(data) {

    const results = document.getElementById("results");
    const status = document.getElementById("status");

    results.innerHTML = "";
    clearMarkers();

    const typeFilter = document.getElementById("typeFilter").value;
    const specFilter = document.getElementById("specialtyFilter").value;

    const filtered = data.filter(p => {

        const t = p.tags || {};

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

        const name = p.tags.name || "Medical Facility";
        const address = p.tags["addr:full"] || "Address not available";
        const phone = formatPhone(p.tags.phone || p.tags["contact:phone"]);
        const dist = p.distance.toFixed(2);

        const marker = L.marker([p.lat, p.lon])
            .addTo(map)
            .bindPopup(name);

        markers.push(marker);

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

        div.onclick = () => map.setView([p.lat, p.lon], 15);

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

        results.appendChild(div);
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

        status.textContent = "Searching nearby facilities...";

        const overpass = await searchPlaces(userLat, userLon, searchRadiusMiles);

        const enriched = await enrichPlaces(overpass.elements || []);

        renderResults(enriched);

    } catch (err) {
        console.error(err);
        status.textContent = "Error: " + err.message;
    }
}

/* =======================
   INIT
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
            searchTimeout = setTimeout(runSearch, 500);
        }
    };
});