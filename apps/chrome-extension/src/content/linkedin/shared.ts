// names that the page-world script and the extension script must agree on

export const MENU_BUTTON_SELECTOR =
  'button[aria-label^="Open control menu for post by "]';
export const POST_SELECTOR = '[role="listitem"], main';
export const POST_URN = /urn:li:(activity|ugcPost|share):\d+/;
// the page-world script writes the post urn here, on the menu button
export const URN_ATTRIBUTE = "data-vmem-urn";
