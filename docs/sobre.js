/*
 * sobre.js — exibe o vídeo da página "Sobre a plataforma".
 *
 * O link fica no atributo data-video de #video (sobre.html). Aceita YouTube (exibido pelo domínio
 * youtube-nocookie), Vimeo, Google Drive (arquivo compartilhado com "qualquer pessoa com o link")
 * ou um arquivo .mp4 desta pasta. Link vazio ou fora desses formatos: fica o aviso "em breve".
 * Só monta endereços de embed a partir de IDs conferidos; nada de HTML vindo do atributo.
 */
(function (raiz) {
  'use strict';

  var ID = /^[A-Za-z0-9_-]{6,64}$/;

  /** Link informado → { tipo: 'iframe' | 'video', src } ou null. */
  function enderecoDoVideo(link) {
    var t = String(link || '').trim();
    if (!t) return null;
    if (/^[A-Za-z0-9_\-/]+\.mp4$/.test(t) && t.indexOf('..') < 0 && t.charAt(0) !== '/') return { tipo: 'video', src: t };
    var u;
    try { u = new URL(t); } catch (e) { return null; }
    if (u.protocol !== 'https:') return null;
    var host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
    var partes = u.pathname.split('/').filter(Boolean);
    var id = '';
    if (host === 'youtu.be') id = partes[0];
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (partes[0] === 'watch') id = u.searchParams.get('v');
      else if (partes[0] === 'embed' || partes[0] === 'shorts' || partes[0] === 'live') id = partes[1];
    }
    if (id) return ID.test(id) ? { tipo: 'iframe', src: 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0' } : null;
    if (host === 'vimeo.com' && /^\d{4,15}$/.test(partes[0] || '')) return { tipo: 'iframe', src: 'https://player.vimeo.com/video/' + partes[0] };
    if (host === 'player.vimeo.com' && partes[0] === 'video' && /^\d{4,15}$/.test(partes[1] || '')) return { tipo: 'iframe', src: 'https://player.vimeo.com/video/' + partes[1] };
    if (host === 'drive.google.com' && partes[0] === 'file' && partes[1] === 'd' && ID.test(partes[2] || '')) {
      return { tipo: 'iframe', src: 'https://drive.google.com/file/d/' + partes[2] + '/preview' };
    }
    return null;
  }

  function montar(doc) {
    var caixa = doc.getElementById('video');
    if (!caixa) return;
    var v = enderecoDoVideo(caixa.getAttribute('data-video'));
    if (!v) return;
    var titulo = caixa.getAttribute('data-titulo') || 'Vídeo';
    var elemento;
    if (v.tipo === 'video') {
      elemento = doc.createElement('video');
      elemento.controls = true;
      elemento.preload = 'metadata';
      elemento.src = v.src;
      elemento.setAttribute('aria-label', titulo);
    } else {
      elemento = doc.createElement('iframe');
      elemento.src = v.src;
      elemento.title = titulo;
      elemento.loading = 'lazy';
      elemento.allow = 'fullscreen; picture-in-picture';
      elemento.setAttribute('allowfullscreen', '');
      elemento.referrerPolicy = 'strict-origin-when-cross-origin';
    }
    caixa.textContent = '';
    caixa.classList.add('sobre-video-ativo');
    caixa.appendChild(elemento);
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { enderecoDoVideo: enderecoDoVideo };
  else if (raiz.document) montar(raiz.document);
})(typeof window !== 'undefined' ? window : this);
