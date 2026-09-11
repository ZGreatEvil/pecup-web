const SHARED_STYLE = `
  :root{
    --bg:oklch(98% 0.015 95); --surface:oklch(99% 0.006 95); --surface-2:oklch(96% 0.02 95);
    --text:oklch(22% 0.02 260); --text-muted:oklch(48% 0.02 260); --border:oklch(90% 0.012 95);
    --green:oklch(58% 0.15 152); --green-dark:oklch(46% 0.14 152); --green-soft:oklch(94% 0.05 152);
    --orange:oklch(72% 0.17 55); --orange-dark:oklch(58% 0.17 45); --orange-soft:oklch(94% 0.06 55);
    --sidebar:oklch(24% 0.03 255);
  }
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{font-family:'Work Sans',sans-serif;background:var(--bg);color:var(--text);}
  h1,h2,h3,h4{font-family:'Plus Jakarta Sans',sans-serif;margin:0;}
  a{color:var(--green-dark);text-decoration:none;}
  a:hover{color:var(--green);}
  button{font-family:inherit;cursor:pointer;}
  label{font-size:13.5px;font-weight:600;color:var(--text);display:block;margin-bottom:8px;}
  input, textarea, select{
    width:100%;border:1.5px solid var(--border);border-radius:11px;padding:13px 15px;
    font-family:'Work Sans',sans-serif;font-size:14.5px;color:var(--text);background:var(--surface);outline:none;
  }
  input:focus, textarea:focus, select:focus{border-color:var(--green);}
  .field{margin-bottom:20px;}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:28px;}
  .dropzone{border:1.8px dashed var(--border);border-radius:14px;background:var(--surface-2);}
  .dropzone:hover{border-color:var(--green);}
  .nav-link{color:var(--text);font-weight:500;font-size:15px;}
  .nav-link:hover{color:var(--green-dark);}
  .btn-primary{background:var(--orange);color:#fff;border:none;}
  .btn-primary:hover{background:var(--orange-dark);}
  .btn-primary:disabled{opacity:0.6;cursor:not-allowed;}
  .btn-outline{background:var(--surface);border:1.5px solid var(--border);color:var(--text);}
  .btn-outline:hover{border-color:var(--green);color:var(--green-dark);}
  .chip{border:1.5px solid var(--border);background:var(--surface);}
  .chip:hover{border-color:var(--green);}
  .chip-active{background:var(--green);border-color:var(--green);color:#fff;}
  .p-card{background:var(--surface);border:1px solid var(--border);}
  .p-card:hover{border-color:var(--green);box-shadow:0 8px 24px -12px oklch(58% 0.15 152 / 0.35);}
  .mini-card{background:var(--surface);border:1px solid var(--border);}
  .add-btn{background:var(--green-soft);color:var(--green-dark);border:none;}
  .add-btn:hover{background:var(--green);color:#fff;}
  .icon-btn{background:var(--surface);border:1.5px solid var(--border);}
  .step-btn{background:var(--surface-2);border:none;}
  .step-btn:hover{background:var(--green-soft);}
  .trash-btn{background:transparent;border:none;}
  .copy-btn{background:var(--green-soft);color:var(--green-dark);border:none;}
  .copy-btn:hover{background:var(--green);color:#fff;}
  .side-link{color:oklch(80% 0.02 255);display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:10px;font-size:14.5px;font-weight:600;}
  .side-link:hover{color:#fff;background:oklch(30% 0.03 255);}
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
  .frame-scroll{overflow-x:hidden;}

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
  .site-header{display:flex;align-items:center;justify-content:space-between;padding:22px 96px;border-bottom:1px solid var(--border);background:var(--surface);gap:16px;flex-wrap:wrap;}
  .site-nav{display:flex;gap:40px;flex-wrap:wrap;}
  .success-card{padding:56px 60px;}
  .admin-shell{display:flex;align-items:flex-start;flex-wrap:wrap;}
  .admin-sidebar{flex:0 0 240px;background:var(--sidebar);min-height:1000px;padding:28px 20px;display:flex;flex-direction:column;}
  .admin-main{flex:1 1 480px;min-width:0;padding:32px 40px;}
  table.admin-table{width:100%;border-collapse:collapse;}
  .table-scroll{overflow-x:auto;}

  @media (max-width: 1180px){
    .px-page{padding-left:56px;padding-right:56px;}
    .site-header{padding-left:56px;padding-right:56px;}
    .grid-4{grid-template-columns:repeat(3, minmax(0,1fr));}
  }
  @media (max-width: 860px){
    .px-page{padding-left:32px;padding-right:32px;}
    .site-header{padding:18px 32px;}
    .grid-4{grid-template-columns:repeat(2, minmax(0,1fr));gap:20px;}
    .grid-3{grid-template-columns:1fr;gap:28px;}
    .site-nav{gap:24px;}
    .admin-sidebar{flex:1 1 100%;min-height:auto;}
    .admin-main{padding:24px 20px;}
  }
  @media (max-width: 560px){
    .px-page{padding-left:18px;padding-right:18px;}
    .site-header{padding:16px 18px;}
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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Work+Sans:wght@400;500;600&display=swap">
<style>${SHARED_STYLE}</style>
${extraHead}
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

function logoMark(size = 38) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#58a05c"/><path d="M10 23c0-8 6-14 14-14 0 8-6 14-14 14z" fill="#e88a3a"/></svg>`;
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
  <header class="site-header">
    <a href="/" style="display:flex;align-items:center;gap:12px;">
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
    <a href="/keranjang" style="position:relative;display:flex;align-items:center;">
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#2b2b2f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6"/><circle cx="10" cy="21" r="1.4" fill="#2b2b2f" stroke="none"/><circle cx="18" cy="21" r="1.4" fill="#2b2b2f" stroke="none"/></svg>
      ${
        cartCount > 0
          ? `<span style="position:absolute;top:-8px;right:-9px;background:var(--orange);color:#fff;font-size:10px;font-weight:700;width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;">${cartCount}</span>`
          : ''
      }
    </a>
  </header>`;
}

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
        <span style="font-size:14px;">WhatsApp: [NOMOR WHATSAPP]</span>
        <span style="font-size:14px;">Instagram: [@pecup.id]</span>
      </div>
    </div>
    <p style="text-align:center;font-size:12.5px;color:var(--text-muted);padding-top:24px;">© ${new Date().getFullYear()} Pecup. Semua hak dilindungi.</p>
  </footer>`;
}

function adminSidebar(active) {
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
    </nav>
    <div style="margin-top:auto;padding:14px;border-top:1px solid oklch(35% 0.02 255);display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:34px;height:34px;border-radius:50%;background:var(--green);color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;">A</div>
        <span style="font-size:13px;font-weight:600;color:#fff;">Admin Pecup</span>
      </div>
      <form method="post" action="/admin/logout">
        <button type="submit" style="background:none;border:none;color:oklch(65% 0.02 255);font-size:11.5px;cursor:pointer;">Keluar</button>
      </form>
    </div>
  </aside>`;
}

module.exports = { page, logoMark, customerHeader, customerFooter, adminSidebar };
