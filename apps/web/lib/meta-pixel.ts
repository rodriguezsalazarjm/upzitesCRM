export const META_PIXEL_CONSENT_KEY = "upz-cookies";
export const META_PIXEL_CONSENT_EVENT = "upz-cookie-consent";

type MetaPixelCommand =
  | "init"
  | "track"
  | "trackCustom"
  | "trackSingle"
  | "trackSingleCustom"
  | "consent";

type MetaPixelValue = string | number | boolean | null | undefined;
type MetaPixelObject = {
  [key: string]: MetaPixelValue | MetaPixelObject | MetaPixelObject[] | MetaPixelValue[];
};

export type MetaPixelParams = MetaPixelObject;

export type EcommerceContent = {
  id: string;
  quantity: number;
};

export type EcommerceEventParams = {
  content_ids?: string[];
  contents?: EcommerceContent[];
  content_type: "product";
  value?: number;
  currency?: string;
};

export type SearchEventParams = {
  search_string: string;
  content_ids?: string[];
  value?: number;
  currency?: string;
};

export type LeadEventParams = {
  value?: number;
  currency?: string;
};

declare global {
  interface Window {
    fbq?: (
      command: MetaPixelCommand,
      ...args: [string] | [string, MetaPixelParams] | [string, string, MetaPixelParams?]
    ) => void;
    _fbq?: Window["fbq"];
  }
}

export function getMetaPixelIds(): string[] {
  const ids = [
    process.env.NEXT_PUBLIC_META_PIXEL_ID,
    ...(process.env.NEXT_PUBLIC_META_PIXEL_IDS?.split(",") ?? []),
  ];

  return Array.from(new Set(ids.map((id) => id?.trim()).filter(Boolean) as string[]));
}

export function requiresMetaPixelConsent(): boolean {
  return process.env.NEXT_PUBLIC_META_PIXEL_REQUIRE_CONSENT === "true";
}

export function hasMetaPixelConsent(): boolean {
  if (typeof window === "undefined") return false;
  if (!requiresMetaPixelConsent()) return true;

  try {
    return window.localStorage.getItem(META_PIXEL_CONSENT_KEY) === "accepted";
  } catch {
    return false;
  }
}

export function syncMetaPixelConsent(granted: boolean) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;

  try {
    window.fbq("consent", granted ? "grant" : "revoke");
  } catch (error) {
    if (isDevelopment()) {
      console.warn("[meta-pixel] consent sync failed", error);
    }
  }
}

function isDevelopment() {
  return process.env.NODE_ENV === "development";
}

function logSkipped(message: string) {
  if (isDevelopment()) {
    console.info(`[meta-pixel] ${message}`);
  }
}

function canTrack(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.fbq !== "function") {
    logSkipped("fbq is not available yet");
    return false;
  }
  if (!getMetaPixelIds().length) {
    logSkipped("no pixel id configured");
    return false;
  }
  if (!hasMetaPixelConsent()) {
    logSkipped("waiting for cookie consent");
    return false;
  }
  return true;
}

function isValidCurrency(currency?: string): boolean {
  return !currency || /^[A-Z]{3}$/.test(currency);
}

function isValidValue(value?: number): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function isValidContentIds(contentIds?: string[]): boolean {
  return (
    contentIds === undefined ||
    (Array.isArray(contentIds) && contentIds.every((id) => typeof id === "string" && id.length > 0))
  );
}

function isValidContents(contents?: EcommerceContent[]): boolean {
  return (
    contents === undefined ||
    (Array.isArray(contents) &&
      contents.every(
        (item) =>
          typeof item.id === "string" &&
          item.id.length > 0 &&
          typeof item.quantity === "number" &&
          Number.isFinite(item.quantity) &&
          item.quantity > 0
      ))
  );
}

export function validateEcommerceParams(params: EcommerceEventParams): boolean {
  const hasProductIds = Boolean(params.content_ids?.length || params.contents?.length);

  return (
    params.content_type === "product" &&
    hasProductIds &&
    isValidContentIds(params.content_ids) &&
    isValidContents(params.contents) &&
    isValidValue(params.value) &&
    isValidCurrency(params.currency)
  );
}

function safeTrack(callback: () => void) {
  if (!canTrack()) return;

  try {
    callback();
  } catch (error) {
    if (isDevelopment()) {
      console.warn("[meta-pixel] tracking failed", error);
    }
  }
}

export function pageview(params?: MetaPixelParams) {
  safeTrack(() => window.fbq?.("track", "PageView", params ?? {}));
}

export function event(name: string, params?: MetaPixelParams) {
  if (!name) return;
  safeTrack(() => window.fbq?.("track", name, params ?? {}));
}

export const trackEvent = event;

export function customEvent(name: string, params?: MetaPixelParams) {
  if (!name || name.length > 50) {
    logSkipped("invalid custom event name");
    return;
  }

  safeTrack(() => window.fbq?.("trackCustom", name, params ?? {}));
}

export const trackCustomEvent = customEvent;

export function trackSingle(pixelId: string, eventName: string, params?: MetaPixelParams) {
  if (!pixelId || !eventName) return;
  safeTrack(() => window.fbq?.("trackSingle", pixelId, eventName, params ?? {}));
}

export function trackSingleCustom(pixelId: string, eventName: string, params?: MetaPixelParams) {
  if (!pixelId || !eventName || eventName.length > 50) return;
  safeTrack(() => window.fbq?.("trackSingleCustom", pixelId, eventName, params ?? {}));
}

export function viewContent(params: EcommerceEventParams) {
  if (validateEcommerceParams(params)) event("ViewContent", params);
}

export function trackViewContent(params: MetaPixelParams = {}) {
  event("ViewContent", params);
}

export function addToCart(params: EcommerceEventParams) {
  if (validateEcommerceParams(params)) event("AddToCart", params);
}

export const trackAddToCart = addToCart;

export function initiateCheckout(params: EcommerceEventParams) {
  if (validateEcommerceParams(params)) event("InitiateCheckout", params);
}

export const trackInitiateCheckout = initiateCheckout;

export function purchase(orderId: string, params: EcommerceEventParams) {
  if (!orderId || !validateEcommerceParams(params) || typeof window === "undefined") return;

  const storageKey = `meta-pixel-purchase:${orderId}`;
  try {
    if (window.sessionStorage.getItem(storageKey)) return;
    event("Purchase", params);
    window.sessionStorage.setItem(storageKey, "tracked");
  } catch {
    event("Purchase", params);
  }
}

export const trackPurchase = purchase;

export function search(params: SearchEventParams) {
  if (!params.search_string || !isValidContentIds(params.content_ids)) return;
  if (!isValidValue(params.value) || !isValidCurrency(params.currency)) return;
  event("Search", params);
}

export const trackSearch = search;

export function lead(params: LeadEventParams = {}) {
  if (!isValidValue(params.value) || !isValidCurrency(params.currency)) return;
  event("Lead", params);
}

export const trackLead = lead;

export function trackContact(params: MetaPixelParams = {}) {
  event("Contact", params);
}

export function trackSchedule(params: MetaPixelParams = {}) {
  event("Schedule", params);
}

export function trackCompleteRegistration(params: MetaPixelParams = {}) {
  event("CompleteRegistration", params);
}

export function trackAddToWishlist(params: MetaPixelParams = {}) {
  event("AddToWishlist", params);
}

export function trackAddPaymentInfo(params: MetaPixelParams = {}) {
  event("AddPaymentInfo", params);
}

export function trackSubscribe(params: MetaPixelParams = {}) {
  event("Subscribe", params);
}

export function trackStartTrial(params: MetaPixelParams = {}) {
  event("StartTrial", params);
}

export function trackSubmitApplication(params: MetaPixelParams = {}) {
  event("SubmitApplication", params);
}

export function trackFindLocation(params: MetaPixelParams = {}) {
  event("FindLocation", params);
}

export function trackCustomizeProduct(params: MetaPixelParams = {}) {
  event("CustomizeProduct", params);
}

export function trackDonate(params: MetaPixelParams = {}) {
  event("Donate", params);
}
