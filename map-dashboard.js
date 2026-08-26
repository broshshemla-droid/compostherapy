// Fixed coordinates for demo purposes – later can be joined with address data.
const BASE_COORDS = [32.2285, 34.9814]; // Tzur Yigal, Israel

// Google Sheets CSV URL (export format) via cors-anywhere proxy
// Note: you may need to visit https://cors-anywhere.herokuapp.com/corsdemo
// to enable temporary access.
const DEFAULT_SHEET_CSV_URL =
  "https://cors-anywhere.herokuapp.com/https://docs.google.com/spreadsheets/d/1L21iZ5TVPOg29OHSR9pmDQq80FV6W46_wmJBZdoeJV8/export?format=csv&gid=0";

/**
 * Return a CSV URL from runtime config if provided.
 * You can override in `index.html` via: window.COMPOST_CSV_URL = "..."
 */
function getCsvUrl() {
  if (typeof window !== "undefined" && typeof window.COMPOST_CSV_URL === "string") {
    return window.COMPOST_CSV_URL;
  }
  return DEFAULT_SHEET_CSV_URL;
}

/**
 * Fetch CSV text from the configured URL.
 * Default uses cors-anywhere proxy for local CORS friendliness.
 */
async function fetchCsvTextWithFallback(csvUrl) {
  const response = await fetch(csvUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${csvUrl}`);
  }
  return await response.text();
}

/**
 * Very small CSV parser assuming:
 * - First row is header.
 * - Separator is comma.
 * - No embedded newlines in cells.
 */
function parseCsvToObjects(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const headers = lines[0].split(",").map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = (values[index] || "").trim();
    });
    return obj;
  });
}

/**
 * Convert Google Drive sharing/view links to Direct Link format for image embedding.
 * Supports: /file/d/ID/view, /open?id=ID, and already-direct /uc?id=ID.
 */
function toGoogleDriveDirectLink(url) {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return "";

  // Already direct link
  const ucMatch = trimmed.match(/drive\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)/);
  if (ucMatch) return trimmed;

  // /file/d/ID/view or /file/d/ID/
  const fileMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return `https://drive.google.com/uc?id=${fileMatch[1]}`;

  // /open?id=ID
  const openMatch = trimmed.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (openMatch) return `https://drive.google.com/uc?id=${openMatch[1]}`;

  // Fallback: return as-is (might be another CDN or direct URL)
  return trimmed;
}

/**
 * Normalize phone string to digits only for use in wa.me and tel: links.
 */
function normalizePhone(phoneRaw) {
  if (!phoneRaw) return "";
  const digits = phoneRaw.replace(/\D/g, "");
  return digits;
}

/**
 * Return a Leaflet-compatible color name for a given status code.
 * Status A = green, B = yellow (gold), C = red.
 */
function getStatusColor(status) {
  switch (status) {
    case "A":
      return "green";
    case "B":
      return "gold";
    case "C":
      return "red";
    default:
      return "gray";
  }
}

/**
 * Normalize status for display and markers — only A, B, or C.
 */
function normalizeStatus(statusRaw) {
  const s = String(statusRaw || "").toUpperCase().trim();
  if (s === "A" || s === "B" || s === "C") return s;
  for (const char of s) {
    if (char === "A" || char === "B" || char === "C") return char;
  }
  return "";
}

/**
 * Parse a 1–5 scale value from CSV data; clamp to range or return null.
 */
function parseScaleValue(raw) {
  const v = String(raw ?? "").trim();
  if (!v || v === "-") return null;
  const num = parseInt(v.replace(/[^\d-]/g, ""), 10);
  if (!Number.isFinite(num)) return null;
  return Math.min(5, Math.max(1, num));
}

/**
 * Render a compact 1–5 scale progress bar with endpoint labels for popup use.
 */
function renderScaleBar(fieldLabel, rawValue, minLabel, maxLabel) {
  const value = parseScaleValue(rawValue);
  const fillPercent = value != null ? (value / 5) * 100 : 0;

  if (value == null) {
    return [
      `<div style="margin-top: 8px;">`,
      `<div style="font-size: 0.85rem;"><strong>${fieldLabel}:</strong> <span style="color: #94a3b8;">-</span></div>`,
      `</div>`
    ].join("");
  }

  return [
    `<div style="margin-top: 8px;">`,
    `<div style="font-size: 0.85rem; margin-bottom: 3px;"><strong>${fieldLabel}:</strong></div>`,
    `<div style="direction: ltr; height: 6px; background: #e5e7eb; border-radius: 9999px; overflow: hidden;">`,
    `<div style="height: 100%; width: ${fillPercent}%; background: #64748b; border-radius: 9999px;"></div>`,
    `</div>`,
    `<div style="direction: ltr; display: flex; justify-content: space-between; margin-top: 2px; font-size: 0.65rem; color: #94a3b8;">`,
    `<span>${minLabel}</span>`,
    `<span>${maxLabel}</span>`,
    `</div>`,
    `</div>`
  ].join("");
}

/**
 * Return Tailwind bar color class for volume percent (0–70 green, 70–90 orange, >90 red).
 */
function getVolumeBarColor(percent) {
  const p = Number(percent);
  if (!Number.isFinite(p)) return "bg-gray-400";
  if (p > 90) return "bg-red-500";
  if (p >= 70) return "bg-orange-500";
  return "bg-emerald-500";
}

/**
 * Return composter type label from size in liters (e.g. "Large 600L", "Standard 330L").
 */
function getComposterTypeLabel(sizeLiters) {
  const size = parseFloat(String(sizeLiters).replace(",", "."));
  if (!Number.isFinite(size)) return "—";
  if (size >= 500) return `Large ${Math.round(size)}L`;
  if (size >= 200) return `Standard ${Math.round(size)}L`;
  return `Small ${Math.round(size)}L`;
}

/**
 * Create a circle marker style based on status.
 * Using circles instead of default pins to have full control on colors.
 */
function createStatusMarker(lat, lng, status, needsCarbon) {
  const statusColor = getStatusColor(status);
  const strokeColor = needsCarbon ? "#2563eb" : statusColor;
  const weight = needsCarbon ? 3.5 : 2;

  return L.circleMarker([lat, lng], {
    radius: 10,
    color: strokeColor,
    weight,
    opacity: 0.9,
    fillColor: statusColor,
    fillOpacity: 0.6
  });
}

/**
 * Smoothly animate a numeric stat value in a DOM element.
 */
function animateStatNumber(elementId, targetValue) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const parsedTarget = Number.isFinite(targetValue)
    ? targetValue
    : parseFloat(String(targetValue).replace(",", "."));
  const finalValue = Number.isFinite(parsedTarget) ? parsedTarget : 0;

  const currentText = el.textContent.trim().replace(",", ".");
  const currentParsed = parseFloat(currentText);
  const startValue = Number.isFinite(currentParsed) ? currentParsed : 0;

  const duration = 400;
  const startTime = performance.now();

  function frame(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOut
    const value = startValue + (finalValue - startValue) * eased;
    el.textContent = value.toFixed(1).replace(".", ".");
    if (t < 1) {
      requestAnimationFrame(frame);
    }
  }

  requestAnimationFrame(frame);
}

/**
 * Initialize the Leaflet map, load CSV data, add markers + legend.
 */
async function initMapDashboard() {
  const map = L.map("map").setView(BASE_COORDS, 15);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  // Load data from Google Sheets CSV
  let rows = [];
  try {
    // Option A: inline injection to avoid any CORS/network issues:
    // In index.html, set: window.COMPOST_CSV_TEXT = `header1,header2\n...`
    if (typeof window !== "undefined" && typeof window.COMPOST_CSV_TEXT === "string") {
      rows = parseCsvToObjects(window.COMPOST_CSV_TEXT);
    } else {
      const csvUrl = getCsvUrl();
      const csvText = await fetchCsvTextWithFallback(csvUrl);
      rows = parseCsvToObjects(csvText);
    }
  } catch (error) {
    // If loading fails, keep the map centered on base coords.
    console.error("Failed to load CSV data", error);
  }

  const bounds = [];
  let sitesActive = 0;
  let totalKitchen = 0;
  let totalGarden = 0;

  /*
   * 📝 הוראת Vibe Coding: מבנה Popup עם מיפוי עמודות Excel (ארבעת הרבעים 2x2)
   * ─────────────────────────────────────────────────────────────────────────
   * הגדרות כלליות: display: grid עם 2 עמודות ו-2 שורות. יישור RTL. מינימום רוחב 400px.
   * שדה ריק ב-Excel: הצג '-' או '0' (למספרים) כברירת מחדל.
   *
   * רבע 1 – ימין עליון: מקור image_url. תמונה פורטרט גובה מלא, object-fit: cover.
   *   המרת קישורי Google Drive ל-Direct Link (toGoogleDriveDirectLink).
   *
   * רבע 2 – שמאל עליון: "פרטי עמדה".
   *   composter_name, Mobile phone, serial_number, location_description, initiation, composter_type.
   *
   * רבע 3 – ימין תחתון: "מדדי אימפקט".
   *   kitchen_waste_kg, garden_waste_kg, total_savings_kg, compost_produced.
   *
   * רבע 4 – שמאל תחתון: "בריאות ותחזוקה".
   *   status (A/B/C בלבד); temperature, moisture, volume — סרגלי 1–5 עם תוויות קצה.
   *
   * אלמנטים ויזואליים: קו הפרדה אנכי בין ימין לשמאל; קו אופקי בין עליון לתחתון.
   */

  rows.forEach((row) => {
    const lat = parseFloat(row.lat);
    const lng = parseFloat(row.long || row.lng || row.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    const empty = (v) => (v == null || String(v).trim() === "" ? "-" : String(v).trim());
    const emptyNum = (v) => (v == null || String(v).trim() === "" ? "0" : String(v).trim());

    const status = normalizeStatus(row.status);
    const imageUrlRaw = row.image_url || "";
    const imageUrl = imageUrlRaw ? toGoogleDriveDirectLink(imageUrlRaw) : "";

    // רבע 2 – פרטי עמדה (עמודת Excel: "Mobile phone")
    const composterName = empty(row.composter_name);
    const mobilePhone = empty(
      row["Mobile phone"] != null && row["Mobile phone"] !== ""
        ? row["Mobile phone"]
        : row.mobile_phone
    );
    const serialNumber = empty(row.serial_number);
    const locationDescription = empty(row.location_description);
    const initiation = empty(row.initiation);
    const composterType = empty(row.composter_type);

    // רבע 3 – מדדי אימפקט
    const kitchenWaste = emptyNum(row.kitchen_waste_kg);
    const gardenWaste = emptyNum(row.garden_waste_kg);
    const totalSavingsKg = emptyNum(row.total_savings_kg || row.total_saved_kg);
    const compostProduced = emptyNum(row.compost_produced);

    // רבע 4 – בריאות ותחזוקה
    const statusDisplay = status || "-";

    const phoneRaw = row["Mobile phone"] || row.mobile_phone || row.phone || "";
    const phoneDigits = normalizePhone(phoneRaw);

    const needsCarbon = String(row["need more Carbon"] || "").trim() === "כן";
    const marker = createStatusMarker(lat, lng, status, needsCarbon);

    const whatsappHref = phoneDigits ? `https://wa.me/${phoneDigits}` : null;
    const callHref = phoneDigits ? `tel:${phoneDigits}` : null;

    const placeholderSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5"><path d="M7 20h10"/><path d="M10 20c5.5-2.5 8-6 8-10a6 6 0 0 0-12 0c0 4 2.5 7.5 8 10z"/><circle cx="12" cy="10" r="2"/></svg>';
    const placeholderDiv =
      `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#e5e7eb;border-radius:8px;">${placeholderSvg}</div>`;
    const imageContent = imageUrl
      ? `${placeholderDiv}<img src="${imageUrl}" alt="תמונה" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:8px;" onerror="this.style.display='none'">`
      : `<div style="width:100%;height:100%;background:#e5e7eb;border-radius:8px;display:flex;align-items:center;justify-content:center;">${placeholderSvg}</div>`;

    const cellStyle = "padding: 15px; min-height: 100px;";
    const headerStyle = "font-weight: 700; margin-bottom: 6px; font-size: 0.85rem;";
    const lineStyle = "margin-top: 4px; font-size: 0.85rem;";

    // רבע 1 – ימין עליון: תמונה פורטרט (רוחב קבוע 150px)
    const q1 = [
      `<div style="${cellStyle} border-left: 1px solid #e5e7eb; display: flex; align-items: stretch; width: 150px; box-sizing: border-box;">`,
      `<div style="position:relative; width:100%; min-height: 180px; border-radius: 8px; overflow: hidden;">`,
      imageContent,
      `</div>`,
      `</div>`
    ].join("");

    // רבע 2 – שמאל עליון: פרטי עמדה
    const q2 = [
      `<div style="${cellStyle} min-width: 0;">`,
      `<div style="${headerStyle}">פרטי עמדה</div>`,
      `<div style="${lineStyle}"><strong>שם הקומפוסטר:</strong> ${composterName}</div>`,
      `<div style="${lineStyle}"><strong>מספר נייד:</strong> ${mobilePhone}</div>`,
      `<div style="${lineStyle}"><strong>מספר סידורי:</strong> ${serialNumber}</div>`,
      `<div style="${lineStyle}"><strong>מיקום:</strong> ${locationDescription}</div>`,
      `<div style="${lineStyle}"><strong>תאריך הקמה:</strong> ${initiation}</div>`,
      `<div style="${lineStyle}"><strong>סוג הקומפוסטר:</strong> ${composterType}</div>`,
      `</div>`
    ].join("");

    // רבע 3 – ימין תחתון: מדדי אימפקט (רוחב 150px, קווי הפרדה נפגשים במרכז)
    const q3 = [
      `<div style="${cellStyle} border-top: 1px solid #e5e7eb; border-left: 1px solid #e5e7eb; background: #f9fafb; width: 150px; box-sizing: border-box;">`,
      `<div style="${headerStyle}">מדדי אימפקט</div>`,
      `<div style="${lineStyle}"><strong>פסולת מטבח:</strong> ${kitchenWaste} ק"ג</div>`,
      `<div style="${lineStyle}"><strong>פסולת גינה:</strong> ${gardenWaste} ק"ג</div>`,
      `<div style="${lineStyle}"><strong>סך הכל חיסכון:</strong> ${totalSavingsKg} ק"ג</div>`,
      `<div style="${lineStyle}"><strong>קומפוסט שנוצר:</strong> ${compostProduced} ק"ג</div>`,
      phoneRaw ? `<div style="${lineStyle} margin-top: 8px;"><strong>טלפון:</strong> ${phoneRaw}</div>` : "",
      `<div style="margin-top: 8px; display: flex; gap: 6px; justify-content: flex-start; flex-direction: row-reverse;">`,
      whatsappHref ? `<a href="${whatsappHref}" target="_blank" rel="noopener noreferrer" class="px-2 py-1 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium">וואטסאפ</a>` : "",
      callHref ? `<a href="${callHref}" class="px-2 py-1 rounded-md bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium">שיחה</a>` : "",
      `</div>`,
      `</div>`
    ].join("");

    // רבע 4 – שמאל תחתון: בריאות ותחזוקה
    const q4 = [
      `<div style="${cellStyle} border-top: 1px solid #e5e7eb; background: #f9fafb; min-width: 0;">`,
      `<div style="${headerStyle}">בריאות ותחזוקה</div>`,
      `<div style="${lineStyle}"><strong>סטטוס:</strong> ${statusDisplay}</div>`,
      renderScaleBar("טמפרטורה", row.temperature, "קר", "חם"),
      renderScaleBar("לחות", row.moisture, "יבש", "רטוב"),
      renderScaleBar("נפח", row.volume, "ריק", "מלא"),
      `</div>`
    ].join("");

    const popupHtmlParts = [
      `<div style="direction: rtl; text-align: right; font-size: 0.9rem; width: 400px; padding: 0; box-sizing: border-box;" dir="rtl">`,
      `<div style="display: grid; grid-template-columns: 150px 1fr; grid-template-rows: auto auto; gap: 0;">`,
      q1,
      q2,
      q3,
      q4,
      `</div>`,
      `</div>`
    ].join("");

    marker.bindPopup(popupHtmlParts, { maxWidth: 400 });
    marker.addTo(map);
    bounds.push([lat, lng]);

    sitesActive += 1;
    const kitchenNum = parseFloat(String(kitchenWaste).replace(",", "."));
    const gardenNum = parseFloat(String(gardenWaste).replace(",", "."));
    if (Number.isFinite(kitchenNum) && kitchenWaste !== "-") totalKitchen += kitchenNum;
    if (Number.isFinite(gardenNum) && gardenWaste !== "-") totalGarden += gardenNum;
  });

  // Update stats header numbers
  animateStatNumber("stats-sites-active", sitesActive);
  animateStatNumber("stats-kitchen-total", totalKitchen);
  animateStatNumber("stats-garden-total", totalGarden);

  // Fit map to all markers if we have any; otherwise keep default center/zoom.
  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [40, 40] });
  }

  // Simple legend control in the bottom-right corner.
  const legend = L.control({ position: "bottomright" });

  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "legend");
    div.setAttribute("dir", "rtl");
    div.style.direction = "rtl";
    div.style.textAlign = "right";
    div.innerHTML = `
      <div class="legend-item">
        <span class="legend-color" style="background-color: green;"></span>
        <span>Status A – תקין / ירוק</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background-color: gold;"></span>
        <span>Status B – במעקב-דורש טיפול / צהוב</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background-color: red;"></span>
        <span>Status C – בעיה / אדום</span>
      </div>
      <div class="legend-item" style="margin-top: 0.5rem; border-top: 1px solid #e2e8f0; padding-top: 0.5rem;">
        <span class="legend-color" style="background-color: transparent; border: 2.5px solid #2563eb; box-sizing: border-box;"></span>
        <span>מסגרת כחולה – מעוניין בעוד עלים (פחמן)</span>
      </div>
    `;
    return div;
  };

  legend.addTo(map);
}

document.addEventListener("DOMContentLoaded", initMapDashboard);

