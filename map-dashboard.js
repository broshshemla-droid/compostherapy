/**
 * קומפוסתרפיה - צור יגאל כוכב יאיר (V2 PWA + Supabase Auth + Role Isolation)
 * Mobile-First RTL Community Composting Management & Monitoring App
 */

const SUPABASE_PROJECT_URL = "https://ffuwqwjtjmesfydlgjlx.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmdXdxd2p0am1lc2Z5ZGxnamx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ5MzAyNjQsImV4cCI6MjExMDUwNjI2NH0.Y4VTTThkp3Z00rcpWlN-AmBLFcgJrfSCb51GsfJ1fO4";

// Initialize official @supabase/supabase-js v2 client
if (!window.supabase || typeof window.supabase.createClient !== "function") {
  throw new Error("Supabase JS SDK v2 failed to load from CDN.");
}

const supabase = window.supabase.createClient(SUPABASE_PROJECT_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

const BASE_COORDS = [32.2225, 34.9915]; // Tzur Yigal - Kochav Yair center

// Geofence bounds for Kochav Yair - Tzur Yigal
const GEOFENCE_BOUNDS = {
  minLat: 32.2100,
  maxLat: 32.2450,
  minLng: 34.9750,
  maxLng: 35.0150
};

function isWithinGeofence(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= GEOFENCE_BOUNDS.minLat &&
    lat <= GEOFENCE_BOUNDS.maxLat &&
    lng >= GEOFENCE_BOUNDS.minLng &&
    lng <= GEOFENCE_BOUNDS.maxLng
  );
}

const DROP_EXPIRY_HOURS = 48;
const DROP_EXPIRY_MS = DROP_EXPIRY_HOURS * 60 * 60 * 1000;

const ZONE_COLORS = {
  Sunday: "#16a34a",
  Monday: "#2563eb",
  Tuesday: "#ea580c",
  Wednesday: "#7c3aed",
  Thursday: "#dc2626"
};

const HEBREW_DAYS = {
  Sunday: "יום א'",
  Monday: "יום ב'",
  Tuesday: "יום ג'",
  Wednesday: "יום ד'",
  Thursday: "יום ה'"
};

// 10-Tier Recycling Trustees Rank Ladder (Ascending 1 -> 10)
const RANK_LADDER = [
  { level: 1, min: 0, title: "♻️ נאמן מיחזור", nextAt: 5 },
  { level: 2, min: 5, title: "🌱 שומר הניצן", nextAt: 12 },
  { level: 3, min: 12, title: "🌲 סייר היער", nextAt: 20 },
  { level: 4, min: 20, title: "🛡️ אביר האדמה", nextAt: 32 },
  { level: 5, min: 32, title: "♻️ לורד המחזוריות", nextAt: 45 },
  { level: 6, min: 45, title: "🌿 ברון הירוק", nextAt: 60 },
  { level: 7, min: 60, title: "🌍 דוכס האקולוגיה", nextAt: 75 },
  { level: 8, min: 75, title: "⚜️ נסיך הקיימות", nextAt: 95 },
  { level: 9, min: 95, title: "🏛️ קיסר הטבע", nextAt: 120 },
  { level: 10, min: 120, title: "👑 מלך מיחזור", nextAt: null }
];

const MATERIAL_META = {
  leaves: {
    label: "ערימת עלים",
    emoji: "🍂",
    badgeClass: "bg-amber-100 text-amber-900 border-amber-300",
    hex: "#92400e"
  },
  grass: {
    label: "דשא קצור",
    emoji: "🌿",
    badgeClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
    hex: "#15803d"
  },
  kitchen: {
    label: "פסולת מטבח",
    emoji: "🍎",
    badgeClass: "bg-orange-100 text-orange-900 border-orange-300",
    hex: "#ea580c"
  }
};

// Application State
const state = {
  // Authentication & Strict Role State
  session: null,
  authUser: null,
  currentUserProfile: null,
  isAdmin: false,
  isComposterOwner: false,
  assignedUnitId: null,

  currentMode: "trustee", // Determined strictly by authenticated user profile ('admin' | 'owner' | 'trustee')
  activeAdminView: "admin", // Strictly local in-memory state for Admin View Switcher ('admin' | 'owner' | 'trustee')
  adminShowIot: false,

  users: [],
  units: [],
  resourceDrops: [],
  activeResourceDrops: [],
  weighingLogs: [],

  // Active identity derived from authenticated profile
  selectedUnitId: null, // Strictly local in-memory variable for Admin "פועל בשם..." unit selection (never updates users table)
  ownerUnitId: null,
  ownerUserName: "",
  trusteeUserId: null,
  trusteeUserName: "",
  adminUserName: "",
  adminActAs: "", // 'unit:CO-XXXX' or 'user:ID' (only available when isAdmin === true)
  iotUnitId: "CO-0017",

  // Staged Status & Health per unit (only saved when clicking "עדכן סטטוס ובריאות")
  stagedHealthUnitId: null,
  stagedStatus: null,
  stagedTemp: null,
  stagedMoisture: null,
  stagedVolume: null,
  stagedDirty: false,

  // Trustee multi-select filters
  trusteeFilters: new Set(["kitchen", "leaves", "grass"]),

  // Street drops filter & sort state (Owner & Admin section 5)
  dropsFilterMaterial: "all", // 'all' | 'leaves' | 'grass' | 'kitchen'
  dropsSortBy: "distance",    // 'distance' | 'expiry' | 'rank' | 'material'

  // User GPS coordinates
  userGps: {
    lat: 32.2238,
    lng: 34.9924,
    accuracy: 15,
    detected: false
  },

  // Leaflet references
  map: null,
  markersLayer: null,
  zonesLayer: null,
  gpsMarker: null,
  legendControl: null,
  pollTimer: null,

  // Report Modal Mini-Map & Draggable Pin
  reportMiniMap: null,
  reportPinMarker: null,
  reportPinLat: null,
  reportPinLng: null
};

// ============================================================================
// FIELD NORMALIZERS & EXPIRATION / MULTI-SELECT HELPERS
// ============================================================================

function getUnitId(u) {
  if (!u) return "";
  return String(u.unit_id || u.unit_code || u.serial_number || "").trim();
}

function getUnitLat(u) {
  return parseFloat(u?.lat ?? u?.latitude);
}

function getUnitLng(u) {
  return parseFloat(u?.lng ?? u?.long ?? u?.longitude ?? u?.lon);
}

function getUnitOwnerName(u) {
  if (!u) return "";
  if (u.owner_name) return u.owner_name;
  if (u.resident_name) return u.resident_name;
  if (u.composter_name) return u.composter_name;
  if (u.owner_id || u.user_id) {
    const ownerUser = state.users.find(
      (usr) => String(usr.id) === String(u.owner_id || u.user_id)
    );
    if (ownerUser) return getUserName(ownerUser);
  }
  return u.name || getUnitId(u);
}

function getUserName(usr) {
  if (!usr) return "נאמן קהילה";
  if (usr.full_name || usr.name || usr.username || usr.display_name) {
    return String(
      usr.full_name || usr.name || usr.username || usr.display_name
    ).trim();
  }
  if (usr.email) {
    return String(usr.email).split("@")[0];
  }
  return "תושב השכונה";
}

function getDropLat(d) {
  return parseFloat(d?.lat ?? d?.latitude);
}

function getDropLng(d) {
  return parseFloat(d?.lng ?? d?.long ?? d?.longitude ?? d?.lon);
}

function getDropTypes(d) {
  const raw =
    d?.material_type ?? d?.drop_type ?? d?.resource_type ?? d?.type ?? d?.category ?? ["leaves"];

  let items = [];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      items = trimmed
        .slice(1, -1)
        .split(",")
        .map((s) => s.replace(/^"+|"+$/g, "").trim())
        .filter(Boolean);
    } else if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        items = Array.isArray(parsed) ? parsed : [trimmed];
      } catch {
        items = trimmed.split(",");
      }
    } else if (trimmed.includes(",")) {
      items = trimmed.split(",");
    } else {
      items = [trimmed];
    }
  }

  const normalized = [];
  items.forEach((item) => {
    const s = String(item || "").toLowerCase().trim();
    if (!s) return;
    if (s.includes("grass") || s.includes("דשא") || s.includes("nitrogen")) {
      if (!normalized.includes("grass")) normalized.push("grass");
    } else if (s.includes("kitchen") || s.includes("מטבח") || s.includes("food")) {
      if (!normalized.includes("kitchen")) normalized.push("kitchen");
    } else if (s.includes("leaves") || s.includes("עלים") || s.includes("carbon")) {
      if (!normalized.includes("leaves")) normalized.push("leaves");
    }
  });

  return normalized.length > 0 ? normalized : ["leaves"];
}

function renderDropMaterialTagsHtml(d) {
  const types = getDropTypes(d);
  return types
    .map((t) => {
      const meta = MATERIAL_META[t] || MATERIAL_META.leaves;
      return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold ${meta.badgeClass}">${meta.emoji} ${meta.label}</span>`;
    })
    .join(" ");
}

function isDropActiveAndUnexpired(d) {
  const st = String(d?.status || "open").toLowerCase().trim();
  if (st !== "open" && st !== "claimed") return false;

  const nowMs = Date.now();
  if (d?.expires_at) {
    const expMs = new Date(d.expires_at).getTime();
    if (Number.isFinite(expMs)) {
      return expMs > nowMs;
    }
  }
  if (d?.created_at) {
    const createdMs = new Date(d.created_at).getTime();
    if (Number.isFinite(createdMs)) {
      return createdMs + DROP_EXPIRY_MS > nowMs;
    }
  }
  return true;
}

function getDropRemainingTimeLabel(d) {
  const nowMs = Date.now();
  let expMs = null;

  if (d?.expires_at) {
    const parsed = new Date(d.expires_at).getTime();
    if (Number.isFinite(parsed)) expMs = parsed;
  }
  if (expMs == null && d?.created_at) {
    const createdMs = new Date(d.created_at).getTime();
    if (Number.isFinite(createdMs)) expMs = createdMs + DROP_EXPIRY_MS;
  }

  if (expMs == null) {
    return `זמין לעוד ${DROP_EXPIRY_HOURS} שעות`;
  }

  const diffMs = expMs - nowMs;
  if (diffMs <= 0) {
    return "פג תוקף";
  }

  const hoursLeft = Math.ceil(diffMs / (1000 * 60 * 60));
  if (hoursLeft <= 1) {
    const minsLeft = Math.max(1, Math.ceil(diffMs / (1000 * 60)));
    return `זמין לעוד ${minsLeft} דקות`;
  }
  return `זמין לעוד ${hoursLeft} שעות`;
}

function getDropReporterId(d) {
  return (
    d?.reported_by_user_id ??
    d?.reporter_id ??
    d?.user_id ??
    d?.reported_by ??
    d?.created_by ??
    null
  );
}

function getDropReporterUser(d) {
  const repId = getDropReporterId(d);
  if (repId != null) {
    const found = state.users.find(
      (u) =>
        String(u.id || "") === String(repId) ||
        String(u.user_id || "") === String(repId) ||
        String(u.auth_user_id || "") === String(repId)
    );
    if (found) return found;
  }
  if (d?.reporter_name) {
    const byName = state.users.find((u) => getUserName(u) === d.reporter_name);
    if (byName) return byName;
  }
  return null;
}

function normalizeStatus(statusRaw) {
  const s = String(statusRaw || "A").toUpperCase().trim();
  if (s.includes("B")) return "B";
  if (s.includes("C")) return "C";
  return "A";
}

function getStatusColorHex(status) {
  switch (normalizeStatus(status)) {
    case "A":
      return "#16a34a";
    case "B":
      return "#eab308";
    case "C":
      return "#dc2626";
    default:
      return "#64748b";
  }
}

function toGoogleDriveDirectLink(url) {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  const ucMatch = trimmed.match(/drive\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)/);
  if (ucMatch) return trimmed;
  const fileMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return `https://drive.google.com/uc?id=${fileMatch[1]}`;
  const openMatch = trimmed.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (openMatch) return `https://drive.google.com/uc?id=${openMatch[1]}`;
  return trimmed;
}

function calcDistanceMeters(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const R = 6371e3;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function formatDistance(meters) {
  if (meters == null) return "";
  if (meters < 1000) return `${meters} מ' ממך`;
  return `${(meters / 1000).toFixed(1)} ק"מ ממך`;
}

function computeRankInfo(approvedCount, explicitRankTitle) {
  const count = Number(approvedCount) || 0;
  let currentTier = RANK_LADDER[0];
  for (const tier of RANK_LADDER) {
    if (count >= tier.min) currentTier = tier;
  }
  const rankTitle = explicitRankTitle || currentTier.title;
  const nextAt = currentTier.nextAt;
  const prevMin = currentTier.min;
  const isMaxRank = nextAt == null;
  const progressPct = isMaxRank
    ? 100
    : Math.min(
      100,
      Math.max(8, Math.round(((count - prevMin) / Math.max(1, nextAt - prevMin)) * 100))
    );
  return {
    level: currentTier.level,
    rankTitle,
    approvedCount: count,
    nextAt,
    isMaxRank,
    remaining: isMaxRank ? 0 : Math.max(0, nextAt - count),
    progressPct
  };
}

function showToast(message, isError = false) {
  const toast = document.getElementById("app-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = `fixed bottom-4 left-4 z-50 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xl border transition ${isError
    ? "bg-red-700 border-red-500"
    : "bg-slate-900 border-slate-700"
    }`;
  toast.classList.remove("hidden");
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 3200);
}

// ============================================================================
// AUTHENTICATION FLOW & STRICT ROLE ROUTING
// ============================================================================

function showAuthGateScreen() {
  const gate = document.getElementById("auth-gate-screen");
  const shell = document.getElementById("authenticated-app-shell");
  gate?.classList.remove("hidden");
  shell?.classList.add("hidden");

  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

function showAuthenticatedAppShell() {
  const gate = document.getElementById("auth-gate-screen");
  const shell = document.getElementById("authenticated-app-shell");
  gate?.classList.add("hidden");
  shell?.classList.remove("hidden");

  if (!state.map) {
    initMap();
  } else {
    setTimeout(() => state.map.invalidateSize(), 120);
  }

  if (!state.pollTimer) {
    state.pollTimer = setInterval(() => {
      loadAllSupabaseData(true);
    }, 12000);
  }
}

/**
 * Look up the user's profile in `users` by `auth_user_id` or `email`.
 * If the user signed up for the first time via Google OAuth or Magic Link and doesn't exist in `users`,
 * create/provision a default trustee profile (`is_admin = false`, `is_composter_owner = false`, `rank_title = "♻️ נאמן מיחזור"`).
 */
async function resolveAuthenticatedUserProfile(authUser, allUsers, allUnits) {
  if (!authUser) return null;

  const authUid = String(authUser.id || "").trim();
  const authEmail = String(authUser.email || "").toLowerCase().trim();
  const displayName =
    authUser.user_metadata?.full_name ||
    authUser.user_metadata?.name ||
    (authEmail ? authEmail.split("@")[0] : "נאמן מיחזור");

  // 1. Match by auth_user_id or id
  let profile = allUsers.find(
    (u) =>
      (u.auth_user_id && String(u.auth_user_id).trim() === authUid) ||
      (u.id && String(u.id).trim() === authUid)
  );

  // 2. Match by email (case-insensitive)
  if (!profile && authEmail) {
    profile = allUsers.find(
      (u) => u.email && String(u.email).toLowerCase().trim() === authEmail
    );
  }

  // Update missing auth_user_id / name / opening rank on existing profile (e.g. first Google OAuth sign-in)
  if (profile) {
    const syncPatch = {};
    if (!profile.auth_user_id && "auth_user_id" in profile) {
      syncPatch.auth_user_id = authUid;
    }
    if (!profile.full_name && "full_name" in profile && displayName) {
      syncPatch.full_name = displayName;
    } else if (!profile.name && "name" in profile && displayName) {
      syncPatch.name = displayName;
    }
    if (!profile.rank_title && "rank_title" in profile) {
      syncPatch.rank_title = "♻️ נאמן מיחזור";
    }
    if (Object.keys(syncPatch).length > 0) {
      Object.assign(profile, syncPatch);
      supabase.from("users").update(syncPatch).eq("id", profile.id).then(({ error }) => {
        if (error) console.error("Profile sync error:", error);
      });
    }
  }

  // 3. If new self-registered resident (not found in `users`), auto-register as Recycling Trustee
  if (!profile) {
    const sampleUser = allUsers[0] || {};
    const newProfilePayload = {};
    if ("auth_user_id" in sampleUser) newProfilePayload.auth_user_id = authUid;
    if ("email" in sampleUser || Object.keys(sampleUser).length === 0)
      newProfilePayload.email = authEmail;
    if ("full_name" in sampleUser) newProfilePayload.full_name = displayName;
    else if ("name" in sampleUser) newProfilePayload.name = displayName;
    else newProfilePayload.full_name = displayName;
    if ("is_admin" in sampleUser) newProfilePayload.is_admin = false;
    if ("is_composter_owner" in sampleUser) newProfilePayload.is_composter_owner = false;
    newProfilePayload.rank_title = "♻️ נאמן מיחזור";

    try {
      const { data: inserted, error: insertError } = await supabase
        .from("users")
        .insert(newProfilePayload)
        .select();
      if (!insertError && Array.isArray(inserted) && inserted[0]) {
        profile = inserted[0];
        state.users.push(profile);
      }
    } catch {
      // Fallback in-memory trustee profile if RLS blocks direct insert
    }

    if (!profile) {
      profile = {
        id: authUid,
        auth_user_id: authUid,
        email: authEmail,
        full_name: displayName,
        is_admin: false,
        is_composter_owner: false,
        assigned_unit_id: null,
        approved_count: 0,
        rejected_count: 0,
        rank_title: "♻️ נאמן מיחזור"
      };
    }
  }

  return profile;
}

/**
 * Determine strict role & assigned unit from `profile` in `users`:
 * - If `is_admin = true`: Full Admin screen with "פועל בשם..."
 * - If `is_composter_owner = true` (and not admin): Strictly only their `assigned_unit_id`
 * - If `is_composter_owner = false`: Strictly only "נאמן מיחזור" view
 */
function applyStrictRoleRouting(profile) {
  state.currentUserProfile = profile;

  const isAdmin = profile?.is_admin === true;

  // Check assigned unit from `assigned_unit_id` (or unit ownership in `units`)
  let assignedUnitId =
    profile?.assigned_unit_id ||
    profile?.unit_id ||
    null;

  if (!assignedUnitId && profile?.id != null) {
    const matchedUnit = state.units.find(
      (u) =>
        String(u.owner_id || u.user_id || "") === String(profile.id) ||
        (u.owner_email &&
          profile.email &&
          String(u.owner_email).toLowerCase() === String(profile.email).toLowerCase())
    );
    if (matchedUnit) {
      assignedUnitId = getUnitId(matchedUnit);
    }
  }

  const isComposterOwner =
    !isAdmin &&
    (Boolean(profile?.is_composter_owner) ||
      String(profile?.role || "").toLowerCase().includes("owner") ||
      Boolean(assignedUnitId));

  state.isAdmin = isAdmin;
  state.isComposterOwner = isComposterOwner;
  state.assignedUnitId = assignedUnitId ? String(assignedUnitId).trim() : null;

  const userName = getUserName(profile);
  const identityBadge = document.getElementById("auth-user-identity-badge");

  if (isAdmin) {
    state.adminUserName = userName;
    state.trusteeUserId = profile.id;
    state.trusteeUserName = userName;
    if (!state.activeAdminView) {
      state.activeAdminView = "admin";
    }
    populateAdminActAsSelector();
    renderAdminViewSwitcherBar();
    if (identityBadge) {
      identityBadge.textContent = `🛡️ אדמין • ${userName}`;
    }
    const trusteeNameEl = document.getElementById("trustee-authenticated-name");
    if (trusteeNameEl) {
      trusteeNameEl.textContent = `${userName}${profile.email ? " (" + profile.email + ")" : ""
        }`;
    }
    setViewMode(state.adminShowIot ? "iot" : state.activeAdminView);
  } else if (isComposterOwner) {
    // STRICT ISOLATION: Composter owner can ONLY view/manage their assigned_unit_id.
    // Never render the admin view switcher bar for non-admins.
    renderAdminViewSwitcherBar();
    state.ownerUnitId = state.assignedUnitId;
    state.ownerUserName = userName;
    state.trusteeUserId = profile.id;
    state.trusteeUserName = userName;
    if (identityBadge) {
      identityBadge.textContent = `♻️ בעל קומפוסטר • ${userName}${state.assignedUnitId ? " (" + state.assignedUnitId + ")" : ""
        }`;
    }
    setViewMode("owner");
  } else {
    // STRICT ISOLATION: Recycling Trustee (is_composter_owner = false).
    // Never render the admin view switcher bar for non-admins.
    renderAdminViewSwitcherBar();
    state.trusteeUserId = profile.id;
    state.trusteeUserName = userName;
    state.ownerUnitId = null;
    if (identityBadge) {
      identityBadge.textContent = `🌿 נאמן מיחזור • ${userName}`;
    }
    const trusteeNameEl = document.getElementById("trustee-authenticated-name");
    if (trusteeNameEl) {
      trusteeNameEl.textContent = `${userName}${profile.email ? " (" + profile.email + ")" : ""
        }`;
    }
    setViewMode("trustee");
  }
}

// ============================================================================
// DATA FETCHING & INITIALIZATION FROM SUPABASE
// ============================================================================

async function loadAllSupabaseData(silent = false) {
  if (!state.session) return;

  const badge = document.getElementById("supabase-status-badge");
  const statusText = document.getElementById("supabase-status-text");
  const statusDot = document.getElementById("supabase-status-dot");

  try {
    const nowIso = new Date().toISOString();

    const selectTable = async (table) => {
      const { data, error } = await supabase.from(table).select("*");
      if (error) {
        console.error(`Supabase select ${table} error:`, error);
        return [];
      }
      return Array.isArray(data) ? data : [];
    };

    const activeDropsPromise = supabase
      .from("active_resource_drops")
      .select("*")
      .then(async ({ data, error }) => {
        if (!error && Array.isArray(data)) return data;
        const fallback = await supabase
          .from("resource_drops")
          .select("*")
          .in("status", ["open", "claimed"])
          .gt("expires_at", nowIso);
        return !fallback.error && Array.isArray(fallback.data) ? fallback.data : null;
      })
      .catch(() => null);

    const [users, units, resourceDrops, activeDropsFromView, weighingLogs] = await Promise.all([
      selectTable("users"),
      selectTable("units"),
      selectTable("resource_drops"),
      activeDropsPromise,
      selectTable("weighing_logs")
    ]);

    state.users = Array.isArray(users) ? users : [];
    state.units = Array.isArray(units) ? units : [];
    state.resourceDrops = Array.isArray(resourceDrops) ? resourceDrops : [];
    state.weighingLogs = Array.isArray(weighingLogs) ? weighingLogs : [];

    if (Array.isArray(activeDropsFromView)) {
      state.activeResourceDrops = activeDropsFromView.filter(isDropActiveAndUnexpired);
    } else {
      state.activeResourceDrops = state.resourceDrops.filter(isDropActiveAndUnexpired);
    }

    state.units.sort((a, b) => getUnitId(a).localeCompare(getUnitId(b)));

    const sortNewestFirst = (a, b) => {
      const ta = new Date(a.created_at || 0).getTime();
      const tb = new Date(b.created_at || 0).getTime();
      return tb - ta || String(b.id).localeCompare(String(a.id));
    };
    state.resourceDrops.sort(sortNewestFirst);
    state.activeResourceDrops.sort(sortNewestFirst);

    // Resolve authenticated user's profile and enforce role routing
    const profile = await resolveAuthenticatedUserProfile(
      state.authUser,
      state.users,
      state.units
    );
    applyStrictRoleRouting(profile);

    if (badge && statusText && statusDot) {
      badge.className =
        "hidden sm:flex items-center gap-1.5 text-[0.68rem] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium";
      statusDot.className = "w-2 h-2 rounded-full bg-emerald-500 animate-pulse";
      statusText.textContent = "מחובר";
    }
  } catch (err) {
    console.error("Error syncing with Supabase:", err);
    if (badge && statusText && statusDot) {
      badge.className =
        "hidden sm:flex items-center gap-1.5 text-[0.68rem] px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 font-medium";
      statusDot.className = "w-2 h-2 rounded-full bg-red-500";
      statusText.textContent = "שגיאת סנכרון";
    }
  }
}

function populateAdminActAsSelector() {
  if (!state.isAdmin) return;
  const select = document.getElementById("admin-act-as-select");
  if (!select) return;

  const previous = state.adminActAs;
  select.innerHTML = "";

  // Strictly ONLY Composting Units (CO-0001 to CO-0018, public and private).
  // All non-owner users / recycling trustees are excluded.
  state.units.forEach((u) => {
    const uid = getUnitId(u);
    if (!uid) return;
    const opt = document.createElement("option");
    opt.value = `unit:${uid}`;
    const desc = u.location_description || getUnitOwnerName(u) || "";
    opt.textContent = `${uid} • ${desc}`;
    select.appendChild(opt);
  });

  if (previous && previous.startsWith("unit:") && [...select.options].some((o) => o.value === previous)) {
    select.value = previous;
  } else if (select.options.length > 0) {
    select.value = select.options[0].value;
    state.adminActAs = select.value;
  }

  if (state.adminActAs && state.adminActAs.startsWith("unit:")) {
    state.selectedUnitId = state.adminActAs.replace("unit:", "");
  } else if (!state.selectedUnitId && state.units.length > 0) {
    state.selectedUnitId = getUnitId(state.units[0]);
  }
}

/**
 * Dynamically render the 3-tab View Switcher inside the sticky top header ONLY if `state.isAdmin === true`.
 * If `state.isAdmin === false`, the mount container is completely emptied so the switcher is never in the DOM.
 */
function renderAdminViewSwitcherBar() {
  const mount = document.getElementById("admin-view-switcher-mount");
  if (!mount) return;

  if (state.currentUserProfile?.is_admin !== true || !state.isAdmin) {
    mount.innerHTML = "";
    return;
  }

  const activeTab = state.activeAdminView || "admin";
  const tabs = [
    { id: "admin", label: "🛡️ ניהול אדמין" },
    { id: "owner", label: "♻️ בעל קומפוסטר" },
    { id: "trustee", label: "🌱 נאמן מיחזור" }
  ];

  mount.innerHTML = `
    <nav aria-label="מעבר תצוגות אדמין" class="grid grid-cols-3 gap-1.5 pt-1 border-t border-indigo-200/70">
      ${tabs
      .map((tab) => {
        const isSelected = !state.adminShowIot && activeTab === tab.id;
        return `
            <button type="button"
              onclick="window.setAdminActiveView('${tab.id}')"
              class="py-1.5 px-2 rounded-lg text-xs font-extrabold transition border text-center truncate ${isSelected
            ? "bg-indigo-700 text-white border-indigo-700 shadow-sm"
            : "bg-white text-slate-700 border-indigo-200 hover:bg-indigo-100/60"
          }">
              ${tab.label}
            </button>
          `;
      })
      .join("")}
    </nav>
  `;
}

window.setAdminActiveView = function (viewName) {
  // Hard guard: only an authenticated admin with is_admin === true can switch views
  if (state.currentUserProfile?.is_admin !== true || !state.isAdmin) {
    return;
  }
  if (!["admin", "owner", "trustee"].includes(viewName)) {
    return;
  }
  // Strictly local in-memory state change (`activeAdminView`) — zero updates to `users` table
  state.activeAdminView = viewName;
  state.adminShowIot = false;
  const iotBtn = document.getElementById("btn-admin-toggle-iot");
  if (iotBtn) {
    iotBtn.textContent = "🛰️ טלמטריית IoT";
  }
  renderAdminViewSwitcherBar();
  setViewMode(viewName);
};

// ============================================================================
// VIEW MODE SWITCHING & STRICT ROLE ISOLATION
// ============================================================================

function setViewMode(mode) {
  // Enforce hard permission boundaries: non-admins can NEVER access 'admin' or switch views
  const isStrictlyAdmin =
    state.isAdmin === true && state.currentUserProfile?.is_admin === true;

  if (!isStrictlyAdmin) {
    if (state.isComposterOwner) {
      mode = "owner";
    } else {
      mode = "trustee";
    }
  } else if (!state.adminShowIot) {
    mode = state.activeAdminView || "admin";
  }

  state.currentMode = mode;

  const body = document.getElementById("app-body");
  const header = document.getElementById("app-header");
  const brandTitle = document.getElementById("header-brand-title");
  const contextSubbar = document.getElementById("context-subbar");
  const trusteePickerRow = document.getElementById("trustee-user-picker-row");
  const adminActAsRow = document.getElementById("admin-act-as-row");

  const viewTrustee = document.getElementById("view-trustee");
  const viewTrusteeBottom = document.getElementById("view-trustee-bottom");
  const viewOwner = document.getElementById("view-owner");
  const viewAdminKpis = document.getElementById("view-admin-kpis");
  const viewAdminBottom = document.getElementById("view-admin-bottom");
  const viewIot = document.getElementById("view-iot");
  const sharedMapSection = document.getElementById("shared-map-section");

  const trusteeCta = document.getElementById("trustee-floating-cta");
  const ownerCta = document.getElementById("owner-floating-cta");

  const defaultMapSlot = document.getElementById("default-map-slot");
  const ownerMapSlot = document.getElementById("owner-map-slot");

  // Dark mode for IoT view, light mode for others
  if (mode === "iot") {
    body.className = "bg-slate-950 text-slate-100 min-h-screen pb-16 transition-colors duration-300";
    header.className = "w-full bg-slate-900 shadow-lg border-b border-slate-800 sticky top-0 z-[1000] transition-colors duration-300";
    if (brandTitle) brandTitle.className = "text-sm md:text-lg font-extrabold text-white leading-tight truncate";
  } else {
    body.className = "bg-slate-100 text-slate-900 min-h-screen pb-16 transition-colors duration-300";
    header.className = "w-full bg-white shadow-sm border-b border-slate-200 sticky top-0 z-[1000] transition-colors duration-300";
    if (brandTitle) brandTitle.className = "text-sm md:text-lg font-extrabold text-slate-800 leading-tight truncate";
  }

  // Hide all view sections first
  [
    contextSubbar,
    trusteePickerRow,
    adminActAsRow,
    viewTrustee,
    viewTrusteeBottom,
    viewOwner,
    viewAdminKpis,
    viewAdminBottom,
    viewIot,
    sharedMapSection,
    trusteeCta,
    ownerCta
  ].forEach((el) => el && el.classList.add("hidden"));

  // Always keep the sticky Admin bar visible at the top if and only if `isStrictlyAdmin` is true
  if (isStrictlyAdmin) {
    adminActAsRow?.classList.remove("hidden");
    renderAdminViewSwitcherBar();
  }

  if (mode === "trustee") {
    if (sharedMapSection && defaultMapSlot && sharedMapSection.parentElement !== defaultMapSlot) {
      defaultMapSlot.appendChild(sharedMapSection);
    }
    contextSubbar?.classList.remove("hidden");
    trusteePickerRow?.classList.remove("hidden");
    viewTrustee?.classList.remove("hidden");
    sharedMapSection?.classList.remove("hidden");
    trusteeCta?.classList.remove("hidden");
    viewTrusteeBottom?.classList.remove("hidden");
  } else if (mode === "owner") {
    if (sharedMapSection && ownerMapSlot && sharedMapSection.parentElement !== ownerMapSlot) {
      ownerMapSlot.appendChild(sharedMapSection);
    }
    viewOwner?.classList.remove("hidden");
    sharedMapSection?.classList.remove("hidden");
    ownerCta?.classList.remove("hidden");
  } else if (mode === "admin" && isStrictlyAdmin) {
    // Pure Admin HQ view: general KPIs, full overview map of 18 units + drops, and 18-units management table
    if (sharedMapSection && defaultMapSlot && sharedMapSection.parentElement !== defaultMapSlot) {
      defaultMapSlot.appendChild(sharedMapSection);
    }
    viewAdminKpis?.classList.remove("hidden");
    sharedMapSection?.classList.remove("hidden");
    ownerCta?.classList.remove("hidden");
    viewAdminBottom?.classList.remove("hidden");
  } else if (mode === "iot" && isStrictlyAdmin) {
    viewIot?.classList.remove("hidden");
  }

  renderAll();

  if (mode !== "iot" && state.map) {
    setTimeout(() => {
      state.map.invalidateSize();
    }, 100);
  }
}

// ============================================================================
// MAP INITIALIZATION & LAYER RENDERING
// ============================================================================

function initMap() {
  const mapEl = document.getElementById("map");
  if (!mapEl || state.map) return;

  // Restrict map panning to Kochav Yair - Tzur Yigal and immediate surroundings
  const townMaxBounds = L.latLngBounds(
    [GEOFENCE_BOUNDS.minLat - 0.008, GEOFENCE_BOUNDS.minLng - 0.01],
    [GEOFENCE_BOUNDS.maxLat + 0.008, GEOFENCE_BOUNDS.maxLng + 0.01]
  );

  state.map = L.map("map", {
    zoomControl: true,
    minZoom: 13,
    maxZoom: 19,
    maxBounds: townMaxBounds,
    maxBoundsViscosity: 0.85
  }).setView(BASE_COORDS, 15);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(state.map);

  state.zonesLayer = L.layerGroup().addTo(state.map);
  state.markersLayer = L.layerGroup().addTo(state.map);

  drawWasteZones(state.zonesLayer);
  initGeolocation();
}

function initGeolocation(centerOnSuccess = false) {
  const gpsBadge = document.getElementById("gps-distance-badge");
  if (!navigator.geolocation) {
    if (gpsBadge) gpsBadge.textContent = "⚠️ הדפדפן לא תומך ב-GPS";
    return;
  }

  const applyPosition = (pos) => {
    state.userGps = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: Math.round(pos.coords.accuracy || 15),
      detected: true
    };
    if (gpsBadge) {
      gpsBadge.textContent = `📍 GPS מחובר (±${state.userGps.accuracy}מ')`;
    }
    if (centerOnSuccess && state.map) {
      state.map.setView([state.userGps.lat, state.userGps.lng], 16, { animate: true });
    }
    renderMapMarkers();
  };

  const handleGeoError = (err) => {
    if (gpsBadge) {
      if (err && err.code === 1) {
        gpsBadge.textContent = "⚠️ נדרשת הרשאת מיקום (HTTPS / הגדרות)";
      } else {
        gpsBadge.textContent = "⚠️ לא זוהה GPS (מציג מרכז יישוב)";
      }
    }
    renderMapMarkers();
  };

  if (gpsBadge && centerOnSuccess) {
    gpsBadge.textContent = "📡 מאתר מיקום...";
  }

  // First try high-accuracy GPS; on timeout/unavailable, fall back to standard accuracy (Wi-Fi/Cell)
  navigator.geolocation.getCurrentPosition(
    applyPosition,
    (err) => {
      if (err && err.code === 1) {
        handleGeoError(err);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        applyPosition,
        handleGeoError,
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
  );
}

function addMapLegend() {
  if (!state.map) return;
  const legend = L.control({ position: "bottomleft" });
  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "legend");
    div.setAttribute("dir", "rtl");
    div.innerHTML = `
      <div class="legend-item">
        <span class="legend-color" style="background-color: #16a34a;"></span>
        <span>עמדה A – תקין</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background-color: #eab308;"></span>
        <span>עמדה B – במעקב</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background-color: #dc2626;"></span>
        <span>עמדה C – בעיה</span>
      </div>
      <div class="legend-item" style="border-top: 1px solid #e2e8f0; padding-top: 3px; margin-top: 3px;">
        <span class="legend-color" style="background: transparent; border: 2.5px solid #2563eb;"></span>
        <span>מסגרת כחולה – קולט עלים (פחמן)</span>
      </div>
      <div class="legend-item">
        <span>🍂</span>
        <span>ערימת עלים (חום)</span>
      </div>
      <div class="legend-item">
        <span>🌿</span>
        <span>דשא קצור (ירוק)</span>
      </div>
    `;
    return div;
  };
  legend.addTo(state.map);
}

function drawWasteZones(targetLayer) {
  if (typeof WASTE_ZONES === "undefined" || !targetLayer) return;
  targetLayer.clearLayers();

  const DAYS_MAP = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const todayIndex = new Date().getDay();
  const todayName = DAYS_MAP[todayIndex];
  const isWeekend = todayIndex === 5 || todayIndex === 6;

  document.querySelectorAll(".active-day-label").forEach((el) => {
    el.textContent = isWeekend ? 'אין פינוי בסופ"ש' : HEBREW_DAYS[todayName] || todayName;
  });

  for (const [day, polygons] of Object.entries(WASTE_ZONES)) {
    const color = ZONE_COLORS[day] || "#64748b";
    const isActive = !isWeekend && day === todayName;
    const style = isActive
      ? { color, weight: 3.5, opacity: 0.85, fill: false }
      : { color: "#1e293b", weight: 1.5, opacity: 0.35, fill: false };

    polygons.forEach((coords) => {
      const poly = L.polygon(coords, style);
      poly.bindTooltip(
        `מתחם הוצאת גזם: ${HEBREW_DAYS[day]}${isActive ? " (פעיל היום!)" : ""}`,
        { sticky: true, direction: "top" }
      );
      poly.addTo(targetLayer);
    });
  }
}

/**
 * Determine which units should be displayed on the map:
 * - If Admin: all 18 units
 * - If Composter Owner (not Admin): strictly ONLY their `assigned_unit_id`!
 * - If Recycling Trustee: units open for the selected material filters
 */
function getVisibleUnitsForCurrentRole() {
  if (state.isAdmin) {
    if (state.currentMode === "trustee") {
      return getFilteredUnitsForTrustee();
    }
    if (state.currentMode === "owner") {
      const targetUnitId = getActiveManagedUnitId();
      return state.units.filter((u) => getUnitId(u) === targetUnitId);
    }
    return state.units;
  }
  if (state.isComposterOwner) {
    if (!state.assignedUnitId) return [];
    return state.units.filter((u) => getUnitId(u) === state.assignedUnitId);
  }
  return getFilteredUnitsForTrustee();
}

function renderMapMarkers() {
  if (!state.map || !state.markersLayer) return;
  state.markersLayer.clearLayers();

  const mode = state.currentMode;
  if (mode === "iot") return;

  // 1. User GPS / Report Location Marker (Draggable so user can adjust manually on map)
  const gpsIcon = L.divIcon({
    className: "",
    html: `<div class="gps-pulse" title="המיקום הנוכחי שלי (ניתן לגרור)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
  const gpsMarker = L.marker([state.userGps.lat, state.userGps.lng], {
    icon: gpsIcon,
    draggable: true,
    zIndexOffset: 900
  });
  gpsMarker.on("dragend", (ev) => {
    const pos = ev.target.getLatLng();
    state.userGps.lat = Number(pos.lat.toFixed(6));
    state.userGps.lng = Number(pos.lng.toFixed(6));
    state.reportPinLat = state.userGps.lat;
    state.reportPinLng = state.userGps.lng;
    const gpsBadge = document.getElementById("gps-distance-badge");
    if (gpsBadge) gpsBadge.textContent = "📌 מיקום סומן ידנית במפה";
    const coordsEl = document.getElementById("report-dialog-coords");
    if (coordsEl) {
      coordsEl.textContent = `${state.userGps.lat.toFixed(5)}, ${state.userGps.lng.toFixed(5)}`;
    }
  });
  gpsMarker.bindPopup(
    `<div class="text-xs font-bold text-slate-800">📍 המיקום שלי (ניתן לגרור ידנית לדיוק)</div>`
  );
  gpsMarker.addTo(state.markersLayer);

  // 2. Render Compost Units according to strict role permissions
  const unitsToShow = getVisibleUnitsForCurrentRole();

  unitsToShow.forEach((unit) => {
    const lat = getUnitLat(unit);
    const lng = getUnitLng(unit);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const uid = getUnitId(unit);
    const status = normalizeStatus(unit.status);
    const fillColor = getStatusColorHex(status);
    const acceptsCarbon = Boolean(unit.accepting_carbon);
    const isOwnerActiveUnit = uid === getActiveManagedUnitId();

    const marker = L.circleMarker([lat, lng], {
      radius: isOwnerActiveUnit ? 12 : 9.5,
      color: acceptsCarbon ? "#2563eb" : fillColor,
      weight: acceptsCarbon ? 3.5 : 2,
      opacity: 0.95,
      fillColor,
      fillOpacity: 0.72
    });

    const distMeters = calcDistanceMeters(
      state.userGps.lat,
      state.userGps.lng,
      lat,
      lng
    );

    const popupHtml = buildUnitPopupHtml(unit, distMeters, mode);
    marker.bindPopup(popupHtml, { maxWidth: 320 });
    marker.addTo(state.markersLayer);
  });

  // 3. Render Street Resource Drops from `active_resource_drops` (24h expiry, status open/claimed)
  const activeDrops = state.activeResourceDrops.filter((d) => {
    if (!isDropActiveAndUnexpired(d)) return false;
    const mTypes = getDropTypes(d);
    if (mode === "trustee") {
      return mTypes.some((t) => state.trusteeFilters.has(t));
    }
    if (state.dropsFilterMaterial && state.dropsFilterMaterial !== "all") {
      return mTypes.includes(state.dropsFilterMaterial);
    }
    return true;
  });

  activeDrops.forEach((drop) => {
    const lat = getDropLat(drop);
    const lng = getDropLng(drop);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const mTypes = getDropTypes(drop);
    const primaryType = mTypes[0] || "leaves";
    const meta = MATERIAL_META[primaryType] || MATERIAL_META.leaves;
    const isClaimed = String(drop.status || "").toLowerCase() === "claimed";

    const multiCountBadge =
      mTypes.length > 1
        ? `<span style="position:absolute;bottom:-6px;left:-6px;background:#0f172a;color:#fff;font-size:9px;font-weight:800;padding:0px 4px;border-radius:9999px;border:1px solid #fff;">+${mTypes.length - 1}</span>`
        : "";

    const claimedBadge = isClaimed
      ? `<span style="position:absolute;top:-7px;right:-10px;background:#2563eb;color:#fff;font-size:9px;font-weight:800;padding:1px 4px;border-radius:6px;border:1px solid #fff;white-space:nowrap;">בטיפול</span>`
      : "";

    const icon = L.divIcon({
      className: "",
      html: `<div class="custom-drop-marker" style="width:32px;height:32px;background:${meta.hex};position:relative;">
              <span>${meta.emoji}</span>
              ${claimedBadge}
              ${multiCountBadge}
            </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const dropMarker = L.marker([lat, lng], { icon, zIndexOffset: 600 });
    dropMarker.bindPopup(buildDropPopupHtml(drop, mode), { maxWidth: 320 });
    dropMarker.addTo(state.markersLayer);
  });
}

function buildUnitPopupHtml(unit, distMeters, mode) {
  const uid = getUnitId(unit);
  const status = normalizeStatus(unit.status);
  const locationDesc = unit.location_description || getUnitOwnerName(unit) || "צור יגאל כוכב יאיר";
  const sizeLiters = unit.composter_size_liters ? `${unit.composter_size_liters} ליטר` : "";
  const distText = formatDistance(distMeters);

  const badges = [];
  if (unit.accepting_carbon)
    badges.push(`<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-bold">🍂 קולט עלים (פחמן)</span>`);
  if (unit.accepting_nitrogen)
    badges.push(`<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[11px] font-bold">🌿 קולט דשא (חנקן)</span>`);
  if (unit.accepting_kitchen)
    badges.push(`<span class="px-2 py-0.5 rounded-full bg-orange-100 text-orange-900 text-[11px] font-bold">🍎 קולט מטבח</span>`);

  const imgUrl = toGoogleDriveDirectLink(unit.image_url || "");
  const imgBlock = imgUrl
    ? `<img src="${imgUrl}" alt="${uid}" class="w-full h-24 object-cover rounded-lg mb-2 border border-slate-200" onerror="this.style.display='none'" />`
    : "";

  // Operator public note visible to ALL users on the map (trustee, owner, admin)
  const operatorPublicNote = String(unit.operator_public_note || "").trim();
  const publicNoteHtml = operatorPublicNote
    ? `<div class="mt-1.5 text-xs bg-emerald-50 border border-emerald-200 p-2 rounded-lg text-emerald-950 font-medium">
        <strong>💬 הערת מפעיל העמדה:</strong> ${operatorPublicNote}
      </div>`
    : "";

  // Internal maintenance notes visible ONLY to Admin or the assigned Owner of this unit
  const canSeeMaintenance =
    state.isAdmin || (state.isComposterOwner && uid === state.assignedUnitId);
  const maintenanceNotesHtml =
    canSeeMaintenance && unit.maintenance_notes
      ? `<div class="mt-1.5 text-[11px] bg-slate-100 p-1.5 rounded text-slate-700"><strong>🛠️ הערות תחזוקה:</strong> ${unit.maintenance_notes}</div>`
      : "";

  return `
    <div dir="rtl" class="text-right space-y-1.5 min-w-[230px]">
      ${imgBlock}
      <div class="flex items-center justify-between gap-2">
        <span class="font-extrabold text-sm text-slate-900">${uid}</span>
        <span class="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">סטטוס ${status} ${sizeLiters ? "• " + sizeLiters : ""}</span>
      </div>
      <div class="text-xs text-slate-700 font-medium">📍 ${locationDesc}</div>
      ${distText ? `<div class="text-xs font-bold text-blue-600">🚶 ${distText}</div>` : ""}
      <div class="flex flex-wrap gap-1 pt-1">${badges.join("") || '<span class="text-[11px] text-slate-400">סגור כרגע לקליטה חיצונית</span>'}</div>
      ${publicNoteHtml}
      ${maintenanceNotesHtml}
    </div>
  `;
}

function buildDropPopupHtml(drop, mode) {
  const tagsHtml = renderDropMaterialTagsHtml(drop);
  const remainingTimeText = getDropRemainingTimeLabel(drop);

  const reporter = getDropReporterUser(drop);
  const reporterName = drop.reporter_name || getUserName(reporter);
  const reporterRank =
    drop.reporter_rank ||
    reporter?.rank_title ||
    computeRankInfo(reporter?.approved_count).rankTitle;

  const isClaimed = String(drop.status || "").toLowerCase() === "claimed";
  const claimedBy = drop.claimed_by_unit_id || "עמדת קומפוסט";

  // SECURITY RULE: Only Admin can see internal_estimated_kg
  const adminWeightLine =
    state.isAdmin && drop.internal_estimated_kg != null
      ? `<div class="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded">משקל פנימי מוערך: ${drop.internal_estimated_kg} ק"ג</div>`
      : "";

  const canManageDrops = state.isAdmin || state.isComposterOwner;
  const actionButtons = canManageDrops
    ? `
      <div class="grid grid-cols-3 gap-1 pt-2 border-t border-slate-200 mt-2">
        <button type="button" onclick="window.handleDropAction('${drop.id}', 'claim')"
          class="py-1.5 px-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold">
          ✋ אני על זה
        </button>
        <button type="button" onclick="window.handleDropAction('${drop.id}', 'approve')"
          class="py-1.5 px-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold">
          ✅ אושר ונאסף
        </button>
        <button type="button" onclick="window.openRejectModal('${drop.id}')"
          class="py-1.5 px-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold">
          ❌ דחייה
        </button>
      </div>
    `
    : "";

  return `
    <div dir="rtl" class="text-right space-y-1.5 min-w-[240px]">
      <div class="flex items-center justify-between gap-2">
        <span class="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-slate-800 text-amber-300">
          ⏳ ${remainingTimeText}
        </span>
        <span class="text-[11px] font-bold px-2 py-0.5 rounded-full ${isClaimed ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"
    }">
          ${isClaimed ? `בטיפול (${claimedBy})` : "פתוח לאיסוף"}
        </span>
      </div>
      <div class="flex flex-wrap gap-1 pt-0.5">
        ${tagsHtml}
      </div>
      <div class="text-xs text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-200">
        <div><strong>מדווח:</strong> ${reporterName}</div>
        <div><strong>דרגה:</strong> <span class="text-emerald-700 font-bold">${reporterRank}</span></div>
        ${drop.notes || drop.description ? `<div class="mt-1 text-slate-500">${drop.notes || drop.description}</div>` : ""}
      </div>
      ${adminWeightLine}
      ${actionButtons}
    </div>
  `;
}

// ============================================================================
// VIEW 2: TRUSTEE ("נאמן מיחזור") RENDERING & ACTIONS
// ============================================================================

function getFilteredUnitsForTrustee() {
  const wantKitchen = state.trusteeFilters.has("kitchen");
  const wantLeaves = state.trusteeFilters.has("leaves");
  const wantGrass = state.trusteeFilters.has("grass");

  return state.units.filter((u) => {
    if (wantKitchen && u.accepting_kitchen) return true;
    if (wantLeaves && u.accepting_carbon) return true;
    if (wantGrass && u.accepting_nitrogen) return true;
    return false;
  });
}

function renderTrusteeView() {
  const openUnits = getFilteredUnitsForTrustee();
  const countBadge = document.getElementById("trustee-open-units-count");
  const listEl = document.getElementById("trustee-units-list");

  if (countBadge) countBadge.textContent = `${openUnits.length} עמדות פתוחות`;

  if (listEl) {
    if (openUnits.length === 0) {
      listEl.innerHTML = `<div class="col-span-2 text-xs text-slate-400 py-4 text-center">אין עמדות קומפוסט הפתוחות לסוגי החומר שסומנו בסינון העליון.</div>`;
    } else {
      const enriched = openUnits
        .map((u) => {
          const dist = calcDistanceMeters(
            state.userGps.lat,
            state.userGps.lng,
            getUnitLat(u),
            getUnitLng(u)
          );
          return { unit: u, dist };
        })
        .sort((a, b) => (a.dist ?? 999999) - (b.dist ?? 999999));

      listEl.innerHTML = enriched
        .map(({ unit, dist }) => {
          const uid = getUnitId(unit);
          const loc = unit.location_description || getUnitOwnerName(unit) || "צור יגאל";
          const pubNote = String(unit.operator_public_note || "").trim();
          const tags = [];
          if (unit.accepting_carbon) tags.push("🍂 עלים");
          if (unit.accepting_nitrogen) tags.push("🌿 דשא");
          if (unit.accepting_kitchen) tags.push("🍎 מטבח");

          return `
            <div onclick="window.focusUnitOnMap('${uid}')"
              class="p-2.5 rounded-xl border border-slate-200 hover:border-emerald-400 bg-slate-50/70 cursor-pointer flex items-center justify-between gap-2 transition">
              <div>
                <div class="flex items-center gap-1.5">
                  <span class="text-xs font-extrabold text-slate-800">${uid}</span>
                  <span class="text-[0.68rem] text-emerald-700 font-bold">${tags.join(" • ")}</span>
                </div>
                <div class="text-xs text-slate-600 mt-0.5">📍 ${loc}</div>
                ${pubNote ? `<div class="text-[0.68rem] text-emerald-800 font-medium mt-0.5">💬 ${pubNote}</div>` : ""}
              </div>
              <div class="text-left">
                <span class="text-xs font-extrabold text-blue-600 whitespace-nowrap">${formatDistance(dist)}</span>
              </div>
            </div>
          `;
        })
        .join("");
    }
  }

  // Bottom Drawer: Personal Rank Progress, Transparent Counter & Live Feed (Strictly NO WEIGHTS!)
  const activeUser = state.currentUserProfile || {};

  const userDrops = state.resourceDrops.filter((d) => {
    const repId = getDropReporterId(d);
    if (repId != null && activeUser.id != null) {
      return (
        String(repId) === String(activeUser.id) ||
        (activeUser.auth_user_id && String(repId) === String(activeUser.auth_user_id))
      );
    }
    return false;
  });

  const approvedFromDrops = userDrops.filter(
    (d) => String(d.status || "").toLowerCase() === "approved"
  ).length;
  const rejectedFromDrops = userDrops.filter(
    (d) => String(d.status || "").toLowerCase() === "rejected"
  ).length;

  const approvedCount =
    activeUser.approved_count != null
      ? Number(activeUser.approved_count)
      : approvedFromDrops;
  const rejectedCount =
    activeUser.rejected_count != null
      ? Number(activeUser.rejected_count)
      : rejectedFromDrops;

  const rankInfo = computeRankInfo(approvedCount, activeUser.rank_title);

  const rankPill = document.getElementById("trustee-rank-pill");
  if (rankPill) rankPill.textContent = `דרגה: ${rankInfo.rankTitle}`;

  const counterTop = document.getElementById("trustee-transparent-counter");
  const counterDetailed = document.getElementById("trustee-counter-detailed");
  const counterText = `אושרו: ${approvedCount} | נפסלו: ${rejectedCount}`;
  if (counterTop) counterTop.textContent = counterText;
  if (counterDetailed) counterDetailed.textContent = counterText;

  const rankTitleEl = document.getElementById("trustee-current-rank-title");
  const nextRankEl = document.getElementById("trustee-next-rank-label");
  const progressBar = document.getElementById("trustee-rank-progress-bar");

  if (rankTitleEl) rankTitleEl.textContent = rankInfo.rankTitle;
  if (nextRankEl) {
    nextRankEl.textContent = rankInfo.isMaxRank
      ? "הגעת לדרגה הגבוהה ביותר! 👑"
      : `עוד ${rankInfo.remaining} דיווחים מאושרים לדרגה הבאה (יעד: ${rankInfo.nextAt})`;
  }
  if (progressBar) progressBar.style.width = `${rankInfo.progressPct}%`;

  // Render Live Feed of user's own reports (Strictly NO kg / internal_estimated_kg!)
  const feedEl = document.getElementById("trustee-live-feed");
  if (feedEl) {
    if (userDrops.length === 0) {
      feedEl.innerHTML = `<div class="text-xs text-slate-400 text-center py-3">עדיין אין דיווחים אישיים שלך בפיד. לחץ על "דווח במיקום הנוכחי שלי" כדי להתחיל!</div>`;
    } else {
      feedEl.innerHTML = userDrops
        .map((d) => {
          const tagsHtml = renderDropMaterialTagsHtml(d);
          const st = String(d.status || "open").toLowerCase();
          const claimedUnit = d.claimed_by_unit_id || "בעל קומפוסטר";
          const rejectReason = d.rejection_reason || d.reject_reason || "לא צוינה סיבה";

          let statusBadge = "";
          let statusDetail = "";

          if (st === "claimed") {
            statusBadge = `<span class="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-extrabold">✋ אני על זה (${claimedUnit})</span>`;
            statusDetail = `בעל קומפוסטר מיחידה ${claimedUnit} סימן "אני על זה" ובדרך לאסוף את הערימה (${getDropRemainingTimeLabel(d)}).`;
          } else if (st === "approved") {
            statusBadge = `<span class="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-extrabold">✅ אושר ונאסף</span>`;
            statusDetail = `האיסוף אושר ע"י עמדת קומפוסט והדרגה שלך עודכנה!`;
          } else if (st === "rejected") {
            statusBadge = `<span class="px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 text-xs font-extrabold">❌ נפסל (${rejectReason})</span>`;
            statusDetail = `הדיווח נדחה ע"י בעל קומפוסטר. סיבה: ${rejectReason}.`;
          } else {
            statusBadge = `<span class="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-extrabold">⏳ ${getDropRemainingTimeLabel(d)}</span>`;
            statusDetail = `מופיע כעת במפה לכל בעלי הקומפוסטרים בשכונה.`;
          }

          return `
            <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-1.5">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex flex-wrap gap-1">${tagsHtml}</div>
                ${statusBadge}
              </div>
              <p class="text-xs text-slate-600">${statusDetail}</p>
            </div>
          `;
        })
        .join("");
    }
  }
}

// ============================================================================
// VIEW 3: OWNER ("בעל קומפוסטר" - Strictly Isolated to assigned_unit_id)
// ============================================================================

function getDropExpiryTimestamp(d) {
  if (d?.expires_at) {
    const t = new Date(d.expires_at).getTime();
    if (Number.isFinite(t)) return t;
  }
  if (d?.created_at) {
    const t = new Date(d.created_at).getTime();
    if (Number.isFinite(t)) return t + DROP_EXPIRY_MS;
  }
  return Date.now() + DROP_EXPIRY_MS;
}

function getDropReporterRankScore(d) {
  const reporter = getDropReporterUser(d);
  if (reporter && reporter.approved_count != null) {
    return Number(reporter.approved_count) || 0;
  }
  const rankTitle = String(d?.reporter_rank || reporter?.rank_title || "");
  for (let i = RANK_LADDER.length - 1; i >= 0; i--) {
    if (rankTitle.includes(RANK_LADDER[i].title.split(" ")[0])) {
      return RANK_LADDER[i].min;
    }
  }
  return 0;
}

function getFilteredAndSortedActiveDrops() {
  const filtered = state.activeResourceDrops.filter((d) => {
    if (!isDropActiveAndUnexpired(d)) return false;
    if (state.dropsFilterMaterial && state.dropsFilterMaterial !== "all") {
      const mTypes = getDropTypes(d);
      if (!mTypes.includes(state.dropsFilterMaterial)) return false;
    }
    return true;
  });

  const sortBy = state.dropsSortBy || "distance";
  return filtered.slice().sort((a, b) => {
    if (sortBy === "distance") {
      const distA =
        calcDistanceMeters(state.userGps.lat, state.userGps.lng, getDropLat(a), getDropLng(a)) ??
        999999;
      const distB =
        calcDistanceMeters(state.userGps.lat, state.userGps.lng, getDropLat(b), getDropLng(b)) ??
        999999;
      return distA - distB;
    }
    if (sortBy === "expiry") {
      return getDropExpiryTimestamp(a) - getDropExpiryTimestamp(b);
    }
    if (sortBy === "rank") {
      return getDropReporterRankScore(b) - getDropReporterRankScore(a);
    }
    if (sortBy === "material") {
      const typeA = getDropTypes(a)[0] || "";
      const typeB = getDropTypes(b)[0] || "";
      return typeA.localeCompare(typeB);
    }
    return 0;
  });
}

function getActiveManagedUnitId() {
  if (state.isAdmin) {
    if (state.selectedUnitId) {
      return state.selectedUnitId;
    }
    if (state.adminActAs && state.adminActAs.startsWith("unit:")) {
      return state.adminActAs.replace("unit:", "");
    }
    return state.units[0] ? getUnitId(state.units[0]) : "CO-0012";
  }
  // Strict isolation for non-admin composter owner: ONLY their assigned_unit_id
  return state.assignedUnitId || "";
}

function canCurrentUserModifyUnit(unitId) {
  if (!unitId) return false;
  if (state.isAdmin) return true;
  if (state.isComposterOwner && state.assignedUnitId === unitId) return true;
  return false;
}

function syncStagedHealthWithUnit(unit, forceReset = false) {
  const uid = getUnitId(unit);
  if (forceReset || state.stagedHealthUnitId !== uid || !state.stagedDirty) {
    state.stagedHealthUnitId = uid;
    state.stagedStatus = normalizeStatus(unit.status);
    state.stagedTemp = Math.min(
      5,
      Math.max(1, parseInt(unit.temp_level ?? unit.temperature ?? unit.temp_scale ?? 3, 10) || 3)
    );
    state.stagedMoisture = Math.min(
      5,
      Math.max(1, parseInt(unit.moisture_level ?? unit.moisture ?? unit.moisture_scale ?? 3, 10) || 3)
    );
    state.stagedVolume = Math.min(
      5,
      Math.max(1, parseInt(unit.volume_level ?? unit.volume ?? unit.volume_scale ?? 3, 10) || 3)
    );
    state.stagedDirty = false;
  }
}

function renderStagedStatusButtons() {
  const currentStatus = state.stagedStatus || "A";
  document.querySelectorAll(".owner-status-btn").forEach((btn) => {
    const st = btn.getAttribute("data-status-val");
    const isSelected = st === currentStatus;
    if (isSelected) {
      btn.className =
        "owner-status-btn py-2 px-2 rounded-xl text-xs font-extrabold border-2 transition flex flex-col items-center gap-0.5 bg-slate-900 text-white border-slate-900 shadow";
    } else {
      btn.className =
        "owner-status-btn py-2 px-2 rounded-xl text-xs font-extrabold border transition flex flex-col items-center gap-0.5 bg-white text-slate-700 border-slate-200 hover:bg-slate-100";
    }
  });
}

function renderOwnerView() {
  const activeUnitId = getActiveManagedUnitId();

  // Strictly load ONLY the assigned unit for non-admin owners
  const unit = state.units.find((u) => getUnitId(u) === activeUnitId);

  if (!unit) {
    const titleEl = document.getElementById("owner-panel-title");
    const locEl = document.getElementById("owner-unit-location");
    if (titleEl) titleEl.textContent = "לא נמצאה עמדת קומפוסט משויכת לחשבון זה";
    if (locEl) locEl.textContent = "פנה לאדמין המערכת לשיוך עמדה (assigned_unit_id)";
    return;
  }

  syncStagedHealthWithUnit(unit);

  const avatarEl = document.getElementById("owner-unit-avatar");
  const titleEl = document.getElementById("owner-panel-title");
  const sizeBadge = document.getElementById("owner-unit-size-badge");
  const locEl = document.getElementById("owner-unit-location");

  if (avatarEl) avatarEl.textContent = activeUnitId;
  if (titleEl) {
    const ownerName = getUnitOwnerName(unit);
    titleEl.textContent = `ניהול עמדה ${activeUnitId}${ownerName && ownerName !== activeUnitId ? " • " + ownerName : ""}`;
  }
  if (sizeBadge) {
    sizeBadge.textContent = unit.composter_size_liters
      ? `${unit.composter_size_liters} ליטר`
      : "330 ליטר";
  }
  if (locEl) {
    locEl.textContent = unit.location_description || "צור יגאל כוכב יאיר";
  }

  // Sum weighing logs strictly for this unit ONLY
  const unitLogs = state.weighingLogs.filter(
    (w) => String(w.unit_id || w.composter_id || "") === activeUnitId
  );
  const unitTotalKg = unitLogs.reduce(
    (acc, w) =>
      acc +
      (parseFloat(w.kitchen_kg ?? w.kitchen_waste_kg ?? 0) || 0) +
      (parseFloat(w.garden_kg ?? w.garden_waste_kg ?? 0) || 0),
    0
  );
  const unitTotalEl = document.getElementById("owner-unit-weighing-total");
  if (unitTotalEl) {
    unitTotalEl.textContent = `סה"כ נשקל בעמדה: ${unitTotalKg.toFixed(1)} ק"ג`;
  }

  // Unified Status & Health Card ("סטטוס ובריאות הערימה")
  renderStagedStatusButtons();

  const sTemp = document.getElementById("owner-slider-temp");
  const sMoist = document.getElementById("owner-slider-moisture");
  const sVol = document.getElementById("owner-slider-volume");

  if (sTemp) sTemp.value = state.stagedTemp;
  if (sMoist) sMoist.value = state.stagedMoisture;
  if (sVol) sVol.value = state.stagedVolume;

  const lTemp = document.getElementById("owner-temp-val-label");
  const lMoist = document.getElementById("owner-moisture-val-label");
  const lVol = document.getElementById("owner-volume-val-label");

  if (lTemp) lTemp.textContent = `${state.stagedTemp} / 5`;
  if (lMoist) lMoist.textContent = `${state.stagedMoisture} / 5`;
  if (lVol) lVol.textContent = `${state.stagedVolume} / 5`;

  // Operator Public Note (operator_public_note) & Maintenance Notes
  const publicNoteInput = document.getElementById("owner-operator-public-note");
  if (publicNoteInput && document.activeElement !== publicNoteInput) {
    publicNoteInput.value = unit.operator_public_note || "";
  }

  const notesInput = document.getElementById("owner-maintenance-notes");
  if (notesInput && document.activeElement !== notesInput) {
    notesInput.value = unit.maintenance_notes || "";
  }

  // 3 Toggles: accepting_carbon, accepting_nitrogen, accepting_kitchen
  const tCarbon = document.getElementById("toggle-accepting-carbon");
  const tNitrogen = document.getElementById("toggle-accepting-nitrogen");
  const tKitchen = document.getElementById("toggle-accepting-kitchen");

  if (tCarbon) tCarbon.checked = Boolean(unit.accepting_carbon);
  if (tNitrogen) tNitrogen.checked = Boolean(unit.accepting_nitrogen);
  if (tKitchen) tKitchen.checked = Boolean(unit.accepting_kitchen);

  // Active Street Drops Action Cards (filtered & sorted from active_resource_drops)
  const totalUnexpiredDrops = state.activeResourceDrops.filter(isDropActiveAndUnexpired).length;
  const activeDrops = getFilteredAndSortedActiveDrops();

  const badgeEl = document.getElementById("owner-active-drops-badge");
  if (badgeEl) {
    badgeEl.textContent =
      state.dropsFilterMaterial !== "all"
        ? `${activeDrops.length} מתוך ${totalUnexpiredDrops} מוקדים פעילים`
        : `${activeDrops.length} מוקדים פעילים`;
  }

  const cardsContainer = document.getElementById("owner-drops-cards-container");
  if (cardsContainer) {
    if (activeDrops.length === 0) {
      cardsContainer.innerHTML = `<div class="col-span-2 text-xs text-slate-400 text-center py-4">אין מוקדים פעילים התואמים את הסינון הנוכחי. ניתן לדווח באמצעות הכפתור "+ דיווח על ערימה ברחוב".</div>`;
    } else {
      cardsContainer.innerHTML = activeDrops
        .map((drop) => {
          const tagsHtml = renderDropMaterialTagsHtml(drop);
          const remainingTimeText = getDropRemainingTimeLabel(drop);
          const distMeters = calcDistanceMeters(
            state.userGps.lat,
            state.userGps.lng,
            getDropLat(drop),
            getDropLng(drop)
          );
          const distLabel = formatDistance(distMeters);

          const reporter = getDropReporterUser(drop);
          const reporterName = drop.reporter_name || getUserName(reporter);
          const reporterRank =
            drop.reporter_rank ||
            reporter?.rank_title ||
            computeRankInfo(reporter?.approved_count).rankTitle;

          const isClaimed = String(drop.status || "").toLowerCase() === "claimed";
          const claimedUnit = drop.claimed_by_unit_id || activeUnitId;

          return `
            <div class="p-3 rounded-xl border ${isClaimed ? "border-blue-300 bg-blue-50/40" : "border-slate-200 bg-slate-50"
            } flex flex-col justify-between gap-2.5">
              <div>
                <div class="flex items-center justify-between gap-2 mb-1.5">
                  <div class="flex items-center gap-1.5">
                    <span class="text-[0.68rem] font-extrabold px-2 py-0.5 rounded-full bg-slate-800 text-amber-300">
                      ⏳ ${remainingTimeText}
                    </span>
                    ${distLabel
              ? `<span class="text-[0.68rem] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">📍 ${distLabel}</span>`
              : ""
            }
                  </div>
                  <span class="text-[0.68rem] font-bold px-2 py-0.5 rounded-full ${isClaimed
              ? "bg-blue-600 text-white"
              : "bg-amber-100 text-amber-800"
            }">
                    ${isClaimed ? `בטיפול ע"י ${claimedUnit}` : "פתוח לאיסוף"}
                  </span>
                </div>
                <div class="flex flex-wrap gap-1 mb-1">
                  ${tagsHtml}
                </div>
                <div class="text-xs text-slate-600 mt-1">
                  מדווח: <strong>${reporterName}</strong> • <span class="text-emerald-700 font-semibold">${reporterRank}</span>
                </div>
                ${drop.notes || drop.description
              ? `<div class="text-[0.7rem] text-slate-500 mt-0.5">"${drop.notes || drop.description}"</div>`
              : ""
            }
              </div>

              <div class="grid grid-cols-3 gap-1.5 pt-1">
                <button type="button" onclick="window.handleDropAction('${drop.id}', 'claim')"
                  class="py-1.5 px-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm">
                  ✋ אני על זה
                </button>
                <button type="button" onclick="window.handleDropAction('${drop.id}', 'approve')"
                  class="py-1.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm">
                  ✅ אושר ונאסף
                </button>
                <button type="button" onclick="window.openRejectModal('${drop.id}')"
                  class="py-1.5 px-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition shadow-sm">
                  ❌ דחייה
                </button>
              </div>
            </div>
          `;
        })
        .join("");
    }
  }
}

// ============================================================================
// VIEW 4: ADMIN ("אדמין") RENDERING & ACTIONS
// ============================================================================

function renderAdminView() {
  if (!state.isAdmin) return;

  let totalWeighingKg = 0;
  let totalKitchenKg = 0;
  let totalGardenKg = 0;

  state.weighingLogs.forEach((w) => {
    const k = parseFloat(w.kitchen_kg ?? w.kitchen_waste_kg ?? w.weight_kg ?? 0) || 0;
    const g = parseFloat(w.garden_kg ?? w.garden_waste_kg ?? 0) || 0;
    totalKitchenKg += k;
    totalGardenKg += g;
    totalWeighingKg += k + g;
  });

  if (totalWeighingKg === 0) {
    state.units.forEach((u) => {
      const k = parseFloat(u.kitchen_waste_kg ?? 0) || 0;
      const g = parseFloat(u.garden_waste_kg ?? 0) || 0;
      totalKitchenKg += k;
      totalGardenKg += g;
      totalWeighingKg += k + g;
    });
  }

  const approvedDrops = state.resourceDrops.filter(
    (d) => String(d.status || "").toLowerCase() === "approved"
  );
  const approvedDropsKg = approvedDrops.reduce(
    (sum, d) => sum + (parseFloat(d.internal_estimated_kg ?? 12) || 0),
    0
  );

  const grandTotalSavedKg = totalWeighingKg + approvedDropsKg;

  const elTotalSaved = document.getElementById("admin-kpi-total-saved");
  const elWeighingSum = document.getElementById("admin-kpi-weighing-sum");
  const elWeighingDetail = document.getElementById("admin-kpi-weighing-detail");
  const elDropsKg = document.getElementById("admin-kpi-drops-kg");
  const elDropsCount = document.getElementById("admin-kpi-drops-count");
  const elUnitsStatus = document.getElementById("admin-kpi-units-status");
  const elOpenDrops = document.getElementById("admin-kpi-open-drops");

  if (elTotalSaved) elTotalSaved.textContent = `${grandTotalSavedKg.toFixed(1)} ק"ג`;
  if (elWeighingSum) elWeighingSum.textContent = `${totalWeighingKg.toFixed(1)} ק"ג`;
  if (elWeighingDetail)
    elWeighingDetail.textContent = `מטבח: ${totalKitchenKg.toFixed(1)} ק"ג | גזם: ${totalGardenKg.toFixed(1)} ק"ג`;
  if (elDropsKg) elDropsKg.textContent = `${approvedDropsKg.toFixed(1)} ק"ג`;
  if (elDropsCount)
    elDropsCount.textContent = `מתוך ${approvedDrops.length} דיווחי רחוב מאושרים`;
  if (elUnitsStatus) elUnitsStatus.textContent = `${state.units.length} עמדות במערך`;

  if (elOpenDrops)
    elOpenDrops.textContent = `${state.activeResourceDrops.length} דיווחי רחוב פעילים כעת`;

  const unitsGrid = document.getElementById("admin-units-grid");
  if (unitsGrid) {
    unitsGrid.innerHTML = state.units
      .map((u) => {
        const uid = getUnitId(u);
        const st = normalizeStatus(u.status);
        const loc = u.location_description || getUnitOwnerName(u) || "";
        const isPublic = ["CO-0001", "CO-0017", "CO-0018"].includes(uid) || Boolean(u.is_public);
        const stColor =
          st === "A"
            ? "bg-emerald-100 text-emerald-800 border-emerald-300"
            : st === "B"
              ? "bg-amber-100 text-amber-800 border-amber-300"
              : "bg-red-100 text-red-800 border-red-300";

        return `
          <div class="p-3 rounded-xl border ${u.accepting_carbon ? "border-blue-400 bg-blue-50/20" : "border-slate-200 bg-slate-50"
          } space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-extrabold text-slate-900">${uid}</span>
                ${isPublic
            ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800">עמדה ציבורית</span>`
            : ""
          }
                <span class="text-xs text-slate-600 truncate max-w-[150px]">• ${loc}</span>
              </div>
              <span class="text-[11px] font-extrabold px-2 py-0.5 rounded-full border ${stColor}">
                סטטוס ${st}
              </span>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div class="flex items-center gap-1">
                <button type="button" onclick="window.adminQuickStatus('${uid}', 'A')"
                  class="px-2 py-0.5 rounded border text-[11px] font-bold ${st === "A" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600"
          }">A</button>
                <button type="button" onclick="window.adminQuickStatus('${uid}', 'B')"
                  class="px-2 py-0.5 rounded border text-[11px] font-bold ${st === "B" ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-600"
          }">B</button>
                <button type="button" onclick="window.adminQuickStatus('${uid}', 'C')"
                  class="px-2 py-0.5 rounded border text-[11px] font-bold ${st === "C" ? "bg-red-600 text-white border-red-600" : "bg-white text-slate-600"
          }">C</button>
              </div>

              <label class="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-blue-700">
                <input type="checkbox" ${u.accepting_carbon ? "checked" : ""}
                  onchange="window.adminToggleUnitField('${uid}', 'accepting_carbon', this.checked)"
                  class="accent-blue-600" />
                <span>קולט פחמן (מסגרת כחולה)</span>
              </label>

              <button type="button" onclick="window.adminSelectUnitToManage('${uid}')"
                class="text-[11px] font-bold text-indigo-600 hover:underline">
                נהל עמדה ⬅
              </button>
            </div>

            <div class="flex items-center gap-1.5">
              <input type="text" id="admin-pubnote-${uid}" value="${(u.operator_public_note || "").replace(/"/g, "&quot;")}"
                placeholder="הערה אישית גלויה במפה (operator_public_note)..."
                class="flex-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-xs text-slate-800" />
              <button type="button" onclick="window.adminSaveUnitPublicNote('${uid}')"
                class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold">
                שמור למפה
              </button>
            </div>

            <div class="flex items-center gap-1.5">
              <input type="text" id="admin-note-${uid}" value="${(u.maintenance_notes || "").replace(/"/g, "&quot;")}"
                placeholder="הערות תחזוקה פנימיות..."
                class="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800" />
              <button type="button" onclick="window.adminSaveUnitNote('${uid}')"
                class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-bold">
                שמור תחזוקה
              </button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  const adminDropsEl = document.getElementById("admin-drops-list");
  if (adminDropsEl) {
    adminDropsEl.innerHTML = state.resourceDrops
      .slice(0, 12)
      .map((d) => {
        const tagsHtml = renderDropMaterialTagsHtml(d);
        const st = String(d.status || "open").toLowerCase();
        const estKg = d.internal_estimated_kg != null ? d.internal_estimated_kg : 12;
        const reporter = getDropReporterUser(d);
        const remText =
          st === "open" || st === "claimed" ? ` • ${getDropRemainingTimeLabel(d)}` : "";

        return `
          <div class="p-2.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-2 text-xs">
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-1">
                ${tagsHtml}
                <span class="text-indigo-700 font-mono font-bold mr-1">${estKg} ק"ג (מוערך פנימי)</span>
              </div>
              <div class="text-[11px] text-slate-500">
                מדווח: ${d.reporter_name || getUserName(reporter)} | סטטוס: <strong>${st}</strong>
                ${d.claimed_by_unit_id ? ` (${d.claimed_by_unit_id})` : ""}${remText}
              </div>
            </div>
            <div class="flex items-center gap-1">
              <button type="button" onclick="window.handleDropAction('${d.id}', 'claim')"
                class="px-2 py-1 rounded bg-blue-600 text-white text-[10px] font-bold">✋</button>
              <button type="button" onclick="window.handleDropAction('${d.id}', 'approve')"
                class="px-2 py-1 rounded bg-emerald-600 text-white text-[10px] font-bold">✅</button>
              <button type="button" onclick="window.openRejectModal('${d.id}')"
                class="px-2 py-1 rounded bg-red-600 text-white text-[10px] font-bold">❌</button>
            </div>
          </div>
        `;
      })
      .join("");
  }
}

// ============================================================================
// VIEW 5: IOT SENSOR ("חיישן IoT • ESP32-CO-0017") RENDERING
// ============================================================================

function renderIotView() {
  const unit17 =
    state.units.find((u) => getUnitId(u) === "CO-0017") ||
    state.units.find((u) => u.sensor_temp_c != null) ||
    {};

  const tempC = parseFloat(unit17.sensor_temp_c ?? unit17.temperature_c ?? 54.6);
  const moistPct = parseFloat(unit17.sensor_moisture_pct ?? unit17.moisture_pct ?? 58.2);
  const sizeL = unit17.composter_size_liters || 600;
  const locDesc = unit17.location_description || "עמדה ציבורית CO-0017 • צור יגאל כוכב יאיר";

  const elTemp = document.getElementById("iot-temp-value");
  const elTempBar = document.getElementById("iot-temp-bar");
  const elMoist = document.getElementById("iot-moisture-value");
  const elMoistBar = document.getElementById("iot-moisture-bar");
  const elCap = document.getElementById("iot-capacity-liters");
  const elLoc = document.getElementById("iot-unit-location");
  const elStatus = document.getElementById("iot-status-pill");
  const elSync = document.getElementById("iot-last-sync");

  if (elTemp) elTemp.textContent = Number.isFinite(tempC) ? tempC.toFixed(1) : "54.6";
  if (elTempBar) {
    const pct = Math.min(100, Math.max(10, Math.round((tempC / 75) * 100)));
    elTempBar.style.width = `${pct}%`;
  }

  if (elMoist) elMoist.textContent = Number.isFinite(moistPct) ? moistPct.toFixed(1) : "58.2";
  if (elMoistBar) {
    const pct = Math.min(100, Math.max(10, Math.round(moistPct)));
    elMoistBar.style.width = `${pct}%`;
  }

  if (elCap) elCap.textContent = `${sizeL} L`;
  if (elLoc) elLoc.textContent = `${locDesc} • קריאת חיישנים אוטומטית (ללא טפסי הזנה ידניים)`;
  if (elStatus) elStatus.textContent = `Status ${normalizeStatus(unit17.status || "A")}`;
  if (elSync) {
    const nowStr = new Date().toLocaleTimeString("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    elSync.textContent = `סנכרון אחרון מ-Supabase: ${nowStr}`;
  }

  renderIot24hTrendSvg(
    Number.isFinite(tempC) ? tempC : 54.6,
    Number.isFinite(moistPct) ? moistPct : 58.2
  );
}

function renderIot24hTrendSvg(currentTemp, currentMoist) {
  const container = document.getElementById("iot-chart-container");
  if (!container) return;

  const hours = 24;
  const tempPoints = [];
  const moistPoints = [];

  for (let i = 0; i < hours; i++) {
    const wave = Math.sin((i / hours) * Math.PI * 2);
    const t =
      i === hours - 1
        ? currentTemp
        : +(currentTemp - 2.5 + wave * 3.8 + ((i % 3) - 1) * 0.6).toFixed(1);
    const m =
      i === hours - 1
        ? currentMoist
        : +(currentMoist + 1.8 - wave * 2.4 + ((i % 2) - 0.5) * 0.5).toFixed(1);
    tempPoints.push(t);
    moistPoints.push(m);
  }

  const w = 720;
  const h = 180;
  const padX = 36;
  const padY = 20;

  const toCoords = (arr, minVal, maxVal) =>
    arr
      .map((val, idx) => {
        const x = padX + (idx / (hours - 1)) * (w - padX * 2);
        const norm = (val - minVal) / Math.max(1, maxVal - minVal);
        const y = h - padY - Math.min(1, Math.max(0, norm)) * (h - padY * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  const tempLine = toCoords(tempPoints, 20, 80);
  const moistLine = toCoords(moistPoints, 20, 80);

  container.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" class="w-full h-full overflow-visible">
      <line x1="${padX}" y1="${padY}" x2="${w - padX}" y2="${padY}" stroke="#1e293b" stroke-dasharray="4 4" />
      <line x1="${padX}" y1="${h / 2}" x2="${w - padX}" y2="${h / 2}" stroke="#1e293b" stroke-dasharray="4 4" />
      <line x1="${padX}" y1="${h - padY}" x2="${w - padX}" y2="${h - padY}" stroke="#1e293b" />

      <text x="6" y="${padY + 4}" fill="#64748b" font-size="10" font-family="monospace">75</text>
      <text x="6" y="${h / 2 + 4}" fill="#64748b" font-size="10" font-family="monospace">50</text>
      <text x="6" y="${h - padY + 4}" fill="#64748b" font-size="10" font-family="monospace">25</text>

      <polyline fill="none" stroke="#22d3ee" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${moistLine}" />
      <polyline fill="none" stroke="#fb923c" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" points="${tempLine}" />

      <text x="${padX}" y="${h - 3}" fill="#64748b" font-size="10" font-family="monospace">-24h</text>
      <text x="${w / 2 - 15}" y="${h - 3}" fill="#64748b" font-size="10" font-family="monospace">-12h</text>
      <text x="${w - padX - 24}" y="${h - 3}" fill="#34d399" font-size="10" font-weight="bold" font-family="monospace">NOW</text>
    </svg>
  `;
}

// ============================================================================
// MUTATIONS & DATABASE OPERATIONS (With Strict Permission Checks)
// ============================================================================

function flashOwnerSaveFeedback() {
  const el = document.getElementById("owner-save-feedback");
  if (!el) return;
  el.classList.remove("hidden");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add("hidden"), 2500);
}

function flashHealthSavedBadge() {
  const badge = document.getElementById("owner-health-saved-badge");
  if (!badge) return;
  badge.classList.remove("hidden");
  clearTimeout(badge._timer);
  badge._timer = setTimeout(() => badge.classList.add("hidden"), 3000);
}

async function updateUnitInSupabase(unitId, patchFields, customSuccessMsg = null) {
  const cleanUnitId = String(unitId || "").trim();
  if (!canCurrentUserModifyUnit(cleanUnitId)) {
    showToast("אין לך הרשאה לערוך עמדה שאינה משויכת לחשבונך", true);
    return false;
  }

  const unit = state.units.find(
    (u) =>
      getUnitId(u) === cleanUnitId ||
      String(u.unit_id || "").trim() === cleanUnitId
  );

  if (unit) Object.assign(unit, patchFields);
  renderAll();

  const { error } = await supabase
    .from("units")
    .update(patchFields)
    .eq("unit_id", cleanUnitId);

  if (error) {
    alert("שגיאת עדכון: " + error.message);
    console.error(error);
    showToast("שגיאה בשמירת נתוני העמדה: " + error.message, true);
    await loadAllSupabaseData(true);
    return false;
  }

  flashOwnerSaveFeedback();
  showToast(customSuccessMsg || `עמדה ${cleanUnitId} עודכנה ב-Supabase`);
  await loadAllSupabaseData(true);
  return true;
}

window.handleDropAction = async function (dropId, action, rejectionReason = null) {
  if (!state.isAdmin && !state.isComposterOwner) {
    showToast("פעולה זו זמינה לבעלי עמדות קומפוסט ואדמין בלבד", true);
    return;
  }

  const drop =
    state.activeResourceDrops.find((d) => String(d.id) === String(dropId)) ||
    state.resourceDrops.find((d) => String(d.id) === String(dropId));
  if (!drop) return;

  const activeUnitId = getActiveManagedUnitId();
  let payload = {};

  if (action === "claim") {
    payload = {
      status: "claimed",
      claimed_by_unit_id: activeUnitId
    };
  } else if (action === "approve") {
    payload = {
      status: "approved",
      claimed_by_unit_id: drop.claimed_by_unit_id || activeUnitId
    };
  } else if (action === "reject") {
    payload = {
      status: "rejected"
    };
    if ("rejection_reason" in drop) {
      payload.rejection_reason = rejectionReason || "פסולת לא אורגנית";
    } else if ("reject_reason" in drop) {
      payload.reject_reason = rejectionReason || "פסולת לא אורגנית";
    }
  }

  Object.assign(drop, payload);
  renderAll();

  const { error } = await supabase
    .from("resource_drops")
    .update(payload)
    .eq("id", dropId);

  if (error) {
    alert("שגיאת עדכון: " + error.message);
    console.error(error);
    showToast("שגיאה בעדכון סטטוס הדיווח: " + error.message, true);
    await loadAllSupabaseData(true);
    return;
  }

  const reporter = getDropReporterUser(drop);
  if (reporter && (action === "approve" || action === "reject")) {
    const newApproved =
      (Number(reporter.approved_count) || 0) + (action === "approve" ? 1 : 0);
    const newRejected =
      (Number(reporter.rejected_count) || 0) + (action === "reject" ? 1 : 0);
    const nextRankInfo = computeRankInfo(newApproved);

    const userPatch = {
      approved_count: newApproved,
      rejected_count: newRejected,
      rank_title: nextRankInfo.rankTitle
    };
    Object.assign(reporter, userPatch);
    const { error: userErr } = await supabase
      .from("users")
      .update(userPatch)
      .eq("id", reporter.id);
    if (userErr) {
      console.error(userErr);
    }
  }

  if (action === "claim") {
    showToast(`✋ הדיווח שוריין ליחידה ${activeUnitId} ("אני על זה")`);
  } else if (action === "approve") {
    showToast(`✅ האיסוף אושר ודרגת המדווח עודכנה!`);
  } else if (action === "reject") {
    showToast(`❌ הדיווח נדחה (${rejectionReason || "פסולת לא אורגנית"})`);
  }

  await loadAllSupabaseData(true);
};

window.openRejectModal = function (dropId) {
  if (!state.isAdmin && !state.isComposterOwner) return;
  const dialog = document.getElementById("dialog-reject-drop");
  const input = document.getElementById("reject-drop-id-input");
  if (input) input.value = dropId;
  if (dialog && typeof dialog.showModal === "function") {
    dialog.showModal();
  }
};

window.focusUnitOnMap = function (unitId) {
  const unit = state.units.find((u) => getUnitId(u) === unitId);
  if (!unit || !state.map) return;
  const lat = getUnitLat(unit);
  const lng = getUnitLng(unit);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    state.map.setView([lat, lng], 17, { animate: true });
  }
};

// Admin quick helpers (Guarded by state.isAdmin)
window.adminQuickStatus = function (unitId, newStatus) {
  if (!state.isAdmin) return;
  updateUnitInSupabase(unitId, { status: newStatus });
};

window.adminToggleUnitField = function (unitId, field, checked) {
  if (!state.isAdmin) return;
  updateUnitInSupabase(unitId, { [field]: Boolean(checked) });
};

window.adminSaveUnitNote = function (unitId) {
  if (!state.isAdmin) return;
  const input = document.getElementById(`admin-note-${unitId}`);
  if (!input) return;
  updateUnitInSupabase(unitId, { maintenance_notes: input.value.trim() });
};

window.adminSaveUnitPublicNote = function (unitId) {
  if (!state.isAdmin) return;
  const input = document.getElementById(`admin-pubnote-${unitId}`);
  if (!input) return;
  updateUnitInSupabase(
    unitId,
    { operator_public_note: input.value.trim() },
    `💬 הערה גלויה במפה נשמרה עבור ${unitId}`
  );
};

window.adminSelectUnitToManage = function (unitId) {
  if (state.currentUserProfile?.is_admin !== true || !state.isAdmin) return;
  // Strictly local state update only — never calls update on `users` table
  state.selectedUnitId = unitId;
  state.adminActAs = `unit:${unitId}`;
  state.activeAdminView = "owner";
  state.adminShowIot = false;
  state.stagedDirty = false;
  const select = document.getElementById("admin-act-as-select");
  if (select) select.value = state.adminActAs;
  setViewMode("owner");
  window.scrollTo({ top: 0, behavior: "smooth" });
};

// ============================================================================
// MASTER RENDER ORCHESTRATOR & EVENT LISTENERS
// ============================================================================

function renderAll() {
  if (!state.session) return;
  renderMapMarkers();
  if (state.currentMode === "trustee") {
    renderTrusteeView();
  } else if (state.currentMode === "owner") {
    renderOwnerView();
  } else if (state.currentMode === "admin") {
    renderOwnerView();
    renderAdminView();
  } else if (state.currentMode === "iot") {
    renderIotView();
  }
}

function bindUiEvents() {
  // 1a. Google OAuth Sign-In Button
  document.getElementById("btn-google-oauth")?.addEventListener("click", async () => {
    const googleBtn = document.getElementById("btn-google-oauth");
    const errorBox = document.getElementById("auth-error-box");
    errorBox?.classList.add("hidden");
    if (googleBtn) googleBtn.disabled = true;

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
    } catch (err) {
      console.error("Google OAuth Error:", err);
      if (errorBox) {
        errorBox.textContent =
          err.message || "אירעה שגיאה בהתחברות עם Google. נסה שוב.";
        errorBox.classList.remove("hidden");
      }
      if (googleBtn) googleBtn.disabled = false;
    }
  });

  // 1b. Magic Link / OTP Sign-In Form Submission
  document.getElementById("auth-magic-link-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById("auth-email-input");
    const submitBtn = document.getElementById("btn-send-magic-link");
    const submitText = document.getElementById("btn-send-magic-link-text");
    const confirmBox = document.getElementById("auth-confirmation-box");
    const errorBox = document.getElementById("auth-error-box");

    const email = emailInput?.value.trim();
    if (!email) return;

    confirmBox?.classList.add("hidden");
    errorBox?.classList.add("hidden");
    if (submitBtn) submitBtn.disabled = true;
    if (submitText) submitText.textContent = "שולח קישור כניסה...";

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin
        }
      });

      if (error) throw error;

      confirmBox?.classList.remove("hidden");
      if (submitText) submitText.textContent = "קישור נשלח למייל שלך ✓";
    } catch (err) {
      console.error("Magic Link Error:", err);
      if (errorBox) {
        errorBox.textContent =
          err.message || "אירעה שגיאה בשליחת קישור הכניסה. ודא שכתובת המייל תקינה ונסה שוב.";
        errorBox.classList.remove("hidden");
      }
      if (submitText) submitText.textContent = "שלח קישור כניסה למייל";
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // 2. Sign Out Button (`supabase.auth.signOut()`)
  document.getElementById("btn-sign-out")?.addEventListener("click", async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Error signing out:", err);
    }
    state.session = null;
    state.authUser = null;
    state.currentUserProfile = null;
    state.isAdmin = false;
    state.isComposterOwner = false;
    state.assignedUnitId = null;
    showAuthGateScreen();
    showToast("התנתקת מהמערכת בהצלחה");
  });

  // 3. Refresh button
  document.getElementById("btn-refresh-data")?.addEventListener("click", () => {
    loadAllSupabaseData(false);
    showToast("מרענן נתונים בזמן אמת מ-Supabase...");
  });

  // 4. Locate Me GPS button
  document.getElementById("btn-locate-me")?.addEventListener("click", () => {
    initGeolocation(true);
    if (state.map && state.userGps.detected) {
      state.map.setView([state.userGps.lat, state.userGps.lng], 16, { animate: true });
    }
  });

  // 5. Admin "פועל בשם..." Selector & IoT Telemetry Toggle (Admin only)
  // Updates ONLY the local in-memory `state.selectedUnitId` (and `state.adminActAs`)
  // and NEVER performs any `.update()` on the admin's row in the `users` table.
  document.getElementById("admin-act-as-select")?.addEventListener("change", (e) => {
    if (!state.isAdmin) return;
    state.adminActAs = e.target.value;
    state.stagedDirty = false;
    if (state.adminActAs.startsWith("unit:")) {
      state.selectedUnitId = state.adminActAs.replace("unit:", "");
    }
    renderAll();
  });

  document.getElementById("btn-admin-toggle-iot")?.addEventListener("click", (e) => {
    if (state.currentUserProfile?.is_admin !== true || !state.isAdmin) return;
    state.adminShowIot = !state.adminShowIot;
    const btn = e.currentTarget;
    if (state.adminShowIot) {
      btn.textContent = "🛡️ חזרה לתצוגה";
      setViewMode("iot");
    } else {
      btn.textContent = "🛰️ טלמטריית IoT";
      setViewMode(state.activeAdminView || "admin");
    }
  });

  // 5b. Street Organic Drops Filter & Sort Menu ("🔽 סינון")
  document.getElementById("btn-toggle-drops-filter")?.addEventListener("click", () => {
    const panel = document.getElementById("owner-drops-filter-panel");
    panel?.classList.toggle("hidden");
  });

  document.getElementById("owner-drops-filter-type")?.addEventListener("change", (e) => {
    state.dropsFilterMaterial = e.target.value || "all";
    renderAll();
  });

  document.getElementById("owner-drops-sort-by")?.addEventListener("change", (e) => {
    state.dropsSortBy = e.target.value || "distance";
    renderAll();
  });

  // 6. Trustee Multi-select Filter Chips (פסולת מטבח, ערימת עלים, דשא קצור)
  document.querySelectorAll(".trustee-filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const filterKey = chip.getAttribute("data-filter");
      if (!filterKey) return;

      if (state.trusteeFilters.has(filterKey)) {
        state.trusteeFilters.delete(filterKey);
        chip.classList.remove(
          "bg-orange-600",
          "bg-amber-700",
          "bg-emerald-600",
          "text-white"
        );
        chip.classList.add("bg-slate-100", "text-slate-600", "border-slate-300");
        const check = chip.querySelector(".chip-check");
        if (check) check.textContent = "";
      } else {
        state.trusteeFilters.add(filterKey);
        chip.classList.remove("bg-slate-100", "text-slate-600", "border-slate-300");
        const colorClass =
          filterKey === "kitchen"
            ? "bg-orange-600"
            : filterKey === "leaves"
              ? "bg-amber-700"
              : "bg-emerald-600";
        chip.classList.add(colorClass, "text-white");
        const check = chip.querySelector(".chip-check");
        if (check) check.textContent = "✓";
      }

      renderAll();
    });
  });

  // 7. Trustee Bottom Drawer Toggle
  document.getElementById("trustee-drawer-toggle")?.addEventListener("click", () => {
    const body = document.getElementById("trustee-drawer-body");
    const chevron = document.getElementById("trustee-drawer-chevron");
    if (!body) return;
    body.classList.toggle("hidden");
    if (chevron) {
      chevron.textContent = body.classList.contains("hidden") ? "▲" : "▼";
    }
  });

  // 8. Report Organic Drop Modal Openers (with Draggable Pin Mini-Map)
  const updateReportPinCoords = (lat, lng) => {
    state.reportPinLat = Number(lat.toFixed(6));
    state.reportPinLng = Number(lng.toFixed(6));
    const coordsEl = document.getElementById("report-dialog-coords");
    if (coordsEl) {
      coordsEl.textContent = `${state.reportPinLat.toFixed(5)}, ${state.reportPinLng.toFixed(5)}`;
    }
  };

  const initOrUpdateReportMiniMap = (lat, lng) => {
    const mapEl = document.getElementById("report-pin-map");
    if (!mapEl || typeof L === "undefined") return;

    if (!state.reportMiniMap) {
      const townMaxBounds = L.latLngBounds(
        [GEOFENCE_BOUNDS.minLat - 0.008, GEOFENCE_BOUNDS.minLng - 0.01],
        [GEOFENCE_BOUNDS.maxLat + 0.008, GEOFENCE_BOUNDS.maxLng + 0.01]
      );
      state.reportMiniMap = L.map("report-pin-map", {
        zoomControl: true,
        minZoom: 14,
        maxZoom: 19,
        maxBounds: townMaxBounds,
        maxBoundsViscosity: 0.85
      }).setView([lat, lng], 17);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap"
      }).addTo(state.reportMiniMap);

      state.reportPinMarker = L.marker([lat, lng], { draggable: true }).addTo(
        state.reportMiniMap
      );

      state.reportPinMarker.on("dragend", (ev) => {
        const pos = ev.target.getLatLng();
        updateReportPinCoords(pos.lat, pos.lng);
      });

      state.reportMiniMap.on("click", (ev) => {
        state.reportPinMarker.setLatLng(ev.latlng);
        updateReportPinCoords(ev.latlng.lat, ev.latlng.lng);
      });
    } else {
      state.reportMiniMap.setView([lat, lng], 17);
      state.reportPinMarker?.setLatLng([lat, lng]);
    }

    setTimeout(() => {
      state.reportMiniMap?.invalidateSize();
    }, 120);
  };

  const openReportDialog = () => {
    const dialog = document.getElementById("dialog-report-drop");
    const nameEl = document.getElementById("report-dialog-user-name");

    let activeReporterName = getUserName(state.currentUserProfile);
    if (state.isAdmin && state.adminActAs) {
      if (state.adminActAs.startsWith("user:")) {
        const usr = state.users.find(
          (u) => String(u.id) === state.adminActAs.replace("user:", "")
        );
        if (usr) activeReporterName = getUserName(usr);
      } else {
        activeReporterName = `${state.adminUserName} (${state.adminActAs.replace("unit:", "")})`;
      }
    }

    if (nameEl) nameEl.textContent = activeReporterName;

    updateReportPinCoords(state.userGps.lat, state.userGps.lng);

    if (dialog && typeof dialog.showModal === "function") {
      dialog.showModal();
    }

    initOrUpdateReportMiniMap(state.userGps.lat, state.userGps.lng);

    // Refresh high-accuracy GPS when opening report modal (if user hasn't dragged yet)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          state.userGps = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy || 15),
            detected: true
          };
          updateReportPinCoords(pos.coords.latitude, pos.coords.longitude);
          if (state.reportMiniMap && state.reportPinMarker) {
            state.reportMiniMap.setView([pos.coords.latitude, pos.coords.longitude], 17);
            state.reportPinMarker.setLatLng([pos.coords.latitude, pos.coords.longitude]);
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  };

  document.getElementById("btn-report-recenter-gps")?.addEventListener("click", () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.userGps = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 15),
          detected: true
        };
        updateReportPinCoords(pos.coords.latitude, pos.coords.longitude);
        if (state.reportMiniMap && state.reportPinMarker) {
          state.reportMiniMap.setView([pos.coords.latitude, pos.coords.longitude], 17);
          state.reportPinMarker.setLatLng([pos.coords.latitude, pos.coords.longitude]);
        }
        showToast("🎯 המיקום אופס למיקום ה-GPS המדויק שלך");
      },
      () => {
        showToast("לא ניתן לאתר GPS כרגע, גרור את הסיכה ידנית", true);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });

  document.getElementById("btn-report-current-gps")?.addEventListener("click", openReportDialog);
  document.getElementById("btn-owner-report-pile")?.addEventListener("click", openReportDialog);

  const closeReportDialog = () => {
    document.getElementById("dialog-report-drop")?.close();
  };
  document.getElementById("btn-close-report-dialog")?.addEventListener("click", closeReportDialog);
  document.getElementById("btn-cancel-report-dialog")?.addEventListener("click", closeReportDialog);

  // Submit New Organic Drop to Supabase `resource_drops` with `material_type` as `string[]` (`TEXT[]`)
  document.getElementById("form-report-drop")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("btn-confirm-report-drop");
    if (submitBtn?.disabled) return;

    const checkedBoxes = [
      ...document.querySelectorAll('input[name="drop_material_type"]:checked')
    ];
    const selectedTypes = checkedBoxes.map((cb) => String(cb.value).trim()).filter(Boolean);

    if (selectedTypes.length === 0) {
      showToast("אנא סמן לפחות סוג חומר אורגני אחד לדיווח", true);
      return;
    }

    const lat = Number((state.reportPinLat ?? state.userGps.lat).toFixed(6));
    const lng = Number((state.reportPinLng ?? state.userGps.lng).toFixed(6));

    // Geofencing check: Kochav Yair - Tzur Yigal boundaries only
    if (!isWithinGeofence(lat, lng)) {
      const geoMsg = "ניתן לדווח על חומר אורגני אך ורק בתוך תחומי כוכב יאיר - צור יגאל";
      showToast(geoMsg, true);
      alert(geoMsg);
      return;
    }

    const origBtnText = submitBtn ? submitBtn.textContent : "שלח דיווח למוקד (open)";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "שומר...";
      submitBtn.classList.add("opacity-70", "cursor-not-allowed");
    }

    try {
      // Resolve `reported_by_user_id` from authenticated user profile or session
      const reportedByUserId =
        state.currentUserProfile?.user_id ??
        state.currentUserProfile?.id ??
        state.authUser?.id ??
        null;

      // 48-hour expiration timestamp
      const expiresAtIso = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

      // Required fields: lat, lng, material_type ( strictly string[] ), status: 'open', reported_by_user_id, expires_at
      const payload = {
        lat,
        lng,
        material_type: selectedTypes, // Strictly string[] for TEXT[] column
        status: "open",
        reported_by_user_id: reportedByUserId,
        expires_at: expiresAtIso
      };

      const sampleDrop = state.resourceDrops[0] || state.activeResourceDrops[0] || {};
      if ("internal_estimated_kg" in sampleDrop) {
        const weightMap = { leaves: 15, grass: 18, kitchen: 6 };
        payload.internal_estimated_kg = selectedTypes.reduce(
          (sum, t) => sum + (weightMap[t] || 10),
          0
        );
      }

      const { error } = await supabase
        .from("resource_drops")
        .insert(payload);

      if (error) {
        const fullErrorDetail = [
          error.message,
          error.details ? `פרטים: ${error.details}` : "",
          error.hint ? `רמז: ${error.hint}` : "",
          error.code ? `(קוד: ${error.code})` : ""
        ]
          .filter(Boolean)
          .join(" | ");
        alert("שגיאה בשמירת הדיווח ב-Supabase:\n" + fullErrorDetail);
        console.error("Supabase resource_drops insert error:", error);
        showToast("שגיאה בשמירת הדיווח: " + fullErrorDetail, true);
        return;
      }

      closeReportDialog();
      const notesInput = document.getElementById("report-drop-notes");
      if (notesInput) notesInput.value = "";
      showToast("🌱 הדיווח נשמר ב-Supabase (זמין ל-48 שעות)!");
      await loadAllSupabaseData(true);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = origBtnText;
        submitBtn.classList.remove("opacity-70", "cursor-not-allowed");
      }
    }
  });

  // 9. Reject Modal Close & Submit
  const closeRejectDialog = () => {
    document.getElementById("dialog-reject-drop")?.close();
  };
  document.getElementById("btn-close-reject-dialog")?.addEventListener("click", closeRejectDialog);
  document.getElementById("btn-cancel-reject-dialog")?.addEventListener("click", closeRejectDialog);

  document.getElementById("form-reject-drop")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const dropId = document.getElementById("reject-drop-id-input")?.value;
    const reason =
      new FormData(e.target).get("reject_reason") || "פסולת לא אורגנית";
    closeRejectDialog();
    if (dropId) {
      await window.handleDropAction(dropId, "reject", reason);
    }
  });

  // 10. Owner Weighing Log Submit (Guarded by canCurrentUserModifyUnit + Double-submit lock)
  document.getElementById("owner-weighing-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("btn-submit-weighing");
    if (submitBtn?.disabled) return;

    const activeUnitId = getActiveManagedUnitId();
    if (!canCurrentUserModifyUnit(activeUnitId)) {
      showToast("אין לך הרשאה להזין שקילה לעמדה זו", true);
      return;
    }

    const kitchenInput = document.getElementById("input-kitchen-kg");
    const gardenInput = document.getElementById("input-garden-kg");

    const kitchenKg = parseFloat(kitchenInput?.value || "0") || 0;
    const gardenKg = parseFloat(gardenInput?.value || "0") || 0;

    if (kitchenKg <= 0 && gardenKg <= 0) {
      showToast("אנא הזן משקל מטבח או גזם גדול מ-0", true);
      return;
    }

    const origBtnText = submitBtn ? submitBtn.textContent : "💾 שמור שקילה ביומן השקילות";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "שומר...";
      submitBtn.classList.add("opacity-70", "cursor-not-allowed");
    }

    const sampleLog = state.weighingLogs[0] || {};
    const payload = {
      unit_id: activeUnitId
    };

    if ("kitchen_kg" in sampleLog || !("kitchen_waste_kg" in sampleLog)) {
      payload.kitchen_kg = kitchenKg;
    }
    if ("kitchen_waste_kg" in sampleLog) {
      payload.kitchen_waste_kg = kitchenKg;
    }
    if ("garden_kg" in sampleLog || !("garden_waste_kg" in sampleLog)) {
      payload.garden_kg = gardenKg;
    }
    if ("garden_waste_kg" in sampleLog) {
      payload.garden_waste_kg = gardenKg;
    }

    try {
      const { error: weighErr } = await supabase
        .from("weighing_logs")
        .insert(payload);
      if (weighErr) throw weighErr;
      if (kitchenInput) kitchenInput.value = "";
      if (gardenInput) gardenInput.value = "";
      flashOwnerSaveFeedback();
      showToast(`⚖️ שקילה חדשה נשמרה עבור ${activeUnitId}!`);
      await loadAllSupabaseData(true);
    } catch (err) {
      console.error("Failed to insert weighing_log:", err);
      showToast("שגיאה בשמירת השקילה ב-Supabase", true);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = origBtnText;
        submitBtn.classList.remove("opacity-70", "cursor-not-allowed");
      }
    }
  });

  // 11. Unified Status & Health Controls (Dedicated Save Button)
  document.querySelectorAll(".owner-status-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const statusVal = btn.getAttribute("data-status-val");
      if (!statusVal) return;
      state.stagedStatus = statusVal;
      state.stagedDirty = true;
      renderStagedStatusButtons();
    });
  });

  const bindStagedSlider = (sliderId, labelId, stateKey) => {
    const slider = document.getElementById(sliderId);
    const label = document.getElementById(labelId);
    if (!slider) return;
    slider.addEventListener("input", () => {
      const val = parseInt(slider.value, 10) || 3;
      state[stateKey] = val;
      state.stagedDirty = true;
      if (label) label.textContent = `${val} / 5`;
    });
  };

  bindStagedSlider("owner-slider-temp", "owner-temp-val-label", "stagedTemp");
  bindStagedSlider("owner-slider-moisture", "owner-moisture-val-label", "stagedMoisture");
  bindStagedSlider("owner-slider-volume", "owner-volume-val-label", "stagedVolume");

  document.getElementById("btn-save-status-and-health")?.addEventListener("click", async () => {
    const unitId = getActiveManagedUnitId();
    const patch = {
      status: state.stagedStatus || "A",
      temp_level: state.stagedTemp ?? 3,
      moisture_level: state.stagedMoisture ?? 3,
      volume_level: state.stagedVolume ?? 3
    };
    state.stagedDirty = false;
    const ok = await updateUnitInSupabase(
      unitId,
      patch,
      `✅ סטטוס ובריאות הערימה (${unitId}) נשמרו בהצלחה!`
    );
    if (ok) {
      flashHealthSavedBadge();
    }
  });

  // 12. Operator Public Note ("הערה אישית גלויה במפה" -> operator_public_note)
  document.getElementById("btn-save-operator-public-note")?.addEventListener("click", () => {
    const pubNote =
      document.getElementById("owner-operator-public-note")?.value.trim() || "";
    updateUnitInSupabase(
      getActiveManagedUnitId(),
      { operator_public_note: pubNote },
      "💬 ההערה האישית הגלויה במפה נשמרה ב-Supabase!"
    );
  });

  // Save Maintenance Notes
  document.getElementById("btn-save-maintenance-notes")?.addEventListener("click", () => {
    const notes = document.getElementById("owner-maintenance-notes")?.value.trim() || "";
    updateUnitInSupabase(
      getActiveManagedUnitId(),
      { maintenance_notes: notes },
      "🛠️ הערות התחזוקה עודכנו ב-Supabase!"
    );
  });

  // 13. 3 Acceptance Toggles: accepting_carbon, accepting_nitrogen, accepting_kitchen
  const bindToggle = (checkboxId, fieldName) => {
    const cb = document.getElementById(checkboxId);
    if (!cb) return;
    cb.addEventListener("change", () => {
      updateUnitInSupabase(getActiveManagedUnitId(), { [fieldName]: cb.checked });
    });
  };

  bindToggle("toggle-accepting-carbon", "accepting_carbon");
  bindToggle("toggle-accepting-nitrogen", "accepting_nitrogen");
  bindToggle("toggle-accepting-kitchen", "accepting_kitchen");
}

// ============================================================================
// BOOTSTRAP PWA, SUPABASE AUTH SESSION CHECK & REAL-TIME SYNC
// ============================================================================

let lastHandledAuthAccessToken = null;

async function handleAuthSessionChange(session) {
  const nextToken = session?.access_token || null;
  if (session && session.user && nextToken && nextToken === lastHandledAuthAccessToken) {
    state.session = session;
    state.authUser = session.user;
    return;
  }

  state.session = session || null;
  state.authUser = session?.user || null;

  if (!state.session || !state.authUser) {
    lastHandledAuthAccessToken = null;
    showAuthGateScreen();
    return;
  }

  lastHandledAuthAccessToken = nextToken;
  showAuthenticatedAppShell();
  await loadAllSupabaseData(false);
}

function getOAuthErrorFromUrl() {
  const searchParams = new URLSearchParams(window.location.search || "");
  const hashStr = (window.location.hash || "").replace(/^#/, "");
  const hashParams = new URLSearchParams(hashStr);
  const error = searchParams.get("error") || hashParams.get("error");
  const errorDesc =
    searchParams.get("error_description") || hashParams.get("error_description");
  if (!error && !errorDesc) return null;
  return errorDesc || error;
}

document.addEventListener("DOMContentLoaded", async () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => { });
  }

  bindUiEvents();

  const urlAuthError = getOAuthErrorFromUrl();
  if (urlAuthError) {
    const errorBox = document.getElementById("auth-error-box");
    if (errorBox) {
      errorBox.textContent = `שגיאת התחברות: ${urlAuthError}`;
      errorBox.classList.remove("hidden");
    }
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // Wait for Supabase Auth to finish parsing URL hash/code and restoring session
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    await handleAuthSessionChange(data?.session || null);
  } catch (err) {
    console.error("Failed to check Supabase Auth session:", err);
    const errorBox = document.getElementById("auth-error-box");
    if (errorBox && err?.message) {
      errorBox.textContent = `שגיאת התחברות: ${err.message}`;
      errorBox.classList.remove("hidden");
    }
    showAuthGateScreen();
  }

  // Subscribe to subsequent auth state changes (Google OAuth / Magic Link / Sign-in / Sign-out)
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION") return;
    if (event === "TOKEN_REFRESHED" && session) {
      state.session = session;
      state.authUser = session.user;
      lastHandledAuthAccessToken = session.access_token || null;
      return;
    }
    handleAuthSessionChange(session);
  });
});
