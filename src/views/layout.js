const { escapeHtml, escapeAttr } = require('../utils');

const SHARED_STYLE = `
  :root{
    --bg:oklch(98% 0.015 95); --surface:oklch(99% 0.006 95); --surface-2:oklch(96% 0.02 95);
    --text:oklch(22% 0.02 260); --text-muted:oklch(48% 0.02 260); --border:oklch(90% 0.012 95);
    --green:oklch(58% 0.15 152); --green-dark:oklch(46% 0.14 152); --green-soft:oklch(94% 0.05 152);
    --orange:oklch(72% 0.17 55); --orange-dark:oklch(58% 0.17 45); --orange-soft:oklch(94% 0.06 55);
    --orange-mid:oklch(87% 0.09 55);
    --sidebar:oklch(24% 0.03 255);
    /* Deliberately darker than --surface-2 so meter tracks and other inset
       shapes stay visible on hovered rows. */
    --track:oklch(89% 0.022 95);
    /* One shadow + radius scale used everywhere, so depth reads consistently
       instead of every component inventing its own values. */
    --shadow-sm:0 1px 2px oklch(22% 0.02 260 / 0.05), 0 1px 3px oklch(22% 0.02 260 / 0.06);
    --shadow-md:0 4px 6px -2px oklch(22% 0.02 260 / 0.06), 0 10px 20px -6px oklch(22% 0.02 260 / 0.10);
    --shadow-lg:0 8px 12px -4px oklch(22% 0.02 260 / 0.07), 0 20px 40px -12px oklch(22% 0.02 260 / 0.16);
    --radius-sm:10px; --radius-md:14px; --radius-lg:20px; --radius-xl:28px;
  }
  *{box-sizing:border-box;}
  html{scroll-behavior:smooth;}
  html,body{margin:0;padding:0;}
  body{font-family:'Work Sans',sans-serif;background:var(--bg);color:var(--text);
    line-height:1.6;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;}
  h1,h2,h3,h4{font-family:'Plus Jakarta Sans',sans-serif;margin:0;line-height:1.25;letter-spacing:-0.02em;}
  h1{letter-spacing:-0.03em;}
  /* Prices, counts and quantities line up in columns when digits share a width. */
  .tnum, input[type="number"]{font-variant-numeric:tabular-nums;}
  ::selection{background:var(--orange-soft);color:var(--orange-dark);}
  /* Interactive accents are warm (orange = the brand's action colour). Green
     is reserved for *static* meaning — prices, "in stock", success — so it
     never appears as a hover state. */
  a{color:var(--orange-dark);text-decoration:none;}
  a:hover{text-decoration:underline;text-underline-offset:3px;}
  button{font-family:inherit;cursor:pointer;transition:background 0.18s ease, color 0.18s ease, border-color 0.18s ease, transform 0.15s ease, box-shadow 0.18s ease;}
  label{font-size:13.5px;font-weight:600;color:var(--text);display:block;margin-bottom:8px;}
  .req{color:#c94f4f;}
  :focus-visible{outline:2.5px solid var(--orange);outline-offset:2px;border-radius:4px;}
  /* Keyboard users can jump straight past the header nav. Off-screen until
     focused, which is the standard pattern. */
  .skip-link{position:absolute;left:-9999px;top:0;z-index:200;background:var(--green);color:#fff;
    padding:12px 20px;border-radius:0 0 10px 0;font-size:14px;font-weight:700;}
  .skip-link:focus{left:0;text-decoration:none;}
  /* Anything marked as decorative is hidden from assistive tech, and visually
     hidden text is available to it. */
  .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
    clip:rect(0,0,0,0);white-space:nowrap;border:0;}
  /* Printing an order or a report shouldn't carry the chrome with it. */
  @media print{
    .site-header, .site-header-grid, .admin-sidebar, .admin-topbar, footer,
    .back-btn, .skip-link, .chip, form[method="get"]{display:none !important;}
    body{background:#fff;}
    .card, .adm-table{box-shadow:none;border-color:#ddd;break-inside:avoid;}
    a{color:inherit;text-decoration:none;}
    .admin-main{padding:0;}
  }
  input, textarea, select{
    width:100%;border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:13px 15px;
    font-family:'Work Sans',sans-serif;font-size:14.5px;color:var(--text);background:var(--surface);outline:none;
    transition:border-color 0.18s ease;
  }
  /* The native select arrow is drawn by the OS at the very edge of the box and
     nothing reserves room for it, so long option text ran underneath it and it
     read as sitting outside the field. Draw our own and always keep 38px of
     padding clear on the right for it. */
  select{
    appearance:none;-webkit-appearance:none;-moz-appearance:none;
    padding-right:38px !important;cursor:pointer;
    background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23555f6d' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat:no-repeat;background-position:right 14px center;background-size:11px 8px;
    text-overflow:ellipsis;
  }
  select::-ms-expand{display:none;}
  /* Fixed-size round things (avatars, steppers, toggles, step numbers) are
     flex children with an explicit width. Without this a narrow phone squashes
     them to a sliver — which is why icons looked like they'd gone missing
     rather than merely got smaller. */
  .account-avatar, .toggle-pill, .toggle-dot, .step-num, .tier-card-num,
  .add-btn, .step-btn, .qty-stepper button, .stamp-slot, .carousel-arrow{flex-shrink:0;}
  .card svg, .adm-cell svg, .side-link svg, button svg, .btn-primary svg, .btn-outline svg{flex-shrink:0;}
  /* Date fields: iOS Safari draws no calendar affordance at all, so a date
     field is indistinguishable from a text one — you'd never know it opens a
     picker. Draw our own icon on every platform and hide the native indicator
     (kept clickable, just invisible) so there's never two of them. */
  input[type="date"], input[type="month"], input[type="time"]{
    appearance:none;-webkit-appearance:none;min-height:46px;
    padding-right:44px !important;cursor:pointer;background-color:var(--surface);
    background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='%23555f6d' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4.5' width='18' height='16' rx='2.5'/%3E%3Cpath d='M3 9.5h18M8 2.5v4M16 2.5v4'/%3E%3C/svg%3E");
    background-repeat:no-repeat;background-position:right 13px center;background-size:18px 18px;
  }
  input[type="date"]::-webkit-calendar-picker-indicator,
  input[type="month"]::-webkit-calendar-picker-indicator,
  input[type="time"]::-webkit-calendar-picker-indicator{
    opacity:0;cursor:pointer;width:26px;height:26px;margin:0;padding:0;
  }
  /* Safari on iOS centres the value oddly once appearance is reset; keep the
     text left-aligned and vertically centred like every other field. */
  input[type="date"]::-webkit-date-and-time-value{text-align:left;}
  /* A select inside a fixed-basis flex column must be allowed to shrink, or a
     long option name forces the field wider than its container. */
  select, input, textarea{min-width:0;max-width:100%;}
  input:focus, textarea:focus, select:focus{border-color:var(--orange);box-shadow:0 0 0 3px oklch(72% 0.17 55 / 0.16);}
  .field{margin-bottom:20px;}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:28px;box-shadow:var(--shadow-sm);}
  /* Section heading with the brand mark as a coloured accent bar. */
  .section-title{display:flex;align-items:center;gap:12px;}
  .section-title::before{content:'';width:5px;height:26px;border-radius:99px;flex-shrink:0;
    background:linear-gradient(180deg, var(--orange), var(--green));}
  .dropzone{border:1.8px dashed var(--border);border-radius:14px;background:var(--surface-2);transition:border-color 0.18s ease, background 0.18s ease;}
  .dropzone:hover{border-color:var(--orange);background:var(--orange-soft);}
  .nav-link{color:var(--text);font-weight:500;font-size:15px;}
  .nav-link:hover{text-decoration:underline;text-underline-offset:5px;text-decoration-thickness:2px;}
  .account-btn{display:inline-flex;align-items:center;gap:9px;padding:6px 12px 6px 7px;border-radius:99px;color:var(--text);
    border:1.5px solid var(--border);background:var(--surface);max-width:190px;
    transition:border-color 0.18s ease, background 0.18s ease, transform 0.15s ease;}
  .account-btn:hover{border-color:var(--orange);background:var(--orange-soft);text-decoration:none;transform:translateY(-1px);}
  .account-btn:active{transform:translateY(0) scale(0.98);}
  .account-avatar{width:28px;height:28px;border-radius:50%;background:var(--green);color:#fff;font-size:12.5px;font-weight:800;
    display:flex;align-items:center;justify-content:center;flex-shrink:0;}
  .account-text{display:flex;flex-direction:column;line-height:1.2;min-width:0;}
  .account-hint{font-size:9.5px;font-weight:700;letter-spacing:0.5px;color:var(--text-muted);text-transform:uppercase;}
  .account-name{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  /* On a phone the row is already tight — keep the avatar, drop the wording. */
  @media (max-width: 700px){ .account-text, .account-btn > svg:last-child{display:none;} .account-btn{padding:5px 9px 5px 5px;} }
  .btn-primary{background:linear-gradient(180deg, oklch(75% 0.17 55), var(--orange));color:#fff;border:none;
    box-shadow:var(--shadow-sm);transition:filter 0.18s ease, transform 0.15s ease, box-shadow 0.18s ease;}
  .btn-primary:hover{filter:saturate(1.12) brightness(0.96);transform:translateY(-2px);box-shadow:var(--shadow-md);}
  .btn-primary:active{transform:translateY(0) scale(0.98);box-shadow:none;}
  .btn-primary:disabled{opacity:0.6;cursor:not-allowed;transform:none;box-shadow:none;}
  .btn-outline{background:var(--surface);border:1.5px solid var(--border);color:var(--text);transition:border-color 0.18s ease, background 0.18s ease, transform 0.15s ease;}
  .btn-outline:hover{border-color:var(--orange);background:var(--orange-soft);}
  .btn-outline:active{transform:scale(0.98);}
  .chip{border:1.5px solid var(--border);background:var(--surface);transition:border-color 0.18s ease, background 0.18s ease, color 0.18s ease, transform 0.15s ease;}
  .chip:hover{border-color:var(--orange);background:var(--orange-soft);}
  .chip:active{transform:scale(0.97);}
  .chip-active{background:var(--green);border-color:var(--green);color:#fff;}
  .chip-active:hover{background:var(--green-dark);border-color:var(--green-dark);}
  /* height:100% + grid-auto-rows:1fr on the grid keeps every card the same
     size no matter how long the name is or whether it carries a badge. */
  .p-card{background:var(--surface);border:1px solid var(--border);height:100%;transition:border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s cubic-bezier(0.2,0.7,0.3,1);}
  .p-card:hover{border-color:var(--orange);box-shadow:var(--shadow-lg);transform:translateY(-5px);}
  .p-card img{transition:transform 0.35s cubic-bezier(0.2,0.7,0.3,1);}
  .p-card:hover img{transform:scale(1.05);}
  /* Two lines reserved for the name so a one-word product and a three-word
     one leave the price on the same baseline. */
  .p-card-name{font-size:15.5px;font-weight:700;color:var(--text);display:-webkit-box;-webkit-line-clamp:2;
    -webkit-box-orient:vertical;overflow:hidden;min-height:2.6em;line-height:1.3;}
  .p-card-foot{margin-top:auto;}
  .mini-card{background:var(--surface);border:1px solid var(--border);transition:border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;}
  .mini-card:hover{border-color:var(--orange);transform:translateY(-3px);box-shadow:var(--shadow-md);}
  .add-btn{background:var(--orange-soft);color:var(--orange-dark);border:none;transition:background 0.18s ease, color 0.18s ease, transform 0.15s ease;}
  .add-btn:hover{background:var(--orange-mid);transform:scale(1.08);}
  .add-btn:active{transform:scale(0.94);}
  .icon-btn{background:var(--surface);border:1.5px solid var(--border);}
  .step-btn{background:var(--surface-2);border:none;transition:background 0.18s ease, transform 0.12s ease;}
  .step-btn:hover{background:var(--orange-soft);}
  .step-btn:active{transform:scale(0.92);}
  .trash-btn{background:transparent;border:none;transition:transform 0.15s ease, opacity 0.15s ease;}
  .trash-btn:hover{transform:scale(1.12);}
  .copy-btn{background:var(--orange-soft);color:var(--orange-dark);border:none;transition:background 0.18s ease, color 0.18s ease;}
  .copy-btn:hover{background:var(--orange-mid);}
  .back-btn{display:inline-flex;align-items:center;gap:8px;background:var(--surface);border:1.5px solid var(--border);color:var(--text);
    border-radius:99px;padding:9px 18px 9px 14px;font-size:13.5px;font-weight:600;width:fit-content;cursor:pointer;
    transition:border-color 0.18s ease, background 0.18s ease, transform 0.15s ease;}
  .back-btn:hover{border-color:var(--orange);background:var(--orange-soft);}
  .back-btn:hover svg{transform:translateX(-3px);}
  .back-btn:active{transform:scale(0.97);}
  .back-btn svg{transition:transform 0.18s ease;}
  /* Gojek-style quantity stepper shown on a product once it's in the cart. */
  .qty-control{display:flex;align-items:center;justify-content:flex-end;}
  .qty-stepper{display:inline-flex;align-items:center;gap:2px;background:var(--orange-soft);border-radius:10px;padding:3px;
    animation:pecup-stepper-in 0.22s cubic-bezier(0.2,0.9,0.3,1.2);}
  .qty-stepper button{width:28px;height:28px;border-radius:8px;border:none;background:transparent;color:var(--orange-dark);
    display:flex;align-items:center;justify-content:center;transition:background 0.15s ease, transform 0.12s ease;}
  .qty-stepper button:hover:not(:disabled){background:var(--orange-mid);}
  .qty-stepper button:active:not(:disabled){transform:scale(0.88);}
  .qty-stepper button:disabled{opacity:0.35;cursor:not-allowed;}
  .qty-stepper .qty-value{min-width:24px;text-align:center;font-size:14px;font-weight:800;color:var(--orange-dark);
    font-variant-numeric:tabular-nums;}
  .qty-bump{animation:pecup-pop 0.3s ease;}
  /* Product photo carousel: arrows + dots wherever it appears, auto-advancing
     only where data-autoplay is set (the product detail page). */
  /* Product photo box. Source photos vary wildly in size and aspect ratio,
     so the container defines the square itself (aspect-ratio, never a
     percentage height that depends on the parent resolving one) and the
     photo is cropped into it with object-fit. Nothing inside can change
     the box's dimensions, so a tall portrait shot and a wide landscape one
     produce identical cards. */
  .thumb-box{position:relative;width:100%;aspect-ratio:1;overflow:hidden;}
  .thumb-inner{position:absolute;inset:0;}
  .thumb-fill{width:100%;height:100%;object-fit:cover;display:block;}
  .carousel{position:relative;width:100%;height:100%;overflow:hidden;}
  .carousel-track{display:flex;width:100%;height:100%;transition:transform 0.45s cubic-bezier(0.2,0.7,0.3,1);}
  /* Each photo gets its own clipping box. Without this the card's hover zoom
     (.p-card:hover img -> scale) pushes each image past its slot and the
     neighbouring photo peeks in at the edges. */
  .carousel-slide{flex:0 0 100%;width:100%;height:100%;overflow:hidden;position:relative;}
  .carousel-slide img{width:100%;height:100%;object-fit:cover;display:block;}
  .carousel-arrow{position:absolute;top:50%;transform:translateY(-50%);z-index:3;width:30px;height:30px;border-radius:50%;
    border:none;background:rgba(255,255,255,0.86);color:#2b2b2f;display:flex;align-items:center;justify-content:center;
    box-shadow:0 2px 8px rgba(0,0,0,0.18);opacity:0;transition:opacity 0.2s ease, background 0.18s ease;}
  .carousel-prev{left:8px;}
  .carousel-next{right:8px;}
  .carousel:hover .carousel-arrow, .carousel:focus-within .carousel-arrow{opacity:1;}
  .carousel-arrow:hover{background:#fff;}
  .carousel-arrow:active{transform:translateY(-50%) scale(0.9);}
  .carousel-dots{position:absolute;left:0;right:0;bottom:8px;z-index:3;display:flex;justify-content:center;gap:5px;}
  .carousel-dot{width:6px;height:6px;padding:0;border-radius:50%;border:none;background:rgba(255,255,255,0.6);
    box-shadow:0 1px 3px rgba(0,0,0,0.3);transition:width 0.2s ease, background 0.2s ease;}
  .carousel-dot.is-active{width:16px;border-radius:99px;background:#fff;}
  /* Touch devices have no hover, so keep the arrows visible there. */
  @media (hover: none){ .carousel-arrow{opacity:1;} }
  /* Loyalty card: one slot per stamp, earned slots carry the tilted logo. */
  .stamp-grid{display:grid;grid-template-columns:repeat(5, minmax(0,1fr));gap:14px;}
  .stamp-slot{aspect-ratio:1;border-radius:50%;display:flex;align-items:center;justify-content:center;position:relative;}
  .stamp-empty{border:2px dashed var(--border);background:var(--surface-2);color:var(--text-muted);font-size:13px;font-weight:700;}
  .stamp-filled{border:2px solid var(--green-soft);background:var(--green-soft);}
  .stamp-filled img{width:72%;height:72%;object-fit:contain;transform:rotate(-30deg);}
  .stamp-reward{border:2px solid var(--orange);background:var(--orange-soft);}
  .stamp-reward img{width:72%;height:72%;object-fit:contain;transform:rotate(-30deg);}
  @media (max-width: 480px){ .stamp-grid{gap:10px;} }
  @keyframes pecup-stepper-in{from{opacity:0;transform:scale(0.82);}to{opacity:1;transform:scale(1);}}
  @keyframes pecup-fade-up{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:none;}}
  .fade-up{animation:pecup-fade-up 0.45s cubic-bezier(0.2,0.7,0.3,1) both;}
  main, section{animation:pecup-fade-up 0.4s cubic-bezier(0.2,0.7,0.3,1) both;}
  @media (prefers-reduced-motion: reduce){
    html{scroll-behavior:auto;}
    *, *::before, *::after{animation-duration:0.001ms !important;animation-iteration-count:1 !important;
      transition-duration:0.001ms !important;scroll-behavior:auto !important;}
  }
  .side-link{color:oklch(92% 0.01 255);display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:10px;font-size:14.5px;font-weight:600;transition:background 0.18s ease, color 0.18s ease;}
  .side-link:hover{background:oklch(32% 0.03 255);}
  @keyframes pecup-pop{0%{transform:scale(1);}40%{transform:scale(1.18);}100%{transform:scale(1);}}
  .cart-pop{animation:pecup-pop 0.35s ease;}
  .side-link-active{background:var(--green);color:#fff;}
  .search-input{border:1.5px solid var(--border);background:var(--surface);}
  .row-hover{transition:background 0.15s ease;}
  .row-hover:hover{background:var(--surface-2);}
  /* Progress meter. The track gets its own darker token rather than
     --surface-2: that's also the row-hover colour, so a surface-2 track
     vanished the moment you hovered the row it sat in. */
  .meter{height:6px;border-radius:99px;background:var(--track);overflow:hidden;margin-top:5px;}
  .meter-fill{height:100%;border-radius:99px;background:var(--orange);transition:width 0.3s ease;}
  .meter-fill.is-full{background:var(--green);}
  .stat-card:hover{border-color:var(--orange);transform:translateY(-2px);box-shadow:var(--shadow-md);}
  .icon-action{background:transparent;border:none;}
  .lihat-btn{background:var(--surface-2);border:1px solid var(--border);color:var(--text);}
  .toggle-pill{width:44px;height:26px;border-radius:99px;padding:3px;display:inline-flex;border:none;cursor:pointer;}
  .toggle-on{background:var(--green);justify-content:flex-end;}
  .toggle-off{background:var(--surface-2);border:1px solid var(--border);justify-content:flex-start;}
  .toggle-dot{width:18px;height:18px;border-radius:50%;background:#fff;}
  .flash{padding:14px 18px;border-radius:var(--radius-md);font-size:13.5px;margin-bottom:20px;font-weight:500;
    display:flex;align-items:center;gap:10px;animation:pecup-fade-up 0.3s ease both;}
  .flash-error{background:#f6dcdc;color:#a13f3f;}
  .flash-ok{background:var(--green-soft);color:var(--green-dark);}
  .frame{width:100%;background:var(--bg);}
  /* No overflow-x:hidden here anymore: with .frame already fluid (width:100%)
     it serves no purpose, and — per the CSS spec — setting only overflow-x on
     an element with overflow-y left at its 'visible' default silently forces
     overflow-y to 'auto' too, turning this into an unwanted scroll container.
     That breaks position:sticky on the header (it starts sticking to this
     container's scrollport instead of the actual viewport) and can throw off
     width computation for children. */
  .frame-scroll{overflow-x:visible;}

  /* ---- responsive helpers ---- */
  .px-page{padding-left:96px;padding-right:96px;}
  /* auto-rows:1fr so every row of cards is the same height as the tallest in
     the grid — not just the tallest in its own row. */
  .grid-4{display:grid;grid-template-columns:repeat(4, minmax(0,1fr));gap:28px;grid-auto-rows:1fr;}
  /* The sticky header would otherwise cover the top of whatever #anchor you
     jump to. */
  section[id]{scroll-margin-top:96px;}
  .grid-3{display:grid;grid-template-columns:repeat(3, minmax(0,1fr));gap:36px;}
  /* overflow:clip contains the decorative glows below. Without it their
     negative insets stick out past the viewport, the page gains horizontal
     scroll, and a phone zooms out to fit — which reads as "everything is
     small and centered". clip rather than hidden on purpose: hidden on one
     axis forces the other to auto, turning this into a scroll container and
     breaking the sticky header. */
  .hero{display:flex;align-items:center;justify-content:space-between;gap:64px;flex-wrap:wrap;position:relative;overflow:clip;}
  /* Two offset washes instead of one flat tint — gives the top of the page
     some depth without putting an image behind it. */
  .hero::before{content:'';position:absolute;inset:-20% -8% auto;height:150%;pointer-events:none;z-index:0;
    background:radial-gradient(50% 48% at 78% 22%, oklch(92% 0.09 55 / 0.55), transparent 72%),
               radial-gradient(42% 40% at 12% 62%, oklch(93% 0.07 152 / 0.38), transparent 72%);
    mask-image:linear-gradient(to bottom, #000 55%, transparent 92%);
    -webkit-mask-image:linear-gradient(to bottom, #000 55%, transparent 92%);}
  .hero > *{position:relative;z-index:1;}
  /* Fine dotted texture over the hero so large empty areas aren't dead flat.
     Both washes are masked to fade out well before the section ends, so the
     colour doesn't run straight into the category bar underneath. */
  .hero::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:0;opacity:0.45;
    background-image:radial-gradient(oklch(70% 0.03 95 / 0.25) 1px, transparent 1px);background-size:22px 22px;
    mask-image:radial-gradient(62% 58% at 50% 34%, #000, transparent 72%);
    -webkit-mask-image:radial-gradient(62% 58% at 50% 34%, #000, transparent 72%);}
  /* The category bar: its own quiet band, clearly separated from the hero. */
  .chip-bar{display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding-top:26px;padding-bottom:26px;
    border-top:1px solid var(--border);background:var(--surface);}
  .chip-bar-label{font-size:11.5px;font-weight:800;letter-spacing:0.9px;text-transform:uppercase;
    color:var(--text-muted);flex-shrink:0;}
  .chip-bar-list{display:flex;gap:10px;flex-wrap:wrap;min-width:0;}
  @media (max-width: 560px){
    .chip-bar{gap:12px;padding-top:20px;padding-bottom:20px;}
    /* One swipeable row rather than four stacked lines of chips. */
    .chip-bar-list{flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px;
      scrollbar-width:none;-ms-overflow-style:none;}
    .chip-bar-list::-webkit-scrollbar{display:none;}
    .chip-bar-list > .chip{flex-shrink:0;}
  }
  .hero-art{position:relative;}
  /* Soft halo behind the cup illustration. */
  .hero-art::before{content:'';position:absolute;inset:-12%;border-radius:50%;z-index:-1;
    background:radial-gradient(circle, oklch(88% 0.09 152 / 0.55), transparent 68%);}
  /* Section eyebrow — a small labelled rule above a heading. */
  .eyebrow{display:inline-flex;align-items:center;gap:9px;font-size:12px;font-weight:800;letter-spacing:1.2px;
    text-transform:uppercase;color:var(--orange-dark);margin-bottom:10px;}
  .eyebrow::before{content:'';width:26px;height:2px;border-radius:2px;background:var(--orange);}
  /* Numbered step markers with a connecting line on wide screens. */
  .step-num{position:relative;width:56px;height:56px;border-radius:50%;color:#fff;display:flex;align-items:center;
    justify-content:center;font-size:20px;font-weight:800;flex-shrink:0;
    background:linear-gradient(145deg, oklch(66% 0.15 152), var(--green-dark));box-shadow:var(--shadow-md);}
  .hero-copy{flex:1 1 420px;display:flex;flex-direction:column;gap:26px;}
  .hero-title{font-size:clamp(30px, 4.6vw, 48px);line-height:1.15;font-weight:800;letter-spacing:-1px;max-width:560px;}
  .hero-art{flex:0 1 340px;width:min(340px, 60vw);height:min(340px, 60vw);border-radius:50%;background:var(--green-soft);display:flex;align-items:center;justify-content:center;}
  .hero-art svg{width:60%;height:60%;}
  .detail-layout{display:flex;gap:64px;flex-wrap:wrap;}
  .detail-img{flex:1 1 340px;max-width:420px;aspect-ratio:1;}
  .detail-info{flex:1 1 380px;display:flex;flex-direction:column;gap:20px;padding-top:8px;min-width:0;}
  .split-layout{display:flex;gap:48px;align-items:flex-start;flex-wrap:wrap;}
  .split-main{flex:1 1 480px;display:flex;flex-direction:column;min-width:0;}
  .split-side{flex:1 1 320px;max-width:360px;background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:28px;}
  .cart-row{display:flex;align-items:center;gap:20px;padding:24px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;}
  .cart-row-thumb{width:84px;height:84px;flex-shrink:0;}
  .cart-row-name{flex:1 1 180px;min-width:140px;}
  .cart-row-qty{display:flex;align-items:center;gap:8px;}
  .cart-row-total{width:110px;text-align:right;font-size:16px;font-weight:800;color:var(--green-dark);}
  .footer-cols{display:flex;flex-wrap:wrap;justify-content:space-between;gap:40px;padding-bottom:40px;border-bottom:1px solid var(--border);}
  .site-header{display:flex;align-items:center;justify-content:space-between;padding:22px 96px;border-bottom:1px solid var(--border);
    background:oklch(99% 0.006 95 / 0.92);backdrop-filter:blur(10px);gap:16px;flex-wrap:wrap;position:sticky;top:0;z-index:50;box-shadow:var(--shadow-sm);}
  /* 3-column grid (logo / nav / cart) so the nav links land truly centered
     regardless of the logo and cart icon having different widths — plain
     flex space-between can't center a middle item between unequal siblings. */
  .site-header-grid{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:22px 96px;border-bottom:1px solid var(--border);
    background:oklch(99% 0.006 95 / 0.92);backdrop-filter:blur(10px);gap:16px;position:sticky;top:0;z-index:50;box-shadow:var(--shadow-sm);}
  .site-nav{display:flex;gap:40px;flex-wrap:wrap;justify-content:center;}
  .success-card{padding:56px 60px;}
  /* stretch (not flex-start) + a viewport floor: the dark rail runs the full
     height of whatever page it's on, so a short page like Kelola Admin no
     longer leaves it dangling past the content or stopping short of the fold. */
  .admin-shell{display:flex;align-items:stretch;flex-wrap:wrap;min-height:100vh;}
  .admin-sidebar{flex:0 0 240px;background:var(--sidebar);padding:28px 20px;display:flex;flex-direction:column;}
  .admin-main{flex:1 1 480px;min-width:0;padding:32px 40px;}
  /* Mobile-only bar carrying the brand and the hamburger. Hidden on desktop,
     where the full rail is always visible. */
  .admin-topbar{display:none;flex:0 0 100%;align-items:center;justify-content:space-between;gap:12px;
    background:var(--sidebar);padding:12px 16px;position:sticky;top:0;z-index:60;}
  .admin-nav-toggle{position:absolute;opacity:0;pointer-events:none;width:0;height:0;}
  .admin-burger{display:inline-flex;align-items:center;gap:9px;margin:0;cursor:pointer;color:#fff;
    font-size:13px;font-weight:700;border:1px solid oklch(40% 0.03 255);border-radius:10px;padding:8px 13px;
    background:oklch(30% 0.03 255);transition:background 0.16s ease;}
  .admin-burger:hover{background:oklch(36% 0.03 255);}
  .admin-burger:active{transform:scale(0.97);}
  .admin-burger .burger-close{display:none;}
  /* Desktop keeps the rail in the flow; the scrim only exists for the phone
     drawer, where the media query turns it on. */
  .admin-scrim{display:none;}
  .admin-nav-toggle:checked ~ .admin-topbar .admin-burger .burger-open{display:none;}
  .admin-nav-toggle:checked ~ .admin-topbar .admin-burger .burger-close{display:inline;}
  table.admin-table{width:100%;border-collapse:collapse;}
  .table-scroll{overflow-x:auto;}

  /* ---- responsive admin table ----
     Desktop: a grid whose columns come from --cols on the wrapper.
     Phone: the header is dropped and every row becomes a stacked card, each
     value labelled from its column name. That's what makes the admin usable
     on a phone instead of a wide table you have to drag sideways. */
  /* MOBILE FIRST, deliberately. The stacked card is the default and the wide
     grid is layered on at >=861px. Written the other way round, any failure
     to match the mobile media query leaves the unusable wide table on a
     phone; this way the worst case is a stacked list, which always works. */
  .adm-table{background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;}
  /* Safety net at every width: if any row content is wider than the card it
     scrolls inside the card, instead of widening the whole page and pushing
     the right-hand buttons off-screen. */
  .adm-scroll{overflow-x:auto;}
  .adm-head{display:none;}
  .adm-row{display:block;padding:15px 16px;border-top:1px solid var(--border);color:inherit;}
  .adm-row:first-child{border-top:none;}
  .adm-empty{padding:36px 22px;color:var(--text-muted);font-size:14px;text-align:center;}
  /* Label / value pair per field, with the column name supplied by the cell's
     data-label so no header row is needed. */
  .adm-cell{display:flex;align-items:center;justify-content:space-between;gap:14px;min-width:0;
    padding:5px 0;flex-wrap:wrap;}
  .adm-cell::before{content:attr(data-label);flex:0 0 auto;font-size:10.5px;font-weight:800;letter-spacing:0.5px;
    text-transform:uppercase;color:var(--text-muted);}
  /* The lead cell (and any actions cell) carries no label and spans the row. */
  .adm-cell[data-label=""]{display:block;padding-bottom:9px;}
  .adm-cell[data-label=""]::before{display:none;}
  .adm-cell > *{min-width:0;max-width:100%;}
  .hide-desktop{display:inline;}
  .adm-note{font-size:14px;color:var(--text-muted);margin-top:14px;line-height:1.7;}
  /* Lead cell: product photo + name. The photo is big enough to actually
     judge on a phone and shrinks to a row-height chip on desktop. */
  .adm-lead{display:flex;align-items:center;gap:14px;min-width:0;}
  .adm-thumb{width:104px;flex-shrink:0;}
  .adm-lead-name{font-size:17px;font-weight:800;min-width:0;}
  /* A 44-104px thumbnail is smaller than the carousel's own arrows, so they
     sit on top of the photo instead of beside it. Dots are enough here. */
  .adm-cell .carousel-arrow{display:none;}
  /* Touch targets. On a phone the row controls are the whole point of the
     page — they get real size rather than the 24px icons that suit a mouse. */
  @media (max-width: 860px){
    .adm-cell .step-btn{width:42px;height:42px;border:1px solid var(--border);font-size:19px !important;}
    .adm-cell .stock-input{width:72px;padding:10px 4px;font-size:17px !important;}
    .adm-cell .icon-action{padding:10px 14px;border:1px solid var(--border);border-radius:9px;background:var(--surface);}
    .adm-cell .toggle-pill{width:56px;height:32px;}
    .adm-cell .toggle-dot{width:24px;height:24px;}
    .adm-cell .lihat-btn{padding:10px 16px;}
    .adm-cell .carousel-dot{width:8px;height:8px;}
    .adm-cell .carousel-dot.is-active{width:20px;}
    /* Row text is written with inline font sizes tuned for a dense desktop
       table, which read as tiny on a phone. Overriding them needs
       !important because inline styles always win otherwise. */
    .adm-cell{font-size:15px;}
    .adm-cell::before{font-size:12px;letter-spacing:0.4px;}
    .adm-cell span, .adm-cell a, .adm-cell div, .adm-cell strong,
    .adm-cell label, .adm-cell button, .adm-cell time{font-size:15px !important;}
    /* …except the little status pills, which stay badge-sized. */
    .adm-cell span[style*="border-radius:99px"]{font-size:11.5px !important;}
    .adm-note{font-size:14.5px;}
    .adm-empty{font-size:15px;padding:40px 20px;}
  }

  @media (min-width: 861px){
    .adm-scroll{overflow-x:auto;}
    .adm-head, .adm-rows{min-width:var(--min, auto);}
    .adm-head{display:grid;grid-template-columns:var(--cols);gap:12px;padding:14px 20px;
      background:var(--surface-2);font-size:11.5px;font-weight:700;color:var(--text-muted);letter-spacing:0.3px;}
    .adm-row{display:grid;grid-template-columns:var(--cols);gap:12px;align-items:center;padding:14px 20px;}
    .adm-row:first-child{border-top:1px solid var(--border);}
    .adm-cell{display:block;padding:0;}
    .adm-cell::before{display:none;}
    .adm-cell[data-label=""]{padding-bottom:0;}
    .hide-desktop{display:none;}
    .adm-thumb{width:44px;}
    .adm-lead-name{font-size:14px;font-weight:700;}
  }

  @media (max-width: 1180px){
    .px-page{padding-left:56px;padding-right:56px;}
    .site-header, .site-header-grid{padding-left:56px;padding-right:56px;}
    .grid-4{grid-template-columns:repeat(3, minmax(0,1fr));}
  }
  @media (max-width: 860px){
    .px-page{padding-left:32px;padding-right:32px;}
    .site-header, .site-header-grid{padding:18px 32px;}
    .grid-4{grid-template-columns:repeat(2, minmax(0,1fr));gap:20px;}
    .grid-3{grid-template-columns:1fr;gap:28px;}
    .site-nav{gap:24px;}
    /* Once the shell wraps onto two lines, align-content would stretch each
       line to half the 100vh floor — leaving a huge empty dark panel. Pack
       the lines instead and let each size to its content. */
    .admin-shell{align-content:flex-start;}
    .admin-topbar{display:flex;}
    /* The nav is a drawer fixed to the viewport, not a block in the document
       flow. In the flow it opened at the top of the page, so pressing Menu
       half way down a long order list meant scrolling back up to reach it —
       and it pushed the content down as it appeared. Fixed, it slides in over
       whatever you're looking at, wherever you are on the page.
       A transform transition rather than a keyframe animation: the keyframe
       replayed whenever the element was re-shown, which is what made the
       menu look like it animated twice. */
    .admin-sidebar{
      position:fixed;top:0;left:0;bottom:0;z-index:70;
      width:min(290px, 84vw);flex:0 0 auto;min-height:0;height:100%;
      padding:18px 14px;overflow-y:auto;-webkit-overflow-scrolling:touch;
      transform:translateX(-100%);box-shadow:0 0 40px rgba(0,0,0,0.4);
      /* visibility, delayed until the slide-out finishes, keeps a closed
         drawer out of the tab order instead of leaving focusable links
         parked off-screen. */
      visibility:hidden;
      transition:transform 0.24s cubic-bezier(0.2,0.7,0.3,1), visibility 0s linear 0.24s;}
    .admin-nav-toggle:checked ~ .admin-sidebar{
      transform:none;visibility:visible;
      transition:transform 0.24s cubic-bezier(0.2,0.7,0.3,1), visibility 0s;}
    /* Tapping the dimmed page closes the drawer — it's a <label> for the same
       checkbox, so this works without any JavaScript. */
    .admin-scrim{display:block;position:fixed;inset:0;z-index:65;background:rgba(0,0,0,0.45);
      opacity:0;pointer-events:none;transition:opacity 0.24s ease;}
    .admin-nav-toggle:checked ~ .admin-scrim{opacity:1;pointer-events:auto;}
    .admin-sidebar .admin-sidebar-brand{display:flex !important;margin-bottom:22px;}
    .admin-main{padding:24px 20px;}
    /* Filter bars are built as flex rows with fixed pixel bases for desktop.
       On a phone those bases fight each other, so the bar becomes a two-column
       grid instead: every field the same height, sitting on a shared baseline,
       and a card that stays short rather than stacking seven full-width rows.
       Scoped by the inline display:flex those bars carry, so the *other* admin
       forms (settings, new voucher) keep their own layout. An earlier, broader
       version of this rule also hit the little forms inside table rows and
       blew their buttons up to full width. */
    .admin-main form.card[style*="display:flex"]{
      display:grid !important;grid-template-columns:repeat(2, minmax(0, 1fr));
      gap:12px !important;align-items:end;padding:16px !important;}
    .admin-main form.card[style*="display:flex"] > div{margin:0 !important;min-width:0;}
    /* The one that grows on desktop is the free-text search — full width. */
    .admin-main form.card[style*="display:flex"] > div[style*="flex:1 1"]{grid-column:1 / -1;}
    .admin-main form.card[style*="display:flex"] > label{grid-column:1 / -1;margin:0 !important;}
    .admin-main form.card[style*="display:flex"] > button,
    .admin-main form.card[style*="display:flex"] > a{
      width:100%;text-align:center;justify-content:center;margin:0;}
    /* Every control the same height so the grid rows line up. */
    .admin-main form.card input,
    .admin-main form.card select{width:100%;padding:11px 12px !important;}
    /* Stat grids read better as two columns than four squeezed ones. */
    .admin-main .grid-4{grid-template-columns:repeat(2, minmax(0,1fr));}
    /* Phone type scale. Every inline <p> size in the admin views is 13.5px or
       below, so this floor only ever enlarges. Inputs go to 16px because iOS
       Safari zooms the whole page when you focus anything smaller. */
    .admin-main p{font-size:14.5px !important;line-height:1.65;}
    .admin-main label{font-size:14px !important;}
    .admin-main .chip{font-size:14px !important;padding:10px 18px !important;}
    .admin-main input, .admin-main select, .admin-main textarea{font-size:16px !important;}
    .admin-main h1{font-size:26px;}
    /* Nothing in a row may force the page wider than the screen. */
    .adm-cell form{max-width:100%;}
    .adm-cell input, .adm-cell select{max-width:100%;}

    /* Once the two columns stack, the summary panel kept its 360px desktop
       cap — so it sat narrower than the cards above it and read as misaligned.
       Stacked means full width. */
    .split-layout{flex-direction:column;gap:24px;}
    .split-main, .split-side{flex:1 1 auto;width:100%;max-width:100%;}
    /* The order summary belongs ABOVE the send button, not below it: stacked,
       the left column's submit button came first and the customer could send
       the order before ever seeing what it cost. */
    .split-side{order:-1;}
    .split-side{padding:22px;}
  }
  @media (max-width: 560px){
    /* Admin cards are sized for a desktop panel. On a phone that padding is
       what makes every page feel twice as long as it needs to be, so the
       whole admin side gets a compact pass — same information, less scrolling.
       Stat cards stay two-up rather than becoming four full-width blocks. */
    .admin-main{padding:18px 14px;}
    .admin-main .card{padding:18px 16px;}
    .admin-main .grid-4{grid-template-columns:repeat(2, minmax(0,1fr));gap:11px;}
    .admin-main .grid-4 > div,
    .admin-main .grid-4 > .card,
    .admin-main .grid-4 > a > div{padding:14px 13px !important;gap:11px !important;}
    .admin-main .grid-4 .tnum{font-size:19px !important;}
    /* Chip rows (category / preset filters) swipe sideways instead of
       wrapping onto four stacked lines. */
    .admin-main .card:has(> .chip){flex-wrap:nowrap !important;overflow-x:auto;
      scrollbar-width:none;-ms-overflow-style:none;}
    .admin-main .card:has(> .chip)::-webkit-scrollbar{display:none;}
    .admin-main .card > .chip{flex-shrink:0;}
    .admin-main > div:has(> .chip){flex-wrap:nowrap;overflow-x:auto;
      scrollbar-width:none;-ms-overflow-style:none;padding-bottom:4px;}
    .admin-main > div:has(> .chip)::-webkit-scrollbar{display:none;}
    .admin-main > div > .chip{flex-shrink:0;}
  }
  @media (max-width: 380px){
    .admin-main .grid-4{grid-template-columns:1fr;}
  }
  @media (max-width: 640px){
    /* Below this width, drop back to a wrapping flex row — with limited
       horizontal space, letting the nav wrap onto its own line matters more
       than keeping it perfectly centered between logo and cart icon. */
    .site-header-grid{display:flex;flex-wrap:wrap;justify-content:space-between;}
  }
  @media (max-width: 560px){
    .px-page{padding-left:18px;padding-right:18px;}
    .site-header, .site-header-grid{padding:16px 18px;}
    .grid-4{grid-template-columns:1fr;}
    .hero-art{display:none;}
    .split-side{flex-basis:100%;max-width:100%;}
    .cart-row{gap:12px;padding:18px 0;}
    .cart-row-thumb{width:64px;height:64px;}
    .cart-row-total{width:auto;margin-left:auto;}
    .detail-img{max-width:100%;}
    .success-card{padding:32px 22px;}
  }
`;

const SITE_NAME = 'Pecup';
const DEFAULT_DESCRIPTION =
  'Buah potong segar Pecup — dipotong higienis tiap pagi, dikemas rapi dalam cup, dan diantar langsung ke kantor atau rumahmu.';

function page({
  title,
  bodyHtml,
  extraHead = '',
  description = DEFAULT_DESCRIPTION,
  // Admin screens must never be indexed, and shouldn't advertise themselves
  // in a link preview either.
  noindex = false,
  image = '/assets/pecup-logo.png',
  canonical = '',
} = {}) {
  const desc = escapeAttr(String(description).slice(0, 300));
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta name="theme-color" content="#e88a3a">
${noindex ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="robots" content="index, follow">'}
${canonical ? `<link rel="canonical" href="${escapeAttr(canonical)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${escapeAttr(title)}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${escapeAttr(image)}">
<meta property="og:locale" content="id_ID">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeAttr(title)}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${escapeAttr(image)}">
<link rel="icon" type="image/png" href="/assets/pecup-logo.png">
<link rel="apple-touch-icon" href="/assets/pecup-logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Work+Sans:wght@400;500;600&display=swap">
<style>${SHARED_STYLE}</style>
${extraHead}
</head>
<body>
<a class="skip-link" href="#konten">Lewati ke konten utama</a>
${bodyHtml}
${CART_SCRIPT}
</body>
</html>`;
}

// Goes back to wherever the visitor actually came from, falling back to the
// given href when there's no in-site history to return to (deep link, fresh
// tab, arrived from an external site). The href is always a real link, so
// this still works with JS off and middle-click/open-in-new-tab behave.
function backButton(href, label = 'Kembali') {
  return `<a class="back-btn" href="${href}" data-back>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
    ${escapeHtml(label)}
  </a>`;
}

function logoMark(size = 38) {
  return `<img src="/assets/pecup-logo.png" width="${size}" height="${size}" alt="Pecup" style="border-radius:50%;object-fit:cover;flex-shrink:0;">`;
}

// The signed-in state is a labelled button, not a bare avatar: an initial in
// a circle doesn't tell a shopper it's their account, or that it's clickable.
function accountLink(customer) {
  if (customer) {
    const name = String(customer.name || 'Akun');
    const initial = escapeHtml(name.charAt(0).toUpperCase());
    // Only the first word — a full name would push the cart icon off the row.
    const short = escapeHtml(name.trim().split(/\s+/)[0].slice(0, 12));
    return `<a class="account-btn" href="/akun" title="Akun saya — ${escapeAttr(name)}">
      <span class="account-avatar">${initial}</span>
      <span class="account-text">
        <span class="account-hint">Akun</span>
        <span class="account-name">${short}</span>
      </span>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:0.5;"><path d="M9 18l6-6-6-6"/></svg>
    </a>`;
  }
  return `<a class="account-btn" href="/masuk">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    <span style="font-size:13.5px;font-weight:700;white-space:nowrap;">Masuk</span>
  </a>`;
}

function customerHeader(cartCount = 0, activeStepLabel = null, customer = null) {
  if (activeStepLabel) {
    return `
  <header class="site-header">
    <a href="/" style="display:flex;align-items:center;gap:12px;">
      ${logoMark(38)}
      <span style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:22px;color:var(--text);">Pecup</span>
    </a>
    <div style="display:flex;align-items:center;gap:14px;font-size:13.5px;font-weight:600;flex-wrap:wrap;">${activeStepLabel}</div>
  </header>`;
  }
  return `
  <header class="site-header-grid">
    <a href="/" style="display:flex;align-items:center;gap:12px;justify-self:start;">
      ${logoMark(38)}
      <div style="display:flex;flex-direction:column;">
        <span style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:22px;letter-spacing:-0.3px;color:var(--text);">Pecup</span>
        <span style="font-size:11px;color:var(--text-muted);letter-spacing:0.4px;">POTONGAN BUAH SEGAR</span>
      </div>
    </a>
    <nav class="site-nav">
      <a class="nav-link" href="/">Beranda</a>
      <a class="nav-link" href="/#menu">Menu</a>
      <a class="nav-link" href="/#cara-pesan">Cara Pesan</a>
    </nav>
    <div style="display:flex;align-items:center;gap:18px;justify-self:end;">
      ${accountLink(customer)}
      <a href="/keranjang" id="cartLink" style="position:relative;display:flex;align-items:center;">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#2b2b2f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6"/><circle cx="10" cy="21" r="1.4" fill="#2b2b2f" stroke="none"/><circle cx="18" cy="21" r="1.4" fill="#2b2b2f" stroke="none"/></svg>
        <span id="cartBadge" style="position:absolute;top:-8px;right:-9px;background:var(--orange);color:#fff;font-size:10px;font-weight:700;width:16px;height:16px;border-radius:50%;align-items:center;justify-content:center;display:${cartCount > 0 ? 'flex' : 'none'};">${cartCount}</span>
      </a>
    </div>
  </header>`;
}

// Progressive enhancement: intercepts submits of any add-to-cart form
// (action="/keranjang/tambah") and sends them via fetch instead of a full
// page POST+redirect, so clicking "Tambah ke Keranjang" doesn't reload the
// whole page — it just updates the cart badge in place. Forms still work
// with plain HTML submission if JS is unavailable or the request fails.
const CART_SCRIPT = `
<script>
(function(){
  function updateBadge(count){
    var badge = document.getElementById('cartBadge');
    if(!badge) return;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
    badge.classList.remove('cart-pop');
    void badge.offsetWidth; // restart the animation even if it's already mid-run
    badge.classList.add('cart-pop');
  }
  document.addEventListener('submit', function(e){
    var form = e.target;
    if(!form || form.getAttribute('action') !== '/keranjang/tambah') return;
    e.preventDefault();
    // Form-level guard (not just button.disabled) so a fast double-click or
    // double-tap can never fire the request twice, even if the button
    // lookup below fails for some reason — this is what actually stops
    // "click twice, accidentally order 2".
    if(form.dataset.submitting === '1') return;
    form.dataset.submitting = '1';
    flyToCart(document.querySelector('.detail-img img') || productImageFor(form));
    var btn = form.querySelector('button[type="submit"]');
    var originalText = btn ? btn.textContent : '';
    if(btn){ btn.disabled = true; btn.textContent = '...'; }
    fetch(form.getAttribute('action'), {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: new FormData(form)
    }).then(function(res){ return res.json().then(function(data){ return { ok: res.ok, data: data }; }); })
      .then(function(result){
        if(result.ok && result.data && result.data.ok){
          updateBadge(result.data.cartCount);
          if(btn){ btn.textContent = 'Ditambahkan \\u2713'; }
          setTimeout(function(){ if(btn){ btn.disabled = false; btn.textContent = originalText; } form.dataset.submitting = ''; }, 900);
        } else {
          if(btn){ btn.disabled = false; btn.textContent = originalText; }
          form.dataset.submitting = '';
        }
      })
      .catch(function(){
        if(btn){ btn.disabled = false; btn.textContent = originalText; }
        form.dataset.submitting = '';
      });
  });
  // Cart quantity fields: submit automatically once the shopper finishes
  // editing (blur / Enter / stepper arrows), no separate "Update" button.
  document.addEventListener('change', function(e){
    var input = e.target;
    if(!input || !input.classList || !input.classList.contains('qty-auto-submit')) return;
    var form = input.closest('form');
    if(form) form.requestSubmit();
  });

  // ---- Back button -------------------------------------------------------
  // "Kembali" should return to the page you were actually on, not a fixed
  // destination. Only steps back when the previous page was on this site and
  // there's history to step into; otherwise the link's href is followed as a
  // sensible default.
  document.addEventListener('click', function(e){
    if(!e.target.closest || e.defaultPrevented) return;
    if(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    var link = e.target.closest('a[data-back]');
    if(!link) return;
    var ref = document.referrer;
    if(!ref || history.length <= 1) return;
    try{
      if(new URL(ref).origin !== window.location.origin) return;
      // Coming "back" to the page we're already on would look like nothing
      // happened — let the fallback href handle it.
      if(new URL(ref).href === window.location.href) return;
    }catch(err){ return; }
    e.preventDefault();
    history.back();
  });

  // ---- Same-page links ---------------------------------------------------
  // Clicking "Beranda" while already on the home page used to re-navigate to
  // "/", which re-renders the whole page and drops the shopper wherever the
  // browser decides to restore scroll to — it reads as being teleported.
  // Same destination = just glide back to the top instead.
  document.addEventListener('click', function(e){
    if(!e.target.closest || e.defaultPrevented) return;
    if(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    var link = e.target.closest('a');
    if(!link || link.target === '_blank' || link.hasAttribute('download')) return;
    var href = link.getAttribute('href');
    if(!href || href.charAt(0) !== '/') return;

    var url = new URL(href, window.location.href);
    if(url.origin !== window.location.origin) return;
    // A hash link has its own destination on the page — leave it to the browser.
    if(url.hash) return;
    if(url.pathname !== window.location.pathname || url.search !== window.location.search) return;

    e.preventDefault();
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    // Drop any lingering #menu so a refresh doesn't jump back down.
    if(window.location.hash && history.replaceState){
      history.replaceState(null, '', url.pathname + url.search);
    }
  });

  // ---- Product photo carousel -------------------------------------------
  (function(){
    function show(carousel, index){
      var count = Number(carousel.dataset.count) || 1;
      var next = ((index % count) + count) % count; // wrap both directions
      carousel.dataset.index = String(next);
      var track = carousel.querySelector('.carousel-track');
      if(track) track.style.transform = 'translateX(-' + (next * 100) + '%)';
      var dots = carousel.querySelectorAll('.carousel-dot');
      for(var i = 0; i < dots.length; i++){
        dots[i].classList.toggle('is-active', i === next);
      }
    }
    function current(carousel){ return Number(carousel.dataset.index) || 0; }

    document.addEventListener('click', function(e){
      if(!e.target.closest) return;
      var arrow = e.target.closest('.carousel-arrow');
      var dot = e.target.closest('.carousel-dot');
      if(!arrow && !dot) return;
      var carousel = (arrow || dot).closest('.carousel');
      if(!carousel) return;
      // Product cards are wrapped in a click-through link — don't navigate
      // when the tap was meant for the carousel.
      e.preventDefault();
      e.stopPropagation();
      if(dot) show(carousel, Number(dot.dataset.index) || 0);
      else show(carousel, current(carousel) + (arrow.classList.contains('carousel-next') ? 1 : -1));
      // A manual interaction cancels autoplay — it's fighting the shopper otherwise.
      if(carousel.dataset.timer){ clearInterval(Number(carousel.dataset.timer)); carousel.dataset.timer = ''; }
    });

    function startAutoplay(){
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if(reduce) return;
      var list = document.querySelectorAll('.carousel[data-autoplay]');
      for(var i = 0; i < list.length; i++){
        (function(carousel){
          if(carousel.dataset.timer) return;
          var delay = Number(carousel.dataset.autoplay) || 2000;
          var timer = setInterval(function(){
            if(!document.body.contains(carousel)){ clearInterval(timer); return; }
            show(carousel, current(carousel) + 1);
          }, delay);
          carousel.dataset.timer = String(timer);
        })(list[i]);
      }
    }
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startAutoplay);
    else startAutoplay();
  })();

  // ---- Gojek-style quantity stepper -------------------------------------
  // A .qty-control starts as a single "+" button and swaps to a [-][n][+]
  // stepper the moment the product is in the cart. The server owns the real
  // quantity: we send the target qty and re-render from whatever it returns
  // (it clamps to available stock), so the UI can't drift out of sync.
  // Flies a copy of the product photo into the cart icon. Purely decorative:
  // it runs on a detached clone, so if anything here is unsupported the real
  // add still goes through untouched.
  function flyToCart(sourceEl){
    try{
      var cart = document.getElementById('cartLink');
      if(!cart || !sourceEl || !sourceEl.getBoundingClientRect) return;
      if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      var from = sourceEl.getBoundingClientRect();
      var to = cart.getBoundingClientRect();
      if(!from.width || !to.width) return;

      var clone = sourceEl.cloneNode(true);
      clone.style.cssText = 'position:fixed;left:' + from.left + 'px;top:' + from.top + 'px;width:' + from.width +
        'px;height:' + from.height + 'px;object-fit:cover;border-radius:14px;z-index:9999;pointer-events:none;' +
        'box-shadow:0 12px 28px -10px rgba(0,0,0,0.45);';
      document.body.appendChild(clone);

      var dx = (to.left + to.width / 2) - (from.left + from.width / 2);
      var dy = (to.top + to.height / 2) - (from.top + from.height / 2);
      var anim = clone.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        // Arc upward on the way across so it reads as a toss, not a slide.
        { transform: 'translate(' + (dx * 0.5) + 'px,' + (dy * 0.5 - 70) + 'px) scale(0.6)', opacity: 0.9, offset: 0.55 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(0.12)', opacity: 0.15 }
      ], { duration: 620, easing: 'cubic-bezier(0.3,0,0.5,1)' });
      anim.onfinish = function(){ clone.remove(); };
      // Safety net: never leave a stray clone on screen if onfinish doesn't fire.
      setTimeout(function(){ if(clone.parentNode) clone.remove(); }, 1200);
    }catch(err){ /* decoration only */ }
  }

  function productImageFor(el){
    var card = el.closest('.p-card, .cart-row, .detail-layout, form');
    return card ? card.querySelector('img') : null;
  }

  // atMax comes from the server's reply, not from a stock number embedded in
  // the page — the exact stock level is never sent to the browser.
  function stepperMarkup(qty, atMax){
    var minus = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 12h14"/></svg>';
    var plus = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
    if(qty <= 0){
      return '<button class="add-btn qty-step" data-delta="1" type="button" title="Tambah ke keranjang" ' +
        'style="width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;">' + plus + '</button>';
    }
    return '<span class="qty-stepper">' +
      '<button class="qty-step" data-delta="-1" type="button" aria-label="Kurangi">' + minus + '</button>' +
      '<span class="qty-value">' + qty + '</span>' +
      '<button class="qty-step" data-delta="1" type="button" aria-label="Tambah"' + (atMax ? ' disabled title="Stok tidak mencukupi"' : '') + '>' + plus + '</button>' +
      '</span>';
  }

  function renderControl(control, qty, atMax){
    control.dataset.qty = String(qty);
    if(atMax !== undefined) control.dataset.atmax = atMax ? '1' : '';
    control.innerHTML = stepperMarkup(qty, control.dataset.atmax === '1');
    var value = control.querySelector('.qty-value');
    if(value){
      value.classList.add('qty-bump');
      setTimeout(function(){ value.classList.remove('qty-bump'); }, 320);
    }
  }

  function setText(selector, text){
    var el = document.querySelector(selector);
    if(el) el.textContent = text;
  }

  document.addEventListener('click', function(e){
    var btn = e.target.closest ? e.target.closest('.qty-step') : null;
    if(!btn) return;
    var control = btn.closest('.qty-control');
    if(!control) return;
    // The whole product card is a click-through link — don't follow it when
    // the tap landed on the stepper.
    e.preventDefault();
    e.stopPropagation();
    if(control.dataset.busy === '1') return;

    var current = Number(control.dataset.qty || 0);
    var delta = Number(btn.dataset.delta || 0);
    var target = current + delta;
    if(target < 0) target = 0;
    control.dataset.busy = '1';

    if(delta > 0 && target > current) flyToCart(productImageFor(btn));
    // Repaint at the target straight away — the server still decides the real
    // number (it clamps to stock), but the shopper never waits on it.
    var isCartRow = Boolean(control.closest('[data-cart-row]'));
    if(!isCartRow) renderControl(control, target);

    var body = new FormData();
    body.append('key', control.dataset.key);
    body.append('productId', control.dataset.productId || '');
    body.append('qty', String(target));

    fetch('/keranjang/set-qty', {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: body
    }).then(function(res){ return res.json(); })
      .then(function(data){
        if(!data || !data.ok){ renderControl(control, current); return; }
        // Reconcile: repaint if the server landed somewhere different from the
        // optimistic guess, or if the at-capacity flag changed.
        var nextAtMax = Boolean(data.atMax);
        if(Number(control.dataset.qty) !== data.qty || (control.dataset.atmax === '1') !== nextAtMax){
          renderControl(control, data.qty, nextAtMax);
        }
        updateBadge(data.cartCount);
        // Cart page only: keep the row total and the order summary in step.
        var row = control.closest('[data-cart-row]');
        if(row){
          if(data.qty <= 0){
            row.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
            row.style.opacity = '0';
            row.style.transform = 'translateX(-12px)';
            setTimeout(function(){ if(!document.querySelector('[data-cart-row]')) location.reload(); else row.remove(); }, 250);
          } else {
            var lineTotal = row.querySelector('[data-line-total]');
            if(lineTotal) lineTotal.textContent = data.lineSubtotal;
          }
        }
        setText('[data-cart-subtotal]', data.subtotal);
        setText('[data-cart-total]', data.subtotal);
        setText('[data-cart-itemcount]', data.itemCount + ' produk');
        if(row && data.itemCount === 0) location.reload();
      })
      .catch(function(){ renderControl(control, current); })
      .then(function(){ control.dataset.busy = ''; });
  });
})();

// Tapping anywhere on a date field opens the picker, not just the small icon.
// On a phone the icon is a ~20px target inside a full-width field; making the
// whole field the target is the difference between "this is a date" and
// "why won't this do anything".
(function(){
  document.addEventListener('click', function(e){
    var input = e.target.closest('input[type="date"], input[type="month"], input[type="time"]');
    if(!input || input.disabled || input.readOnly) return;
    if(typeof input.showPicker !== 'function') return;
    // showPicker throws if the browser doesn't consider this a user gesture,
    // or if the field is already showing one — either way, the native
    // behaviour still applies, so there's nothing to recover from.
    try { input.showPicker(); } catch (err) {}
  });
})();
</script>`;

function customerFooter() {
  return `
  <footer class="px-page" style="padding-top:64px;padding-bottom:40px;">
    <div class="footer-cols">
      <div style="flex:1 1 260px;max-width:320px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
          ${logoMark(30)}
          <span style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:19px;">Pecup</span>
        </div>
        <p style="font-size:13.5px;color:var(--text-muted);line-height:1.7;">Buah segar, dipotong &amp; dikemas higienis setiap hari, siap diantar ke tempatmu.</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <span style="font-size:13px;font-weight:700;color:var(--text-muted);letter-spacing:0.4px;">HUBUNGI KAMI</span>
        <a href="https://wa.me/6281245684104" target="_blank" rel="noopener" style="font-size:14px;color:var(--text);">WhatsApp: +62 812-4568-4104</a>
        <a href="https://instagram.com/pecupchu" target="_blank" rel="noopener" style="font-size:14px;color:var(--text);">Instagram: @pecupchu</a>
      </div>
    </div>
    <p style="text-align:center;font-size:12.5px;color:var(--text-muted);padding-top:24px;">© ${new Date().getFullYear()} Pecup. Semua hak dilindungi.</p>
  </footer>`;
}

function adminSidebar(active, { isSuperadmin = false, username = 'Admin' } = {}) {
  const item = (href, key, label, iconPath) => `
    <a class="side-link ${active === key ? 'side-link-active' : ''}" href="${href}">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${iconPath}</svg>
      ${label}
    </a>`;
  // The checkbox is a plain sibling of the bar and the rail, so the whole
  // menu opens and closes in CSS alone — no JS, and it still works if the
  // script fails to load.
  return `
  <input type="checkbox" id="adminNavToggle" class="admin-nav-toggle">
  <label class="admin-scrim" for="adminNavToggle" aria-hidden="true"></label>
  <div class="admin-topbar">
    <div style="display:flex;align-items:center;gap:9px;min-width:0;">
      ${logoMark(28)}
      <span style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:16px;color:#fff;white-space:nowrap;">Pecup <span style="font-weight:500;font-size:11px;color:oklch(70% 0.02 255);">Admin</span></span>
    </div>
    <label class="admin-burger" for="adminNavToggle">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
      <span class="burger-open">Menu</span>
      <span class="burger-close">Tutup</span>
    </label>
  </div>
  <aside class="admin-sidebar">
    <div class="admin-sidebar-brand" style="display:flex;align-items:center;gap:10px;padding:0 8px;margin-bottom:40px;">
      ${logoMark(32)}
      <span style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:18px;color:#fff;">Pecup <span style="font-weight:500;font-size:12px;color:oklch(70% 0.02 255);">Admin</span></span>
    </div>
    <nav style="display:flex;flex-direction:column;gap:4px;">
      ${item('/admin', 'dashboard', 'Ringkasan', '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>')}
      ${item('/admin/produk', 'produk', 'Produk', '<path d="M20 8l-8-5-8 5v8l8 5 8-5V8z"/><path d="M4 8l8 5 8-5M12 13v8"/>')}
      ${item('/admin/pesanan', 'pesanan', 'Pesanan', '<path d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6"/>')}
      ${item('/admin/pelanggan', 'pelanggan', 'Cari Pelanggan', '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>')}
      ${item('/admin/laporan', 'laporan', 'Laporan Penjualan', '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>')}
      ${item('/admin/reset-sandi', 'reset', 'Reset Password', '<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>')}
      ${
        isSuperadmin
          ? item('/admin/voucher', 'voucher', 'Kode Promo', '<path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-6z"/><path d="M13 5v14" stroke-dasharray="2 3"/>') +
            item('/admin/loyalitas', 'loyalitas', 'Program Stempel', '<path d="M12 2l2.9 6.3 6.6.8-4.9 4.6 1.3 6.6L12 17l-5.9 3.3 1.3-6.6L2.5 9.1l6.6-.8z"/>') +
            item('/admin/pengaturan', 'pengaturan', 'Pengaturan Toko', '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>') +
            item('/admin/akun', 'akun', 'Kelola Admin', '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>') +
            item('/admin/log-aktivitas', 'log', 'Log Aktivitas', '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>')
          : ''
      }
    </nav>
    <div style="margin-top:auto;padding:14px;border-top:1px solid oklch(35% 0.02 255);display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <div style="display:flex;align-items:center;gap:10px;min-width:0;">
        <div style="width:34px;height:34px;border-radius:50%;background:var(--green);color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${escapeHtml(username.charAt(0).toUpperCase())}</div>
        <div style="min-width:0;">
          <div style="font-size:13px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(username)}</div>
          <div style="font-size:10.5px;color:oklch(65% 0.02 255);">${isSuperadmin ? 'Superadmin' : 'Admin'}</div>
        </div>
      </div>
      <form method="post" action="/admin/logout">
        <button type="submit" style="background:none;border:none;color:oklch(65% 0.02 255);font-size:11.5px;cursor:pointer;flex-shrink:0;">Keluar</button>
      </form>
    </div>
  </aside>`;
}

module.exports = { page, logoMark, backButton, customerHeader, customerFooter, adminSidebar };
