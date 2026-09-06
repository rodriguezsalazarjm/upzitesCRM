import { NextResponse, type NextRequest } from "next/server";

/**
 * Anti-hotlinking (Next 16 "Proxy", antes Middleware).
 *
 * Impide que OTROS sitios incrusten directamente las imágenes de upzites.com
 * (eso te roba ancho de banda y exposición). Solo afecta a peticiones de IMAGEN
 * cuyo `Referer` pertenece a otro dominio. Casos que se dejan pasar a propósito:
 *  - Acceso directo a la imagen (sin Referer).
 *  - Mismo dominio o subdominios de upzites.com (uso legítimo del propio sitio).
 *  - Crawlers sociales (Open Graph), que no envían Referer.
 *
 * No es un candado absoluto —en la web nada lo es— pero corta el hotlinking real.
 */
const IMAGE_RE = /\.(?:png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i;

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isImage = IMAGE_RE.test(pathname) || pathname.startsWith("/_next/image");
  if (!isImage) return NextResponse.next();

  const referer = req.headers.get("referer");
  if (!referer) return NextResponse.next();

  try {
    const refHost = new URL(referer).hostname;
    const host = req.nextUrl.hostname;
    const sameSite =
      refHost === host ||
      refHost === "upzites.com" ||
      refHost.endsWith(".upzites.com");
    if (!sameSite) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  } catch {
    // Referer malformado: no bloquear.
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next/static|favicon.ico|robots.txt).*)",
};
