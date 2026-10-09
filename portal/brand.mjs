/** Reusable, text-based Adplix Media lockup for the portal. */
export function portalBrand(variant = 'auth') {
  if (variant !== 'auth' && variant !== 'sidebar') {
    throw new TypeError('Unsupported portal brand variant');
  }

  return `<div class="portal-brand portal-brand--${variant}"><img class="portal-brand-mark" src="/images/adplix-logo-small.jpg" width="128" height="128" alt=""><span class="portal-brand-name">Adplix <span class="portal-brand-media">Media</span></span></div>`;
}
