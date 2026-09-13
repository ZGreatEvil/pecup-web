// TEMPORARY diagnostic page: /admin/uji-video
//
// Autoplay has failed on a real phone while working on every desktop browser
// here, and guessing from the markup has run out of road — the product page
// renders exactly the attributes the platforms document as sufficient. This
// page runs the same clip under several variations ON THAT PHONE and reports
// what the browser actually says, including the reason play() was refused.
//
// It is admin-only and noindex. Delete this file and its route in
// api/index.js once the cause is known — nothing else imports it.
const { page } = require('./layout');
const { escapeAttr, escapeHtml } = require('../utils');

function renderVideoDiag({ videoUrl, posterUrl }) {
  if (!videoUrl) {
    return page({
      title: 'Uji Video — Admin Pecup',
      noindex: true,
      bodyHtml: `<div class="px-page" style="padding:40px 0;max-width:640px;margin:0 auto;">
        <h1 style="font-size:22px;font-weight:800;margin-bottom:12px;">Uji Video</h1>
        <p style="font-size:14px;line-height:1.7;">Belum ada produk yang punya video, jadi tidak ada yang bisa diuji.
        Unggah satu video di halaman produk dulu, lalu buka halaman ini lagi.</p>
      </div>`,
    });
  }

  // Each case changes exactly one thing, so whichever one plays names the cause.
  const cases = [
    { id: 'a', label: 'Persis seperti di halaman produk', frag: '#t=0.1', controls: true, poster: false },
    { id: 'b', label: 'Tanpa #t=0.1 (tanpa lompat ke detik 0,1)', frag: '', controls: true, poster: false },
    { id: 'c', label: 'Tanpa tombol kontrol', frag: '', controls: false, poster: false },
    { id: 'd', label: 'Dengan gambar sampul (poster)', frag: '', controls: true, poster: true },
  ];

  const blocks = cases
    .map(
      (c) => `
      <div class="uji-case" data-case="${c.id}">
        <div class="uji-head">
          <strong>${c.id.toUpperCase()}. ${escapeHtml(c.label)}</strong>
          <span class="uji-verdict" data-verdict>menunggu…</span>
        </div>
        <video id="v-${c.id}" src="${escapeAttr(videoUrl)}${c.frag}" muted playsinline autoplay preload="auto"
               ${c.controls ? 'controls' : ''} ${c.poster && posterUrl ? `poster="${escapeAttr(posterUrl)}"` : ''}
               disablepictureinpicture></video>
        <div class="uji-detail" data-detail></div>
      </div>`
    )
    .join('');

  const body = `
<div class="px-page" style="padding:28px 0 60px;max-width:640px;margin:0 auto;">
  <h1 style="font-size:22px;font-weight:800;margin-bottom:6px;">Uji Video</h1>
  <p style="font-size:13.5px;color:var(--text-muted);line-height:1.7;margin-bottom:20px;">
    Halaman sementara untuk mencari tahu kenapa video tidak jalan sendiri di HP ini.
    Buka halaman ini <strong>tanpa menyentuh layar dulu</strong>, tunggu beberapa detik, lalu lihat hasilnya.
  </p>

  <div class="uji-box" id="ujiEnv"><strong>Kondisi HP ini</strong><div id="envList"></div></div>

  ${blocks}

  <div class="uji-box">
    <strong>Kalau semua gagal</strong>
    <p style="font-size:13px;line-height:1.7;margin:8px 0 12px;">Tekan tombol di bawah. Kalau videonya jalan setelah ditekan,
    berarti HP-nya memang melarang video jalan sendiri — bukan kode webnya.</p>
    <button type="button" id="ujiTap" class="btn-primary" style="padding:12px 20px;border-radius:10px;font-weight:700;">Coba jalankan sekarang</button>
    <div class="uji-detail" id="tapResult"></div>
  </div>
</div>
<style>
  .uji-box, .uji-case{border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:16px;background:var(--surface);}
  .uji-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:13.5px;margin-bottom:10px;}
  .uji-verdict{font-size:12px;font-weight:800;padding:4px 10px;border-radius:99px;background:var(--surface-2);white-space:nowrap;}
  .uji-verdict.is-ok{background:var(--green-soft);color:var(--green-dark);}
  .uji-verdict.is-bad{background:#f6dcdc;color:#a13f3f;}
  .uji-case video{width:100%;max-height:220px;object-fit:cover;border-radius:10px;background:#0b0b0c;display:block;}
  .uji-detail{font-size:12px;color:var(--text-muted);line-height:1.7;margin-top:9px;word-break:break-word;}
  #envList{font-size:12.5px;line-height:1.9;margin-top:8px;}
  #envList span{display:block;}
</style>
<script>
(function(){
  var env = document.getElementById('envList');
  function line(k, v){
    var s = document.createElement('span');
    s.textContent = k + ': ' + v;
    env.appendChild(s);
  }
  var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  // saveData is Android's data saver, which blocks autoplay outright.
  line('Hemat data (data saver)', conn && typeof conn.saveData === 'boolean' ? (conn.saveData ? 'AKTIF' : 'tidak') : 'tidak diketahui');
  line('Jenis koneksi', conn && conn.effectiveType ? conn.effectiveType : 'tidak diketahui');
  line('Kurangi animasi', (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'AKTIF' : 'tidak');
  line('Layar', window.innerWidth + ' x ' + window.innerHeight);
  line('Browser', navigator.userAgent);

  var cases = document.querySelectorAll('.uji-case');
  for(var i=0;i<cases.length;i++){
    (function(box){
      var v = box.querySelector('video');
      var verdict = box.querySelector('[data-verdict]');
      var detail = box.querySelector('[data-detail]');
      var notes = [];
      function say(text, good){
        verdict.textContent = text;
        verdict.className = 'uji-verdict ' + (good ? 'is-ok' : 'is-bad');
      }
      function render(){
        detail.textContent = notes.join(' | ');
      }
      v.addEventListener('playing', function(){ say('JALAN', true); notes.push('mulai jalan'); render(); });
      v.addEventListener('error', function(){
        say('ERROR', false);
        notes.push('error kode ' + (v.error && v.error.code));
        render();
      });
      // The scripted attempt, same as the real page makes.
      var p = null;
      try{ p = v.play(); }catch(e){ notes.push('play() melempar: ' + e.name); }
      if(p && p.then){
        p.then(function(){ notes.push('play() diterima'); render(); })
         .catch(function(e){
           notes.push('play() DITOLAK: ' + (e && e.name) + ' - ' + (e && e.message ? String(e.message).slice(0,90) : ''));
           render();
         });
      }
      setTimeout(function(){
        if(v.paused) say('TIDAK JALAN', false);
        notes.push('paused=' + v.paused);
        notes.push('readyState=' + v.readyState);
        notes.push('muted=' + v.muted);
        notes.push('detik=' + v.currentTime.toFixed(2));
        render();
      }, 4000);
    })(cases[i]);
  }

  document.getElementById('ujiTap').addEventListener('click', function(){
    var out = document.getElementById('tapResult');
    var v = document.getElementById('v-a');
    v.muted = true;
    var p = null;
    try{ p = v.play(); }catch(e){ out.textContent = 'play() melempar: ' + e.name; return; }
    if(p && p.then){
      p.then(function(){ out.textContent = 'Berhasil jalan setelah disentuh — berarti HP-nya yang melarang video jalan sendiri.'; })
       .catch(function(e){ out.textContent = 'Tetap ditolak walau sudah disentuh: ' + (e && e.name); });
    }
  });
})();
</script>`;

  return page({ title: 'Uji Video — Admin Pecup', bodyHtml: body, noindex: true });
}

module.exports = { renderVideoDiag };
