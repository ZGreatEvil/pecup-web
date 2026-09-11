// Minimal hand-rolled SMTP client (no external dependencies) good enough for
// sending order-notification emails through Gmail with an App Password.
// Talks raw SMTP over an implicit-TLS connection (port 465).
const tls = require('tls');
const path = require('path');

function smtpConversation(host, port, exchange) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host }, () => {
      // connected; wait for the 220 greeting before doing anything
    });

    let buffer = '';
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.destroy();
        reject(new Error('Waktu koneksi SMTP habis (timeout).'));
      }
    }, 20000);

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
    });

    socket.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    socket.on('close', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error('Koneksi SMTP terputus sebelum selesai.'));
      }
    });

    // Reads a complete SMTP reply (may be multi-line, ending in "CODE ") from `buffer`.
    function waitForReply() {
      return new Promise((res, rej) => {
        const check = () => {
          const lines = buffer.split('\r\n').filter(Boolean);
          if (lines.length === 0) return false;
          const last = lines[lines.length - 1];
          const m = /^(\d{3})([ -])/.exec(last);
          if (!m) return false;
          if (m[2] === ' ') {
            const code = Number(m[1]);
            const consumed = buffer;
            buffer = '';
            res({ code, text: consumed });
            return true;
          }
          return false;
        };
        if (check()) return;
        const onData = () => {
          if (check()) socket.removeListener('data', onData);
        };
        socket.on('data', onData);
      });
    }

    function send(line) {
      socket.write(line + '\r\n');
    }

    (async () => {
      try {
        const greeting = await waitForReply();
        if (greeting.code !== 220) throw new Error('SMTP tidak menyambut koneksi: ' + greeting.text);
        const result = await exchange({ send, waitForReply, socket });
        clearTimeout(timeout);
        settled = true;
        socket.end();
        resolve(result);
      } catch (err) {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          socket.destroy();
          reject(err);
        }
      }
    })();
  });
}

function b64(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

function wrapBase64(buffer) {
  const b64str = buffer.toString('base64');
  const lines = [];
  for (let i = 0; i < b64str.length; i += 76) lines.push(b64str.slice(i, i + 76));
  return lines.join('\r\n');
}

// Dot-stuff lines that begin with "." per RFC 5321 before the DATA terminator.
function dotStuff(message) {
  return message
    .split('\r\n')
    .map((line) => (line.startsWith('.') ? '.' + line : line))
    .join('\r\n');
}

function buildMimeMessage({ from, to, subject, html, attachment }) {
  const boundary = 'pecup_' + Date.now() + '_' + Math.random().toString(16).slice(2);
  const headers = [
    `From: Pecup <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
  ].join('\r\n');

  const htmlPart = [
    `--${boundary}`,
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    html,
    '',
  ].join('\r\n');

  let attachmentPart = '';
  if (attachment) {
    const safeName = path.basename(attachment.filename).replace(/"/g, '');
    attachmentPart = [
      `--${boundary}`,
      `Content-Type: ${attachment.mimetype}; name="${safeName}"`,
      `Content-Disposition: attachment; filename="${safeName}"`,
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64(attachment.buffer),
      '',
    ].join('\r\n');
  }

  const closing = `--${boundary}--`;

  return headers + '\r\n' + htmlPart + attachmentPart + closing;
}

async function sendMail({ user, appPassword, to, subject, html, attachment, host = 'smtp.gmail.com', port = 465 }) {
  return smtpConversation(host, port, async ({ send, waitForReply }) => {
    const expect = async (expectedCodes, label) => {
      const reply = await waitForReply();
      const codes = Array.isArray(expectedCodes) ? expectedCodes : [expectedCodes];
      if (!codes.includes(reply.code)) {
        throw new Error(`SMTP gagal pada langkah ${label}: ${reply.text.trim()}`);
      }
      return reply;
    };

    send(`EHLO pecup.local`);
    await expect(250, 'EHLO');

    send('AUTH LOGIN');
    await expect(334, 'AUTH LOGIN');

    send(b64(user));
    await expect(334, 'username');

    send(b64(appPassword));
    await expect(235, 'password (periksa App Password Gmail Anda)');

    send(`MAIL FROM:<${user}>`);
    await expect(250, 'MAIL FROM');

    send(`RCPT TO:<${to}>`);
    await expect([250, 251], 'RCPT TO');

    send('DATA');
    await expect(354, 'DATA');

    const message = buildMimeMessage({ from: user, to, subject, html, attachment });
    send(dotStuff(message) + '\r\n.');
    await expect(250, 'pengiriman isi email');

    send('QUIT');
    // Not all servers reply politely to QUIT before closing; ignore result.
    try {
      await waitForReply();
    } catch (_) {
      /* ignore */
    }

    return true;
  });
}

module.exports = { sendMail };
