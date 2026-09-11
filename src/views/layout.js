const { escapeHtml } = require('../utils');

const SHARED_STYLE = `
  :root{
    --bg:oklch(98% 0.015 95); --surface:oklch(99% 0.006 95); --surface-2:oklch(96% 0.02 95);
    --text:oklch(22% 0.02 260); --text-muted:oklch(48% 0.02 260); --border:oklch(90% 0.012 95);
    --green:oklch(58% 0.15 152); --green-dark:oklch(46% 0.14 152); --green-soft:oklch(94% 0.05 152);
    --orange:oklch(72% 0.17 55); --orange-dark:oklch(58% 0.17 45); --orange-soft:oklch(94% 0.06 55);
    --sidebar:oklch(24% 0.03 255);
  }
  *{box-sizing:border-box;}
  html{scroll-behavior:smooth;}
  html,body{margin:0;padding:0;}
  body{font-family:'Work Sans',sans-serif;background:var(--bg);color:var(--text);}
  h1,h2,h3,h4{font-family:'Plus Jakarta Sans',sans-serif;margin:0;}
  /* Interactive accents are warm (orange = the brand's action colour). Green
     is reserved for *static* meaning — prices, "in stock", success — so it
     never appears as a hover state. */
  a{color:var(--orange-dark);text-decoration:none;transition:color 0.18s ease;}
  a:hover{color:var(--orange);}
  button{font-family:inherit;cursor:pointer;transition:background 0.18s ease, color 0.18s ease, border-color 0.18s ease, transform 0.15s ease, box-shadow 0.18s ease;}
  label{font-size:13.5px;font-weight:600;color:var(--text);display:block;margin-bottom:8px;}
  .req{color:#c94f4f;}
  input, textarea, select{
    width:100%;border:1.5px solid var(--border);border-radius:11px;padding:13px 15px;
    font-family:'Work Sans',sans-serif;font-size:14.5px;color:var(--text);background:var(--surface);outline:none;
    transition:border-color 0.18s ease;
  }
  input:focus, textarea:focus, select:focus{border-color:var(--orange);box-shadow:0 0 0 3px oklch(72% 0.17 55 / 0.16);}
  .field{margin-bottom:20px;}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:28px;}
  .dropzone{border:1.8px dashed var(--border);border-radius:14px;background:var(--surface-2);transition:border-color 0.18s ease, background 0.18s ease;}
  .dropzone:hover{border-color:var(--orange);background:var(--orange-soft);}
  .nav-link{color:var(--text);font-weight:500;font-size:15px;transition:color 0.18s ease;}
  .nav-link:hover{color:var(--orange-dark);}
  .btn-primary{background:var(--orange);color:#fff;border:none;transition:background 0.18s ease, transform 0.15s ease, box-shadow 0.18s ease;}
  .btn-primary:hover{background:var(--orange-dark);transform:translateY(-2px);box-shadow:0 8px 20px -8px oklch(58% 0.17 45 / 0.6);}
  .btn-primary:active{transform:translateY(0) scale(0.98);box-shadow:none;}
  .btn-primary:disabled{opacity:0.6;cursor:not-allowed;transform:none;box-shadow:none;}
  .btn-outline{background:var(--surface);border:1.5px solid var(--border);color:var(--text);transition:border-color 0.18s ease, background 0.18s ease, transform 0.15s ease;}
  .btn-outline:hover{border-color:var(--orange);background:var(--orange-soft);}
  .btn-outline:active{transform:scale(0.98);}
  .chip{border:1.5px solid var(--border);background:var(--surface);transition:border-color 0.18s ease, background 0.18s ease, color 0.18s ease, transform 0.15s ease;}
  .chip:hover{border-color:var(--orange);background:var(--orange-soft);color:var(--orange-dark);}
  .chip:active{transform:scale(0.97);}
  .chip-active{background:var(--green);border-color:var(--green);color:#fff;}
  .chip-active:hover{background:var(--green-dark);border-color:var(--green-dark);color:#fff;}
  .p-card{background:var(--surface);border:1px solid var(--border);transition:border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s cubic-bezier(0.2,0.7,0.3,1);}
  .p-card:hover{border-color:var(--orange);box-shadow:0 14px 32px -16px oklch(58% 0.17 45 / 0.5);transform:translateY(-4px);}
  .p-card img{transition:transform 0.35s cubic-bezier(0.2,0.7,0.3,1);}
  .p-card:hover img{transform:scale(1.05);}
  .mini-card{background:var(--surface);border:1px solid var(--border);transition:border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;}
  .mini-card:hover{border-color:var(--orange);transform:translateY(-3px);box-shadow:0 10px 24px -14px oklch(58% 0.17 45 / 0.45);}
  .add-btn{background:var(--orange-soft);color:var(--orange-dark);border:none;transition:background 0.18s ease, color 0.18s ease, transform 0.15s ease;}
  .add-btn:hover{background:var(--orange);color:#fff;transform:scale(1.08);}
  .add-btn:active{transform:scale(0.94);}
  .icon-btn{background:var(--surface);border:1.5px solid var(--border);}
  .step-btn{background:var(--surface-2);border:none;transition:background 0.18s ease, transform 0.12s ease;}
  .step-btn:hover{background:var(--orange-soft);}
  .step-btn:active{transform:scale(0.92);}
  .trash-btn{background:transparent;border:none;transition:transform 0.15s ease, opacity 0.15s ease;}
  .trash-btn:hover{transform:scale(1.12);}
  .copy-btn{background:var(--orange-soft);color:var(--orange-dark);border:none;transition:background 0.18s ease, color 0.18s ease;}
  .copy-btn:hover{background:var(--orange);color:#fff;}
  .back-btn{display:inline-flex;align-items:center;gap:8px;background:var(--surface);border:1.5px solid var(--border);color:var(--text);
    border-radius:99px;padding:9px 18px 9px 14px;font-size:13.5px;font-weight:600;width:fit-content;cursor:pointer;
    transition:border-color 0.18s ease, background 0.18s ease, transform 0.15s ease;}
  .back-btn:hover{border-color:var(--orange);background:var(--orange-soft);color:var(--orange-dark);}
  .back-btn:hover svg{transform:translateX(-3px);}
  .back-btn:active{transform:scale(0.97);}
  .back-btn svg{transition:transform 0.18s ease;}
  /* Gojek-style quantity stepper shown on a product once it's in the cart. */
  .qty-control{display:flex;align-items:center;justify-content:flex-end;}
  .qty-stepper{display:inline-flex;align-items:center;gap:2px;background:var(--orange-soft);border-radius:10px;padding:3px;
    animation:pecup-stepper-in 0.22s cubic-bezier(0.2,0.9,0.3,1.2);}
  .qty-stepper button{width:28px;height:28px;border-radius:8px;border:none;background:transparent;color:var(--orange-dark);
    display:flex;align-items:center;justify-content:center;transition:background 0.15s ease, transform 0.12s ease;}
  .qty-stepper button:hover:not(:disabled){background:var(--orange);color:#fff;}
  .qty-stepper button:active:not(:disabled){transform:scale(0.88);}
  .qty-stepper button:disabled{opacity:0.35;cursor:not-allowed;}
  .qty-stepper .qty-value{min-width:24px;text-align:center;font-size:14px;font-weight:800;color:var(--orange-dark);
    font-variant-numeric:tabular-nums;}
  .qty-bump{animation:pecup-pop 0.3s ease;}
  @keyframes pecup-stepper-in{from{opacity:0;transform:scale(0.82);}to{opacity:1;transform:scale(1);}}
  @keyframes pecup-fade-up{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:none;}}
  .fade-up{animation:pecup-fade-up 0.45s cubic-bezier(0.2,0.7,0.3,1) both;}
  main, section{animation:pecup-fade-up 0.4s cubic-bezier(0.2,0.7,0.3,1) both;}
  @media (prefers-reduced-motion: reduce){
    html{scroll-behavior:auto;}
    *, *::before, *::after{animation-duration:0.001ms !important;animation-iteration-count:1 !important;
      transition-duration:0.001ms !important;scroll-behavior:auto !important;}
  }
  .side-link{color:oklch(80% 0.02 255);display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:10px;font-size:14.5px;font-weight:600;transition:background 0.18s ease, color 0.18s ease;}
  .side-link:hover{color:#fff;background:oklch(30% 0.03 255);}
  @keyframes pecup-pop{0%{transform:scale(1);}40%{transform:scale(1.18);}100%{transform:scale(1);}}
  .cart-pop{animation:pecup-pop 0.35s ease;}
  .side-link-active{background:var(--green);color:#fff;}
  .search-input{border:1.5px solid var(--border);background:var(--surface);}
  .row-hover:hover{background:var(--surface-2);}
  .icon-action{background:transparent;border:none;}
  .lihat-btn{background:var(--surface-2);border:1px solid var(--border);color:var(--text);}
  .toggle-pill{width:44px;height:26px;border-radius:99px;padding:3px;display:inline-flex;border:none;cursor:pointer;}
  .toggle-on{background:var(--green);justify-content:flex-end;}
  .toggle-off{background:var(--surface-2);border:1px solid var(--border);justify-content:flex-start;}
  .toggle-dot{width:18px;height:18px;border-radius:50%;background:#fff;}
  .flash{padding:14px 18px;border-radius:12px;font-size:13.5px;margin-bottom:20px;}
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
  .grid-4{display:grid;grid-template-columns:repeat(4, minmax(0,1fr));gap:28px;}
  .grid-3{display:grid;grid-template-columns:repeat(3, minmax(0,1fr));gap:36px;}
  .hero{display:flex;align-items:center;justify-content:space-between;gap:64px;flex-wrap:wrap;}
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
  .site-header{display:flex;align-items:center;justify-content:space-between;padding:22px 96px;border-bottom:1px solid var(--border);background:var(--surface);gap:16px;flex-wrap:wrap;position:sticky;top:0;z-index:50;}
  /* 3-column grid (logo / nav / cart) so the nav links land truly centered
     regardless of the logo and cart icon having different widths — plain
     flex space-between can't center a middle item between unequal siblings. */
  .site-header-grid{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:22px 96px;border-bottom:1px solid var(--border);background:var(--surface);gap:16px;position:sticky;top:0;z-index:50;}
  .site-nav{display:flex;gap:40px;flex-wrap:wrap;justify-content:center;}
  .success-card{padding:56px 60px;}
  .admin-shell{display:flex;align-items:flex-start;flex-wrap:wrap;}
  .admin-sidebar{flex:0 0 240px;background:var(--sidebar);min-height:1000px;padding:28px 20px;display:flex;flex-direction:column;}
  .admin-main{flex:1 1 480px;min-width:0;padding:32px 40px;}
  table.admin-table{width:100%;border-collapse:collapse;}
  .table-scroll{overflow-x:auto;}

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
    .admin-sidebar{flex:1 1 100%;min-height:auto;}
    .admin-main{padding:24px 20px;}
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

function page({ title, bodyHtml, extraHead = '' }) {
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="icon" type="image/png" href="/assets/pecup-logo.png">
<link rel="apple-touch-icon" href="/assets/pecup-logo.png">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Work+Sans:wght@400;500;600&display=swap">
<style>${SHARED_STYLE}</style>
${extraHead}
</head>
<body>
${bodyHtml}
${CART_SCRIPT}
</body>
</html>`;
}

// Always renders a real link (never history.back()) so the destination is
// predictable no matter how the shopper arrived — deep link, refresh, or
// a normal click-through.
function backButton(href, label = 'Kembali') {
  return `<a class="back-btn" href="${href}">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
    ${escapeHtml(label)}
  </a>`;
}

function logoMark(size = 38) {
  return `<img src="/assets/pecup-logo.png" width="${size}" height="${size}" alt="Pecup" style="border-radius:50%;object-fit:cover;flex-shrink:0;">`;
}

function customerHeader(cartCount = 0, activeStepLabel = null) {
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
    <a href="/keranjang" style="position:relative;display:flex;align-items:center;justify-self:end;">
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#2b2b2f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6"/><circle cx="10" cy="21" r="1.4" fill="#2b2b2f" stroke="none"/><circle cx="18" cy="21" r="1.4" fill="#2b2b2f" stroke="none"/></svg>
      <span id="cartBadge" style="position:absolute;top:-8px;right:-9px;background:var(--orange);color:#fff;font-size:10px;font-weight:700;width:16px;height:16px;border-radius:50%;align-items:center;justify-content:center;display:${cartCount > 0 ? 'flex' : 'none'};">${cartCount}</span>
    </a>
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

  // ---- Gojek-style quantity stepper -------------------------------------
  // A .qty-control starts as a single "+" button and swaps to a [-][n][+]
  // stepper the moment the product is in the cart. The server owns the real
  // quantity: we send the target qty and re-render from whatever it returns
  // (it clamps to available stock), so the UI can't drift out of sync.
  function stepperMarkup(qty, stock){
    var minus = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 12h14"/></svg>';
    var plus = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
    if(qty <= 0){
      return '<button class="add-btn qty-step" data-delta="1" type="button" title="Tambah ke keranjang" ' +
        'style="width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;">' + plus + '</button>';
    }
    var atMax = stock > 0 && qty >= stock;
    return '<span class="qty-stepper">' +
      '<button class="qty-step" data-delta="-1" type="button" aria-label="Kurangi">' + minus + '</button>' +
      '<span class="qty-value">' + qty + '</span>' +
      '<button class="qty-step" data-delta="1" type="button" aria-label="Tambah"' + (atMax ? ' disabled title="Stok maksimum"' : '') + '>' + plus + '</button>' +
      '</span>';
  }

  function renderControl(control, qty){
    var stock = Number(control.dataset.stock || 0);
    control.dataset.qty = String(qty);
    control.innerHTML = stepperMarkup(qty, stock);
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
    var target = current + Number(btn.dataset.delta || 0);
    if(target < 0) target = 0;
    control.dataset.busy = '1';

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
        if(!data || !data.ok) return;
        renderControl(control, data.qty);
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
      .catch(function(){})
      .then(function(){ control.dataset.busy = ''; });
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
  return `
  <aside class="admin-sidebar">
    <a href="/admin/produk" style="display:flex;align-items:center;gap:10px;padding:0 8px;margin-bottom:40px;">
      ${logoMark(32)}
      <span style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:18px;color:#fff;">Pecup <span style="font-weight:500;font-size:12px;color:oklch(70% 0.02 255);">Admin</span></span>
    </a>
    <nav style="display:flex;flex-direction:column;gap:4px;">
      ${item('/admin/produk', 'produk', 'Produk', '<path d="M20 8l-8-5-8 5v8l8 5 8-5V8z"/><path d="M4 8l8 5 8-5M12 13v8"/>')}
      ${item('/admin/pesanan', 'pesanan', 'Pesanan', '<path d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6"/>')}
      ${
        isSuperadmin
          ? item('/admin/akun', 'akun', 'Kelola Admin', '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>') +
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
