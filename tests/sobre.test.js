// Página "Sobre a plataforma": vídeo só de fontes conhecidas e links a partir do sistema.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { enderecoDoVideo } = require('../docs/sobre.js');

const DOCS = path.join(__dirname, '..', 'docs');

test('enderecoDoVideo: YouTube, Vimeo, Google Drive e .mp4 local viram endereços de exibição', () => {
  const yt = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0';
  assert.deepEqual(enderecoDoVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), { tipo: 'iframe', src: yt });
  assert.deepEqual(enderecoDoVideo('https://youtu.be/dQw4w9WgXcQ?si=abc'), { tipo: 'iframe', src: yt });
  assert.deepEqual(enderecoDoVideo('https://m.youtube.com/shorts/dQw4w9WgXcQ'), { tipo: 'iframe', src: yt });
  assert.deepEqual(enderecoDoVideo('https://vimeo.com/123456789'), { tipo: 'iframe', src: 'https://player.vimeo.com/video/123456789' });
  assert.deepEqual(enderecoDoVideo('https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view?usp=sharing'),
    { tipo: 'iframe', src: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMn/preview' });
  assert.deepEqual(enderecoDoVideo('video/fioconecta.mp4'), { tipo: 'video', src: 'video/fioconecta.mp4' });
});

test('enderecoDoVideo: vazio, outros sites, http, javascript e caminhos estranhos são ignorados', () => {
  for (const link of ['', '   ', 'http://youtu.be/dQw4w9WgXcQ', 'https://evil.example/watch?v=dQw4w9WgXcQ',
    'javascript:alert(1)', 'https://www.youtube.com/watch?v=<script>', '../segredo.mp4', '/video/x.mp4',
    'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ', 'https://drive.google.com/open?id=abc']) {
    assert.equal(enderecoDoVideo(link), null, link);
  }
});

test('sobre.html: CSP só libera os players aceitos; links a partir do sistema', () => {
  const sobre = fs.readFileSync(path.join(DOCS, 'sobre.html'), 'utf8');
  const csp = sobre.match(/Content-Security-Policy"\s+content="([^"]+)"/)[1];
  assert.match(csp, /frame-src https:\/\/www\.youtube-nocookie\.com https:\/\/player\.vimeo\.com https:\/\/drive\.google\.com;/);
  assert.match(csp, /script-src 'self';/);
  assert.ok(!/innerHTML/.test(fs.readFileSync(path.join(DOCS, 'sobre.js'), 'utf8')));
  assert.match(sobre, /href="index\.html"/);
  const index = fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8');
  assert.ok((index.match(/href="sobre\.html"/g) || []).length >= 3, 'navegação, tela de entrada e rodapé');
  assert.match(index, /<option value="meses3">Prazo nos próximos 3 meses<\/option>/);
});
