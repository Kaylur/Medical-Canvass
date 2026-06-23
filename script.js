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
        addiction_medicine: ["addiction", "substance"],
        allergist: ["allergy", "immunology"],
        anesthesiology: ["anesthesiology"],
        bariatrics: ["bariatric", "weight loss"],
        behavioral_health: ["behavioral", "mental health"],
        cardiology: ["cardio", "heart"],
        cardiothoracic_surgery: ["cardiothoracic", "heart surgery"],
        chiropractor: ["chiropractor"],
        colorectal_surgery: ["colorectal"],
        critical_care: ["intensive care", "critical care"],
        dentistry: ["dentist", "dental"],
        dermatology: ["derm", "skin"],
        emergency_medicine: ["emergency", "er"],
        endocrinology: ["endocrinology"],
        family_medicine: ["family medicine"],
        fertility_reproductive: ["fertility", "ivf"],
        gastroenterology: ["gastro", "digestive"],
        geriatrics: ["geriatrics"],
        general_surgery: ["general surgery"],
        hematology: ["hematology"],
        hospice: ["hospice"],
        imaging_center: ["mri", "ct", "imaging"],
        infectious_disease: ["infectious"],
        internal_medicine: ["internal medicine"],
        maternal_fetal: ["maternal", "high risk pregnancy"],
        neonatology: ["neonatal", "nicu"],
        nephrology: ["nephrology", "kidney"],
        neurosurgery: ["neurosurgery", "brain surgery"],
        neurology: ["neurology"],
        obstetrics_gynecology: ["obgyn", "gynecology"],
        occupational_therapy: ["occupational therapy"],
        oncology: ["oncology", "cancer"],
        ophthalmology: ["ophthalmology", "eye"],
        orthodontics: ["orthodont"],
        orthopedics: ["orthopedic"],
        osteopathy: ["osteopathy"],
        otolaryngology: ["ent", "ear nose throat"],
        pain_management: ["pain management"],
        pathology: ["pathology"],
        pediatrics: ["pediatric"],
        pharmacy: ["pharmacy", "drug", "apothecary", "chemist", "dispensary"],
        physical_therapy: ["physical therapy"],      
        psychiatry: ["psychiatry"],
        psychology: ["psychology"],
        physiatry: ["physiatry"],
        plastic_surgery: ["plastic surgery"],
        podiatry: ["podiatry"],
        primary_care: ["primary care"],
        pulmonology: ["pulmonology"],
        radiology: ["radiology"],
        rheumatology: ["rheumatology"],
        sleep_medicine: ["sleep medicine"],
        speech_therapy: ["speech therapy"],
        sports_medicine: ["sports medicine"],
        urgent_care: ["urgent care"],
        urology: ["urology"],
        vascular_medicine: ["vascular medicine", "vein"],
        vascular_surgery: ["vascular surgery"]
    };

    for (const [key, keywords] of Object.entries(specialties)) {
        if (keywords.some(k => t.includes(k))) {
            return key;
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

    const data = await res.json();

    if (!data.length) throw new Error("Location not found");

    return {
        lat: Number(data[0].lat),
        lon: Number(data[0].lon)
    };
}

/* =======================
   OVERPASS SEARCH
======================= */
async function searchPlaces(lat, lon, radius) {

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

    const data = await res.json();
    return data.elements || [];
}

/* =======================
   ENRICH + CLASSIFY
======================= */
async function enrich(overpassData) {

    const googleResults = await googleNearby(userLat, userLon);

    const enrichedGoogle = [];

    // Fetch full Google details
    for (const g of googleResults) {
        try {
            const details = await googleDetails(g.place_id);
            if (details) enrichedGoogle.push(details);
        } catch (e) { }
    }

    return overpassData.map(p => {

        const tags = p.tags || {};
        const lat = p.lat || p.center?.lat;
        const lon = p.lon || p.center?.lon;

        if (!lat || !lon) return null;

        let name = tags.name || "";
        let phone = tags.phone || tags["contact:phone"] || "";
        let address = formatAddress(tags);

        const fullText = (name + " " + JSON.stringify(tags)).toLowerCase();

        /* =========================
           IMPROVED GOOGLE MATCHING
        ========================= */
        let match = enrichedGoogle.find(g => {

            if (!g.geometry?.location) return false;

            const gName = (g.name || "").toLowerCase();

            const nameMatch =
                name && gName && (
                    gName.includes(name.toLowerCase()) ||
                    name.toLowerCase().includes(gName)
                );

            const dist = getDistanceMiles(
                lat,
                lon,
                g.geometry.location.lat,
                g.geometry.location.lng
            );

            return nameMatch || dist < 1.0; // increased from 0.5 ? 1 mile
        });

        /* =========================
           FALLBACK 2: WEAK MATCH
        ========================= */
        if (!match) {
            match = enrichedGoogle.find(g => {
                if (!g.geometry?.location) return false;

                const dist = getDistanceMiles(
                    lat,
                    lon,
                    g.geometry.location.lat,
                    g.geometry.location.lng
                );

                return dist < 1.5; // wider fallback net
            });
        }

        /* =========================
           FILL MISSING DATA
        ========================= */
        if (match) {
            name = name || match.name;
            phone = phone || match.formatted_phone_number;
            address = address || match.formatted_address;
        }

        /* =========================
           FINAL SAFETY FALLBACKS
        ========================= */
        if (!address) {
            address = "Address temporarily unavailable";
        }

        if (!phone) {
            phone = null; // keeps UI clean instead of fake numbers
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
   RENDER
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
        const address = formatAddress(p.tags) || "Address not available";
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
            };
        });

        div.querySelector(".map-btn").onclick = e => {
            e.stopPropagation();
            openGoogleMaps(p.lat, p.lon);
        };

        results.appendChild(div);
    });

    status.textContent = `Found ${filtered.length} locations within ${searchRadiusMiles} miles`;
}

/* =======================
   MAIN SEARCH
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

    const enriched = enrich(data);

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
            searchTimeout = setTimeout(runSearch, 500);
        }
    };
});