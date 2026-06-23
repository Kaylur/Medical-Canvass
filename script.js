console.log("script.js loaded");

/* =======================
   MAP SETUP
======================= */
let map = L.map("map").setView([39.8283, -98.5795], 4);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

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
   SIMPLE CACHE (FAST)
======================= */
const cache = {
    geocode: new Map(),
    overpass: new Map(),
    google: new Map()
};

function makeKey(...args) {
    return args.join("|").toLowerCase();
}

/* =======================
   GOOGLE CONFIG
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

function formatAddress(tags = {}) {
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
function classifySpecialty(tags = {}) {

    const specialtyField =
        tags["healthcare:speciality"] ||
        tags["healthcare:specialty"] ||
        tags.speciality ||
        tags.specialty ||
        "";

    const t = (
        (tags.name || "") + " " +
        (tags.healthcare || "") + " " +
        specialtyField + " " +
        JSON.stringify(tags)
    ).toLowerCase();

    const specialties = {
        dentistry: ["dentist", "dental", "dentistry"],
        psychiatry: ["psychiatry", "psychiatrist"],
        psychology: ["psychology", "psychologist"],
        behavioral_health: ["behavioral", "mental health"],
        occupational_therapy: ["occupational therapy"],
        speech_therapy: ["speech therapy"],
        neurosurgery: ["neurosurgery", "brain surgery"],
        cardiothoracic_surgery: ["cardiothoracic", "heart surgery"],
        vascular_medicine: ["vascular", "vein"],
        cardiology: ["cardio", "heart"],
        orthopedics: ["orthopedic"],
        pediatrics: ["pediatric"],
        urgent_care: ["urgent care"],
        primary_care: ["primary care"],
        radiology: ["radiology"],
        dermatology: ["skin", "derm"],
        neurology: ["neurology"],
        oncology: ["oncology", "cancer"]
    };

    for (const [key, keywords] of Object.entries(specialties)) {
        if (keywords.some(k => t.includes(k))) return key;
    }

    return "unknown";
}

/* =======================
   GEOCODING (cached)
======================= */
async function geocode(address) {

    const key = makeKey(address);
    if (cache.geocode.has(key)) return cache.geocode.get(key);

    const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
    );

    const data = await res.json();

    if (!data.length) throw new Error("Not found");

    const result = {
        lat: Number(data[0].lat),
        lon: Number(data[0].lon)
    };

    cache.geocode.set(key, result);
    return result;
}

/* =======================
   OVERPASS SEARCH (cached)
======================= */
async function searchPlaces(lat, lon, radius) {

    const key = makeKey(lat, lon, radius);
    if (cache.overpass.has(key)) return cache.overpass.get(key);

    const meters = Math.min(radius, 25) * 1609.34;

    const query = `
[out:json][timeout:25];
(
    node["amenity"~"hospital|clinic|doctors|dentist"](around:${meters},${lat},${lon});
    way["amenity"~"hospital|clinic|doctors|dentist"](around:${meters},${lat},${lon});
    relation["amenity"~"hospital|clinic|doctors|dentist"](around:${meters},${lat},${lon});
    node["healthcare"](around:${meters},${lat},${lon});
    way["healthcare"](around:${meters},${lat},${lon});
    relation["healthcare"](around:${meters},${lat},${lon});
);
out center tags;
`;

    const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: query
    });

    const json = await res.json();
    const result = json.elements || [];

    cache.overpass.set(key, result);
    return result;
}

/* =======================
   GOOGLE ENRICHMENT (safe)
======================= */
async function googleNearby(lat, lon) {

    const key = makeKey("google", lat, lon);
    if (cache.google.has(key)) return cache.google.get(key);

    if (!GOOGLE_API_KEY || GOOGLE_API_KEY.includes("YOUR_KEY")) return [];

    const url =
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
        `?location=${lat},${lon}&radius=50000&type=hospital&key=${GOOGLE_API_KEY}`;

    const res = await fetch(url);
    const data = await res.json();

    const results = data.results || [];
    cache.google.set(key, results);

    return results;
}

/* =======================
   ENRICHMENT (FIXED)
======================= */
async function enrich(overpassData) {

    const googleResults = await googleNearby(userLat, userLon);

    return overpassData.map(p => {

        const tags = p.tags || {};
        const lat = p.lat || p.center?.lat;
        const lon = p.lon || p.center?.lon;

        if (!lat || !lon) return null;

        let name = tags.name;
        let phone = tags.phone || tags["contact:phone"];
        let address = formatAddress(tags);

        const match = googleResults.find(g => {
            if (!g.geometry?.location) return false;

            const d = getDistanceMiles(
                lat,
                lon,
                g.geometry.location.lat,
                g.geometry.location.lng
            );

            return d < 0.8;
        });

        if (match) {
            name = name || match.name;
            phone = phone || match.formatted_phone_number;
            address = address || match.formatted_address;
        }

        return {
            ...p,
            tags: {
                ...tags,
                name,
                phone,
                "addr:full": address || "Address not available"
            },
            lat,
            lon,
            specialty: classifySpecialty(tags),
            distance: getDistanceMiles(userLat, userLon, lat, lon)
        };
    }).filter(Boolean);
}

/* =======================
   RENDER
======================= */
function render(data) {

    const results = document.getElementById("results");
    const status = document.getElementById("status");

    results.innerHTML = "";
    clearMarkers();

    const filtered = data.sort((a, b) => a.distance - b.distance);

    filtered.forEach(p => {

        const name = p.tags.name || "Medical Facility";
        const address = p.tags["addr:full"];
        const phone = formatPhone(p.tags.phone || p.tags["contact:phone"]);
        const dist = p.distance.toFixed(2);

        const marker = L.marker([p.lat, p.lon]).addTo(map);
        marker.bindPopup(name);
        markers.push(marker);

        const div = document.createElement("div");
        div.className = "result-card";

        div.innerHTML = `
            <div class="card-header">
                <h3>${name}</h3>
                <span>${dist} mi</span>
            </div>

            <div class="field-row">
                <span>${address}</span>
                <button class="copy-btn">Copy</button>
            </div>

            ${phone ? `
            <div class="field-row">
                <span>${phone}</span>
                <button class="copy-btn">Copy</button>
            </div>` : ""}

            <button class="map-btn">Open in Maps</button>
        `;

        div.onclick = () => map.setView([p.lat, p.lon], 15);

        div.querySelectorAll(".copy-btn").forEach(btn => {
            btn.onclick = e => {
                e.stopPropagation();
                copyToClipboard(btn.previousElementSibling.innerText);
            };
        });

        div.querySelector(".map-btn").onclick = e => {
            e.stopPropagation();
            openGoogleMaps(p.lat, p.lon);
        };

        results.appendChild(div);
    });

    status.textContent = `Found ${filtered.length} locations`;
}

/* =======================
   SEARCH
======================= */
async function runSearch() {

    const address = document.getElementById("address").value.trim();
    const status = document.getElementById("status");

    if (!address) return alert("Enter an address");

    status.textContent = "Searching...";

    const loc = await geocode(address);

    userLat = loc.lat;
    userLon = loc.lon;

    map.setView([userLat, userLon], 12);

    L.marker([userLat, userLon]).addTo(map);

    const data = await searchPlaces(userLat, userLon, searchRadiusMiles);
    const enriched = await enrich(data);

    render(enriched);
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
            searchTimeout = setTimeout(runSearch, 400);
        }
    };
});