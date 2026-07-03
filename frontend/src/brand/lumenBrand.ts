import lumenLogoUrl from "../../../assets/brand/lumen-logo.svg?url";
import lumenWordmarkUrl from "../../../assets/brand/lumen-wordmark.webp?url";

export const lumenBrand = {
  name: "Lumen",
  logoUrl: lumenLogoUrl,
  wordmarkUrl: lumenWordmarkUrl
};

export function ensureLumenFavicon(href = lumenLogoUrl) {
  const existingIcon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  const icon = existingIcon ?? document.createElement("link");

  icon.rel = "icon";
  icon.type = "image/svg+xml";
  icon.href = href;

  if (!existingIcon) {
    document.head.appendChild(icon);
  }
}
