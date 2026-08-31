/**
 * X/Twitter reutiliza exactamente la misma pieza que Open Graph. Se declaran los
 * exports de forma explicita (en vez de un `export ... from`) para que Next lea
 * `alt`, `size` y `contentType` sin depender de como resuelva los re-exports.
 */
import OpengraphImage, {
  alt as ogAlt,
  size as ogSize,
  contentType as ogContentType,
} from "./opengraph-image";

export const alt = ogAlt;
export const size = ogSize;
export const contentType = ogContentType;

export default OpengraphImage;
