// scripts/generate-jobs-spain.js
// Запуск: node ./scripts/generate-jobs-spain.js --count 100000 --seed 7 --outfile jobs-spain.geojson
//node ./scripts/generate-jobs-spain.mjs --count 50000 --seed 1 --outfile jobs-spain.geojson

import fs from 'node:fs';
import path from 'node:path';

// ---------- Конфиг городов ----------
const CITIES = [
  { name: "Madrid", country: "Spain", lat: 40.4168, lng: -3.7038, radiusKm: 25, weight: 10 },
  { name: "Barcelona", country: "Spain", lat: 41.3851, lng: 2.1734, radiusKm: 15, weight: 6 },
  { name: "Valencia", country: "Spain", lat: 39.4699, lng: -0.3763, radiusKm: 12, weight: 4 },
  { name: "Sevilla", country: "Spain", lat: 37.3891, lng: -5.9845, radiusKm: 12, weight: 4 },
  { name: "Zaragoza", country: "Spain", lat: 41.6488, lng: -0.8891, radiusKm: 10, weight: 3 },
  { name: "Málaga", country: "Spain", lat: 36.7213, lng: -4.4214, radiusKm: 10, weight: 3 },
  { name: "Murcia", country: "Spain", lat: 37.9922, lng: -1.1307, radiusKm: 10, weight: 2 },
  { name: "Palma", country: "Spain", lat: 39.5696, lng: 2.6502, radiusKm: 10, weight: 2 },
  { name: "Las Palmas de Gran Canaria", country: "Spain", lat: 28.1236, lng: -15.4361, radiusKm: 12, weight: 2 },
  { name: "Bilbao", country: "Spain", lat: 43.2630, lng: -2.9350, radiusKm: 10, weight: 2 },
  { name: "Alicante", country: "Spain", lat: 38.3452, lng: -0.4810, radiusKm: 10, weight: 2 },
  { name: "Córdoba", country: "Spain", lat: 37.8882, lng: -4.7794, radiusKm: 10, weight: 2 },
  { name: "Valladolid", country: "Spain", lat: 41.6523, lng: -4.7245, radiusKm: 10, weight: 2 },
  { name: "Vigo", country: "Spain", lat: 42.2406, lng: -8.7207, radiusKm: 10, weight: 2 },
  { name: "Gijón", country: "Spain", lat: 43.5322, lng: -5.6611, radiusKm: 10, weight: 2 },
  { name: "A Coruña", country: "Spain", lat: 43.3623, lng: -8.4115, radiusKm: 10, weight: 2 },
  { name: "Granada", country: "Spain", lat: 37.1773, lng: -3.5986, radiusKm: 10, weight: 2 },
  { name: "Santa Cruz de Tenerife", country: "Spain", lat: 28.4636, lng: -16.2518, radiusKm: 12, weight: 2 },
  { name: "San Sebastián", country: "Spain", lat: 43.3183, lng: -1.9812, radiusKm: 10, weight: 2 },
  { name: "Santander", country: "Spain", lat: 43.4623, lng: -3.8099, radiusKm: 10, weight: 2 },
  { name: "Pamplona", country: "Spain", lat: 42.8125, lng: -1.6458, radiusKm: 10, weight: 2 },
  { name: "Salamanca", country: "Spain", lat: 40.9701, lng: -5.6635, radiusKm: 10, weight: 1 },
  { name: "Burgos", country: "Spain", lat: 42.3439, lng: -3.6969, radiusKm: 10, weight: 1 },
  { name: "Logroño", country: "Spain", lat: 42.4627, lng: -2.4450, radiusKm: 10, weight: 1 },
  { name: "Almería", country: "Spain", lat: 36.8340, lng: -2.4637, radiusKm: 10, weight: 1 },
  { name: "Cádiz", country: "Spain", lat: 36.5271, lng: -6.2886, radiusKm: 10, weight: 1 },
  { name: "León", country: "Spain", lat: 42.5987, lng: -5.5671, radiusKm: 10, weight: 1 },
  { name: "Huelva", country: "Spain", lat: 37.2614, lng: -6.9447, radiusKm: 10, weight: 1 },
  { name: "Castellón de la Plana", country: "Spain", lat: 39.9864, lng: -0.0513, radiusKm: 10, weight: 1 },
  { name: "Badajoz", country: "Spain", lat: 38.8794, lng: -6.9706, radiusKm: 10, weight: 1 },
  { name: "Albacete", country: "Spain", lat: 38.9943, lng: -1.8585, radiusKm: 10, weight: 1 },
  { name: "Tarragona", country: "Spain", lat: 41.1189, lng: 1.2445, radiusKm: 10, weight: 1 },
  { name: "Lleida", country: "Spain", lat: 41.6176, lng: 0.6200, radiusKm: 10, weight: 1 },
  { name: "Jaén", country: "Spain", lat: 37.7796, lng: -3.7849, radiusKm: 10, weight: 1 },
  { name: "Girona", country: "Spain", lat: 41.9794, lng: 2.8214, radiusKm: 10, weight: 1 },
  { name: "Toledo", country: "Spain", lat: 39.8628, lng: -4.0273, radiusKm: 10, weight: 1 },
  { name: "Elche", country: "Spain", lat: 38.2699, lng: -0.7126, radiusKm: 10, weight: 1 },
];

const JOB_TYPES = [
  { type: "IT", color: "#2563eb" },
  { type: "Sales", color: "#ea580c" },
  { type: "Logistics", color: "#0ea5e9" },
  { type: "Healthcare", color: "#16a34a" },
  { type: "Education", color: "#7c3aed" },
  { type: "Finance", color: "#059669" },
  { type: "Hospitality", color: "#d97706" },
  { type: "Construction", color: "#7c2d12" },
  { type: "Design", color: "#db2777" },
  { type: "Other", color: "#6b7280" },
];

const EMPLOYMENTS = ["full-time", "part-time", "contract", "internship"];
const COMPANIES = [
  "IberiaTech","MadridWorks","Catalyst BCN","ValenJobs","SevillaCare",
  "Zeta Logistics","Costa Finance","Basque Bytes","Tenerife Health",
  "Castilla Design","Andalucia Build","Cantabria Foods","Galicia Edu",
];
const TITLES = {
  IT: ["Frontend Developer","Backend Developer","Fullstack Engineer","DevOps Engineer","Data Analyst"],
  Sales: ["Account Manager","Sales Representative","Business Developer"],
  Logistics: ["Operations Coordinator","Warehouse Manager","Fleet Dispatcher"],
  Healthcare: ["Registered Nurse","Physician Assistant","Caregiver"],
  Education: ["Teacher","Instructor","Teaching Assistant"],
  Finance: ["Financial Analyst","Accountant","Risk Specialist"],
  Hospitality: ["Receptionist","Chef","Waiter/Waitress"],
  Construction: ["Site Engineer","Electrician","Plumber"],
  Design: ["Graphic Designer","Product Designer","UX/UI Designer"],
  Other: ["Office Assistant","Customer Support","HR Generalist"],
};

// ---------- CLI ----------
function parseCLI() {
  const args = process.argv.slice(2);
  const get = (flag, dflt) => {
    const i = args.indexOf(flag);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : dflt;
  };
  return {
    count: Number(get("--count", "50000")),
    seed: get("--seed") ? Number(get("--seed")) : undefined,
    outfile: get("--outfile", "jobs-spain.geojson"),
  };
}

// ---------- RNG ----------
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const { seed } = parseCLI();
const rand = seed != null ? mulberry32(seed) : Math.random;

// ---------- Geo ----------
const EARTH_RADIUS_KM = 6371;
const rnd = (min, max) => min + (max - min) * rand();

function randomPointAround(lat, lng, radiusKm) {
  const r = radiusKm * Math.sqrt(rand());
  const bearing = rnd(0, 2 * Math.PI);
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const angDist = r / EARTH_RADIUS_KM;

  const sinLat = Math.sin(latRad), cosLat = Math.cos(latRad);
  const sinLat2 = sinLat * Math.cos(angDist) + cosLat * Math.sin(angDist) * Math.cos(bearing);
  const lat2 = Math.asin(sinLat2);
  const y = Math.sin(bearing) * Math.sin(angDist) * cosLat;
  const x = Math.cos(angDist) - sinLat * sinLat2;
  const lng2 = lngRad + Math.atan2(y, x);
  return { lat: (lat2 * 180) / Math.PI, lng: ((lng2 * 180) / Math.PI + 540) % 360 - 180 };
}

function pickCity() {
  const total = CITIES.reduce((s, c) => s + c.weight, 0);
  let r = rnd(0, total);
  for (const c of CITIES) {
    if ((r -= c.weight) <= 0) return c;
  }
  return CITIES[0];
}

// ---------- Fake data ----------
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
function randomSalaryEUR(type) {
  const base = {
    IT: [28000, 70000],
    Sales: [22000, 45000],
    Logistics: [20000, 38000],
    Healthcare: [24000, 50000],
    Education: [20000, 36000],
    Finance: [26000, 60000],
    Hospitality: [18000, 30000],
    Construction: [20000, 38000],
    Design: [22000, 42000],
    Other: [18000, 32000],
  };
  const [min, max] = base[type] || [20000, 40000];
  return Math.round(rnd(min, max) / 100) * 100;
}
function randomDateISO(daysBack = 90) {
  const now = Date.now();
  const past = now - Math.floor(rand() * daysBack * 86400_000);
  return new Date(past).toISOString();
}
function imageUrl(id, type) {
  return `https://picsum.photos/seed/${encodeURIComponent(type + "-" + id)}/200/200`;
}

// ---------- Генератор ----------
function generate(n) {
  const features = new Array(n);
  for (let i = 0; i < n; i++) {
    const city = pickCity();
    const { lat, lng } = randomPointAround(city.lat, city.lng, city.radiusKm);
    const jt = pick(JOB_TYPES);
    const id = `${i}-${Math.floor(rand() * 1e9)}`;
    const title = pick(TITLES[jt.type] ?? TITLES.Other);
    const company = pick(COMPANIES);
    const employment = pick(EMPLOYMENTS);
    const salaryEUR = randomSalaryEUR(jt.type);
    const postedAt = randomDateISO();

    features[i] = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: {
        id,
        type: jt.type,
        typeColor: jt.color,
        title,
        company,
        employment,
        salaryEUR,
        image: imageUrl(id, jt.type),
        city: city.name,
        country: city.country,
        postedAt,
      },
    };
  }
  return { type: "FeatureCollection", features };
}

// ---------- Main ----------
(function main() {
  const { count, outfile } = parseCLI();
  console.time(`Generated ${count} features`);
  const fc = generate(count);
  console.timeEnd(`Generated ${count} features`);

  const outPath = path.resolve(process.cwd(), outfile);
  fs.writeFileSync(outPath, JSON.stringify(fc));
  console.log(`Saved: ${outPath}`);
})();
