console.log("script.js loaded");

let map = L.map('map').setView([39.8283, -98.5795], 4);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

/* STATE */
let markers = [];
let userLat = null;
let userLon = null;
let searchRadiusMiles = 10;
let searchTimeout = null;

/* ---------------- UTILITIES ---------------- */
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

function copy(text) {
    navigator.clipboard.writeText(text);
}

function openMap(lat, lon) {
    window.open(`https://www.google.com/maps?q=${lat},${lon}`, "_blank");
}

/* ---------------- SPECIALTY ENGINE ---------------- */
function classify(tags) {
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

/* ---------------- GEOCODE ---------------- */
async function geocode(address) {
    const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
    );

    const data = await res.json();
    if (!data.length) throw new Error("Not found");

    return { lat: +data[0].lat, lon: +data[0].lon };
}

/* ---------------- OVERPASS ---------------- */
async function search(lat, lon, radius) {

    const q = `
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
        body: q
    });

    return await res.json();
}

/* ---------------- DISPLAY ---------------- */
function render(data) {
    const results = document.getElementById("results");
    const status = document.getElementById("status");

    results.innerHTML = "";
    clearMarkers();

    const typeFilter = document.getElementById("typeFilter").value;
    const specFilter = document.getElementById("specialtyFilter").value;

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
            specialty: classify(tags),
            distance: getDistanceMiles(userLat, userLon, lat, lon)
        };
    }).filter(Boolean);

    const filtered = enriched.filter(p => {
        const t = p.tags;

        if (typeFilter !== "all") {
            if (t.amenity !== typeFilter) return false;
        }

        if (specFilter !== "all" && p.specialty !== specFilter) return false;

        return true;
    });

    filtered.sort((a, b) => a.distance - b.distance);

    filtered.forEach(p => {

        const name = p.tags.name || "Unnamed";
        const address = formatAddress(p.tags);
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

        div.querySelectorAll(".copy-btn").forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                copy(btn.previousElementSibling.innerText);
                btn.innerText = "Copied";
                setTimeout(() => btn.innerText = "Copy", 1000);
            };
        });

        div.querySelector(".map-btn").onclick = (e) => {
            e.stopPropagation();
            openMap(p.lat, p.lon);
        };

        div.onclick = () => map.setView([p.lat, p.lon], 15);

        results.appendChild(div);
    });

    status.textContent =
        `Found ${filtered.length} results within ${searchRadiusMiles} miles`;
}

/* ---------------- MAIN ---------------- */
async function run() {
    const addr = document.getElementById("address").value;
    if (!addr) return alert("Enter address");

    const loc = await geocode(addr);
    userLat = loc.lat;
    userLon = loc.lon;

    map.setView([userLat, userLon], 12);

    const data = await search(userLat, userLon, searchRadiusMiles);

    render(data.elements || []);
}

/* ---------------- INIT ---------------- */
document.addEventListener("DOMContentLoaded", () => {

    document.getElementById("searchBtn").onclick = run;

    const slider = document.getElementById("radius");
    const label = document.getElementById("radiusValue");

    slider.oninput = () => {
        searchRadiusMiles = +slider.value;
        label.textContent = searchRadiusMiles;

        if (userLat && userLon) {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(run, 400);
        }
    };
});