export const PUBLIC_ANALYTICS_PATHS = new Set(["/", "/what-is-swag", "/members", "/activities"]);

export const isPublicAnalyticsPath = (pathname: string) => PUBLIC_ANALYTICS_PATHS.has(pathname);

const GA_ID = "G-XWLSRFZ2VG";
const CLARITY_ID = "yof0noc3yn";

declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
    clarity?: ((...args: unknown[]) => void) & { q?: unknown[][] };
  }
}

function loadGoogleAnalytics() {
  if (document.getElementById("swag-ga-script")) return;

  const script = document.createElement("script");
  script.id = "swag-ga-script";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = (...args: unknown[]) => window.dataLayer?.push(args);
  window.gtag("js", new Date());
  // Automatic page views are disabled; PublicAnalytics sends pathname-only views.
  window.gtag("config", GA_ID, { send_page_view: false });
}

function loadClarity() {
  window.clarity =
    window.clarity ??
    Object.assign(
      (...args: unknown[]) => {
        window.clarity!.q = window.clarity!.q ?? [];
        window.clarity!.q.push(args);
      },
      { q: [] as unknown[][] },
    );

  if (document.getElementById("swag-clarity-script")) return;
  const script = document.createElement("script");
  script.id = "swag-clarity-script";
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${CLARITY_ID}`;
  document.head.appendChild(script);
}

export function trackPublicPath(pathname: string) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  if (!isPublicAnalyticsPath(pathname)) {
    // If a session leaves the public site, opt it out of Clarity recording.
    window.clarity?.("consent", false);
    return;
  }

  loadGoogleAnalytics();
  loadClarity();
  window.clarity?.("consent", true);
  window.gtag?.("event", "page_view", {
    page_path: pathname,
    page_location: `${window.location.origin}${pathname}`,
  });
}
