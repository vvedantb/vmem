/**
 * CSS for the screenshot overlay's Shadow DOM. Kept as a single tagged
 * template string so the content script can attach it without an external
 * fetch. Selectors here are scoped to the shadow root, so :host applies to
 * the <vmem-screenshot-overlay> custom element.
 */

export const overlayCss = `
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&display=swap');

  :host { all: initial; }

  /* Full-viewport scrim shown during the drag. Uses inset:0 with fixed
     positioning so we cover the visible area exactly. */
  #scrim {
    position: fixed;
    inset: 0;
    background: rgba(15, 15, 18, 0.35);
    cursor: crosshair;
    pointer-events: auto;
    font-family: 'Instrument Sans', system-ui, -apple-system, sans-serif;
    user-select: none;
    -webkit-user-select: none;
    display: none;
  }
  #scrim.active { display: block; }

  /* Hint pill telling the user what to do. Centred at top. */
  #hint {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(24, 24, 28, 0.92);
    color: #e4e4e7;
    padding: 8px 14px;
    border-radius: 99px;
    font-size: 13px;
    font-weight: 500;
    pointer-events: none;
    backdrop-filter: blur(8px);
  }

  /* The selection rectangle. Drawn with a punched-out look using a thick
     box-shadow that covers the rest of the scrim - the rect itself stays
     transparent so the user sees what they're cropping. */
  #rect {
    position: fixed;
    border: 1.5px solid #ffffff;
    box-shadow: 0 0 0 9999px rgba(15, 15, 18, 0.4);
    pointer-events: none;
    display: none;
  }
  #rect.active { display: block; }

  /* Preview popup. Same visual language as selection popup but pill-shaped
     and wider to fit thumbnail + input + Save. */
  #preview {
    position: fixed;
    display: none;
    align-items: center;
    gap: 10px;
    pointer-events: auto;
    box-sizing: border-box;
    padding: 8px 8px 8px 8px;
    border: 1px solid transparent;
    border-radius: 14px;
    background: #ebebee;
    color: #2a2a2f;
    box-shadow: 0 1px 3px rgba(16, 24, 40, 0.1), 0 12px 32px rgba(16, 24, 40, 0.12);
    font-family: 'Instrument Sans', system-ui, -apple-system, sans-serif;
    opacity: 0;
    transform: translateY(4px);
    transition: opacity 200ms cubic-bezier(0.22, 1, 0.36, 1),
                transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
    user-select: none;
    -webkit-user-select: none;
    max-width: 420px;
  }
  #preview.visible { display: flex; opacity: 1; transform: translateY(0); }

  #preview img.thumb {
    width: 56px;
    height: 56px;
    object-fit: cover;
    border-radius: 8px;
    background: #d4d4d8;
    flex-shrink: 0;
  }

  #preview input.caption {
    flex: 1 1 auto;
    min-width: 160px;
    border: none;
    outline: none;
    background: transparent;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    color: inherit;
    padding: 6px 4px;
  }
  #preview input.caption::placeholder {
    color: rgba(42, 42, 47, 0.5);
  }

  #preview button.save {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: none;
    background: #18181b;
    color: #fafafa;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    padding: 8px 12px;
    border-radius: 10px;
    cursor: pointer;
    transition: background 160ms ease, transform 100ms ease;
  }
  #preview button.save:hover { background: #27272a; }
  #preview button.save:active { transform: scale(0.97); }
  #preview button.save:disabled { opacity: 0.6; cursor: default; }

  #preview .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
  }

  /* States piggyback on the save button - replace its content + tone. */
  #preview.state-saving button.save {
    background: #3f3f46;
  }
  #preview.state-success button.save {
    background: #16a34a;
  }
  #preview.state-error button.save {
    background: #dc2626;
  }

  @keyframes vmem-spin { to { transform: rotate(360deg); } }
  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(250,250,250,0.4);
    border-top-color: #fafafa;
    border-radius: 50%;
    animation: vmem-spin 600ms linear infinite;
  }

  @media (prefers-color-scheme: dark) {
    #preview {
      background: rgba(38, 38, 42, 0.95);
      color: #e4e4e7;
      border-color: rgba(255,255,255,0.08);
      box-shadow: 0 1px 3px rgba(0,0,0,0.3), 0 12px 32px rgba(0,0,0,0.35);
    }
    #preview input.caption::placeholder { color: rgba(228,228,231,0.45); }
    #preview button.save { background: #fafafa; color: #18181b; }
    #preview button.save:hover { background: #ffffff; }
    #preview.state-saving button.save { background: #52525b; color: #fafafa; }
  }
`;
