console.log("script.js loaded");

/* =======================
   MAP SETUP
======================= */
let map = L.map('map').setView([39.8283, -98.5795], 4);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
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
   GOOGLE CONFIG (DO NOT REMOVE KEY)
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
function classifySpecialty(tags = {}) {

    const specialtyField =
        tags?.["healthcare:speciality"] ||
        tags?.["healthcare:specialty"] ||
        tags?.speciality ||
        tags?.specialty ||
        "";

    const t = (
        (tags.name || "") + " " +
        (tags.healthcare || "") + " " +
        specialtyField + " " +
        JSON.stringify(tags || {})
    ).toLowerCase();

    const specialties = {
        // your specialty map goes here
    };

    for (const [specialty, keywords] of Object.entries(specialties)) {
        if (keywords.some(keyword => t.includes(keyword))) {
            return specialty;
        }
    }

    return "unknown";
}
    addiction_medicine: [
        "addiction medicine",
        "substance abuse"
    ],

    allergist: [
        "allergy",
        "allergist",
        "immunology",
        "immunologist"
    ],

    anesthesiology: [
        "anesthesiology",
        "anesthesiologist"
    ],

    bariatrics: [
        "bariatric",
        "weight loss surgery"
    ],
    
    behavioral_health: [
        "behavioral health",
        "behavioral medicine",
        "mental health",
        "mental wellness"
    ],

    cardiology: [
        "cardiology",
        "cardiologist",
        "heart center",
        "heart institute"
    ],

    cardiothoracic_surgery: [
        "cardiothoracic surgery",
        "thoracic surgery",
        "cardiac surgery",
        "heart surgery"
    ],

    chiropractor: [
        "chiropractic",
        "chiropractor"
    ],

    colorectal_surgery: [
        "colorectal",
        "colon and rectal"
    ],

    critical_care: [
        "critical care",
        "intensive care"
    ],

    dentistry: [
        "dentist",
        "dental",
        "dentistry",
        "oral surgery"
    ],

    dermatology: [
        "dermatology",
        "dermatologist",
        "skin clinic"
    ],

    emergency_medicine: [
        "emergency medicine",
        "emergency room"
    ],

    endocrinology: [
        "endocrinology",
        "endocrinologist"
    ],

    family_medicine: [
        "family medicine",
        "family practice",
        "family physician"
    ],

    fertility_reproductive: [
        "fertility",
        "reproductive medicine",
        "ivf"
    ],

    gastroenterology: [
        "gastroenterology",
        "gastroenterologist",
        "digestive health"
    ],

    geriatrics: [
        "geriatrics",
        "geriatric"
    ],

    general_surgery: [
        "general surgery"
    ],

    hematology: [
        "hematology",
        "hematologist"
    ],

    hospice: [
        "hospice"
    ],

    imaging_center: [
        "imaging",
        "diagnostic imaging",
        "mri",
        "ct scan",
        "ultrasound center"
    ],

    infectious_disease: [
        "infectious disease"
    ],

    internal_medicine: [
        "internal medicine",
        "internist"
    ],

    maternal_fetal: [
        "maternal fetal",
        "high risk pregnancy"
    ],

    neonatology: [
        "neonatology",
        "nicu"
    ],

    nephrology: [
        "nephrology",
        "nephrologist",
        "kidney center"
    ],

    neurosurgery: [
        "neurosurgery",
        "neurosurgeon",
        "brain surgery",
        "spine surgery"
    ],

    neurology: [
        "neurology",
        "neurologist",
        "neuroscience"
    ],

    obstetrics_gynecology: [
        "obstetrics",
        "gynecology",
        "obgyn",
        "ob-gyn"
    ],

    occupational_therapy: [
        "occupational therapy",
        "occupational therapist",
        "ot clinic"
    ],

    oncology: [
        "oncology",
        "oncologist",
        "cancer center"
    ],

    ophthalmology: [
        "ophthalmology",
        "ophthalmologist",
        "eye center",
        "eye clinic"
    ],

    orthodontics: [
        "orthodontic",
        "orthodontist"
    ],

    orthopedics: [
        "orthopedic",
        "orthopaedic"
    ],

    osteopathy: [
        "osteopath",
        "osteopathic"
    ],

    otolaryngology: [
        "otolaryngology",
        "ent",
        "ear nose throat"
    ],

    pain_management: [
        "pain management"
    ],

    pathology: [
        "pathology",
        "pathologist"
    ],

    pediatrics: [
        "pediatric",
        "pediatrics",
        "children's clinic"
    ],

    physical_therapy: [
        "physical therapy",
        "physical therapist",
        "rehabilitation"
    ],

    psychiatry: [
        "psychiatry",
        "psychiatrist"
    ],

    psychology: [
        "psychology",
        "psychologist",
        "counseling psychology"
    ],


    physiatry: [
        "physiatry",
        "physical medicine"
    ],

    plastic_surgery: [
        "plastic surgery",
        "cosmetic surgery"
    ],

    podiatry: [
        "podiatry",
        "podiatrist",
        "foot clinic"
    ],

    primary_care: [
        "primary care"
    ],

    pulmonology: [
        "pulmonology",
        "pulmonologist",
        "lung center"
    ],

    radiology: [
        "radiology",
        "radiologist"
    ],

    rheumatology: [
        "rheumatology",
        "rheumatologist"
    ],

    sleep_medicine: [
        "sleep medicine",
        "sleep center"
    ],

    speech_therapy: [
        "speech therapy",
        "speech therapist",
        "speech pathology",
        "speech-language pathology",
        "slp"
    ],

    sports_medicine: [
        "sports medicine",
        "sports injury"
    ],

    urgent_care: [
        "urgent care"
    ],

    urology: [
        "urology",
        "urologist"
    ],

    vascular_medicine: [
        "vascular medicine",
        "vascular specialist",
        "vein clinic",
        "vascular center"
    ],

    vascular_surgery: [
        "vascular surgery"
    ]
};
/* =======================
   SPECIALTY CLASSIFIER END
======================= */

for (const [specialty, keywords] of Object.entries(specialties)) {
    if (keywords.some(keyword => t.includes(keyword))) {
        return specialty;
    }
}

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

    try {
        const data = JSON.parse(text);

        if (!Array.isArray(data) || !data.length) {
            throw new Error("Not found");
        }

        return {
            lat: Number(data[0].lat),
            lon: Number(data[0].lon)
        };

    } catch (e) {
        throw new Error("Geocoding failed");
    }
}

/* =======================
   OVERPASS (PRIMARY DATA)
======================= */
async function searchPlaces(lat, lon, radius) {

    const safeRadius = Math.min(radius, 25);
    const radiusMeters = safeRadius * 1609.34;

    const query = `
[out:json][timeout:25];
(
    node["amenity"~"hospital|clinic|doctors|dentist"](around:${radiusMeters},${lat},${lon});
    way["amenity"~"hospital|clinic|doctors|dentist"](around:${radiusMeters},${lat},${lon});
    relation["amenity"~"hospital|clinic|doctors|dentist"](around:${radiusMeters},${lat},${lon});

    node["healthcare"](around:${radiusMeters},${lat},${lon});
    way["healthcare"](around:${radiusMeters},${lat},${lon});
    relation["healthcare"](around:${radiusMeters},${lat},${lon});

    node["healthcare:speciality"](around:${radiusMeters},${lat},${lon});
    way["healthcare:speciality"](around:${radiusMeters},${lat},${lon});
    relation["healthcare:speciality"](around:${radiusMeters},${lat},${lon});
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
        return json.elements || [];
    } catch {
        throw new Error("Overpass API failed");
    }
}

/* =======================
   GOOGLE PLACES (ENRICHMENT)
======================= */
async function googleNearby(lat, lon) {

    if (GOOGLE_API_KEY === "AIzaSyBj-dyxJUvX_0i7VBsc36OAUZnv2u8lJ_I") return [];

    const url =
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
        `?location=${lat},${lon}` +
        `&radius=50000` +
        `&type=hospital&key=${GOOGLE_API_KEY}`;

    const res = await fetch(url);
    const data = await res.json();

    return data.results || [];
}

async function googleDetails(placeId) {

    const url =
        `https://maps.googleapis.com/maps/api/place/details/json` +
        `?place_id=${placeId}` +
        `&fields=name,formatted_phone_number,formatted_address,geometry` +
        `&key=${GOOGLE_API_KEY}`;

    const res = await fetch(url);
    const data = await res.json();

    return data.result;
}

/* =======================
   ENRICHMENT ENGINE (FIXED)
======================= */
async function enrich(overpassData) {

    const googleResults = await googleNearby(userLat, userLon);

    const enrichedGoogle = [];

    for (const g of googleResults) {
        try {
            const details = await googleDetails(g.place_id);
            if (details) enrichedGoogle.push(details);
        } catch { }
    }

    return overpassData.map(p => {

        const tags = p.tags || {};
        const lat = p.lat || p.center?.lat;
        const lon = p.lon || p.center?.lon;

        if (!lat || !lon) return null;

        let name = tags.name;
        let phone = tags.phone || tags["contact:phone"];
        let address = formatAddress(tags);

        /* =======================
           SMART MATCH (DISTANCE BASED — BEST METHOD)
        ======================= */
        if (!name || !phone || !address) {

            const match = enrichedGoogle.find(g => {
                if (!g.geometry?.location) return false;

                const d = getDistanceMiles(
                    lat,
                    lon,
                    g.geometry.location.lat,
                    g.geometry.location.lng
                );

                return d < 0.5; // 0.5 mile radius match
            });

            if (match) {
                name = name || match.name;
                phone = phone || match.formatted_phone_number;
                address = address || match.formatted_address;
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
            specialty: (
                tags["healthcare:speciality"] ||
                tags["healthcare:specialty"] ||
                tags.speciality ||
                tags.specialty
            )
            ? (
                tags["healthcare:speciality"] ||
                tags["healthcare:specialty"] ||
                tags.speciality ||
                tags.specialty
            ).toLowerCase()
            : classifySpecialty(tags),
            distance: getDistanceMiles(userLat, userLon, lat, lon)
        };
    }).filter(Boolean);
}

/* =======================
   RENDER RESULTS
======================= */
function render(data) {

    const results = document.getElementById("results");
    const status = document.getElementById("status");

    results.innerHTML = "";
    clearMarkers();

    const typeFilter = document.getElementById("typeFilter").value;
    const specFilter = document.getElementById("specialtyFilter").value;

    const filtered = data.filter(p => {

        const t = p.tags || {};

        if (typeFilter !== "all") {
            if (t.amenity !== typeFilter && t.healthcare !== typeFilter) return false;
        }

        if (specFilter !== "all" && p.specialty !== specFilter) return false;

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
        `;

        div.onclick = () => map.setView([p.lat, p.lon], 15);

        div.querySelectorAll(".copy-btn").forEach(btn => {
            btn.onclick = e => {
                e.stopPropagation();
                copyToClipboard(btn.previousElementSibling.innerText);
                btn.innerText = "Copied";
                setTimeout(() => btn.innerText = "Copy", 1000);
            };
        });

        div.querySelector(".map-btn").onclick = e => {
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
        status.textContent = "Locating...";

        const loc = await geocode(address);

        userLat = loc.lat;
        userLon = loc.lon;

        map.setView([userLat, userLon], 12);

        L.marker([userLat, userLon])
            .addTo(map)
            .bindPopup("Search Location");

        status.textContent = "Loading nearby medical facilities...";

        const overpass = await searchPlaces(userLat, userLon, searchRadiusMiles);

        const enriched = await enrich(overpass);

        render(enriched);

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