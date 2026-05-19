const VERSION = "farm-offline-v4-2026-05-13";
const APP_CACHE = `${VERSION}-app-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime-assets`;
const API_CACHE = `${VERSION}-api-responses`;

const APP_SHELL_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/manifest.webmanifest",
  "/site.webmanifest",
];

const API_TIMEOUT_MS = 4500;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE);

      await Promise.allSettled(
        APP_SHELL_URLS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => null)
        )
      );

      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const allowed = new Set([APP_CACHE, RUNTIME_CACHE, API_CACHE]);
      const names = await caches.keys();

      await Promise.all(
        names.map((name) => {
          if (allowed.has(name)) return null;
          return caches.delete(name);
        })
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (isApiRequest(url)) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  if (isStaticAsset(url, request)) {
    event.respondWith(handleStaticAsset(request));
    return;
  }

  event.respondWith(handleRuntimeRequest(request));
});

function isApiRequest(url) {
  return (
    url.pathname.startsWith("/api/") ||
    (url.hostname === "localhost" &&
      url.port === "4000" &&
      url.pathname.startsWith("/api/")) ||
    (url.hostname === "127.0.0.1" &&
      url.port === "4000" &&
      url.pathname.startsWith("/api/"))
  );
}

function isStaticAsset(url, request) {
  const destination = request.destination;

  if (["script", "style", "image", "font", "manifest"].includes(destination)) {
    return true;
  }

  return /\.(?:js|css|png|jpg|jpeg|svg|webp|gif|ico|woff2?|ttf|otf)$/i.test(
    url.pathname
  );
}

async function handleNavigation(request) {
  const appCache = await caches.open(APP_CACHE);

  try {
    const response = await fetch(request);

    if (response && response.ok) {
      await appCache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cachedRequest = await caches.match(request);
    if (cachedRequest) return cachedRequest;

    const cachedIndex = await caches.match("/index.html");
    if (cachedIndex) return cachedIndex;

    const cachedRoot = await caches.match("/");
    if (cachedRoot) return cachedRoot;

    return new Response(
      `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Farm Expense Tracker Offline</title>
    <style>
      body {
        font-family: system-ui, -apple-system, Segoe UI, sans-serif;
        margin: 0;
        background: #f7f2e8;
        color: #1f2a1f;
        display: grid;
        place-items: center;
        min-height: 100vh;
        padding: 24px;
        text-align: center;
      }

      .box {
        max-width: 420px;
        background: white;
        border-radius: 24px;
        padding: 26px;
        box-shadow: 0 14px 40px rgba(0, 0, 0, 0.12);
      }

      h1 {
        font-size: 22px;
        margin: 0 0 10px;
      }

      p {
        line-height: 1.5;
        margin: 0;
        color: #536253;
      }
    </style>
  </head>

  <body>
    <div class="box">
      <h1>Offline mode is not ready yet</h1>
      <p>Open the app once with internet so the offline files can be saved, then try again.</p>
    </div>
  </body>
</html>`,
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
        status: 503,
      }
    );
  }
}

async function handleApiRequest(request) {
  const apiCache = await caches.open(API_CACHE);
  const cacheKey = await buildAccountScopedApiCacheKey(request);

  try {
    const response = await fetchWithTimeout(request, API_TIMEOUT_MS);

    if (response && response.ok) {
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json") || contentType.includes("text/")) {
        await apiCache.put(cacheKey, response.clone());
      }
    }

    return response;
  } catch (error) {
    const cached = await apiCache.match(cacheKey);

    if (cached) {
      return addOfflineHeaders(cached);
    }

    return new Response(
      JSON.stringify({
        offline: true,
        message:
          "No cached data found for this account yet. Open this page once with internet, then it will work offline.",
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "X-Farm-Offline": "true",
          "Cache-Control": "no-store",
        },
      }
    );
  }
}

async function handleStaticAsset(request) {
  const cached = await caches.match(request);

  if (cached) return cached;

  try {
    const response = await fetch(request);

    if (response && response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    return cached || Response.error();
  }
}

async function handleRuntimeRequest(request) {
  const cache = await caches.open(RUNTIME_CACHE);

  try {
    const response = await fetch(request);

    if (response && response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cached = await cache.match(request);
    return cached || Response.error();
  }
}

function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return fetch(request, {
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timeout);
  });
}

async function buildAccountScopedApiCacheKey(request) {
  const url = new URL(request.url);

  url.searchParams.sort();

  const authHeader = request.headers.get("authorization") || "";
  const accountKey = authHeader ? await shortHash(authHeader) : "guest";

  url.searchParams.set("__farm_account_cache", accountKey);

  return new Request(url.toString(), {
    method: "GET",
    headers: {
      Accept: request.headers.get("accept") || "application/json",
    },
  });
}

async function shortHash(value) {
  try {
    const data = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const bytes = Array.from(new Uint8Array(digest));

    return bytes
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 20);
  } catch (error) {
    let hash = 0;

    for (let i = 0; i < value.length; i += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
      hash |= 0;
    }

    return `fallback-${Math.abs(hash)}`;
  }
}

async function addOfflineHeaders(response) {
  const body = await response.clone().arrayBuffer();
  const headers = new Headers(response.headers);

  headers.set("X-Farm-Offline", "true");
  headers.set("X-Farm-Offline-Source", "service-worker-cache");
  headers.set("Cache-Control", "no-store");

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}