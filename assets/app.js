/* Cap Templemars : suivi de recherche de logement.
   Données partagées : data/data.json (pistes, itinéraires, messages).
   Suivi personnel (statuts, notes, cases, téléphone) : navigateur uniquement (localStorage). */
(function () {
'use strict';
var D = null;
var KEY = 'cap-templemars-state-v2', THEME = 'cap-templemars-theme';
var STATUS = ['À faire', 'Contacté', 'Relancé', 'Réponse reçue', 'Visite prévue', 'Refusé', 'Retenu'];
var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
var $ = function (s, r) { return (r || document).querySelector(s); };
var desk = window.matchMedia('(min-width:1024px)');
function pad(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function parse(s) { var a = s.split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); }
function days(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
function fr(s) { var d = parse(s); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1); }
function km(n) { return String(n).replace('.', ','); }
function dur(m) { return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + pad(m % 60) : ''); }
function clock(iso) { return new Date(iso).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }); }
function span(list) { var a = list.map(function (o) { return o.min; }), lo = Math.min.apply(null, a), hi = Math.max.apply(null, a); return lo === hi ? dur(lo) : hi < 60 ? lo + ' à ' + hi + ' min' : dur(lo) + ' à ' + dur(hi); }
var MODE = { BUS: 'Bus', COACH: 'Car', TRAM: 'Tram', SUBWAY: 'Métro', METRO: 'Métro', RAIL: 'Train', REGIONAL_RAIL: 'Train', REGIONAL_FAST_RAIL: 'Train', SUBURBAN: 'Train', HIGHSPEED_RAIL: 'Train', LONG_DISTANCE: 'Train', NIGHT_RAIL: 'Train' };
var TODAY = ymd(new Date());

/* ---------- état ---------- */
var S = { tasks: {}, pistes: {}, alerts: {}, docs: {}, custom: [], maxMin: 35, notifDay: '', docType: 'part', profile: { tel: '' }, mail: { id: '', tpl: '', subject: '', body: '', ok: false }, pView: 'list', dTab: 'docs', sel: '' };
try { var raw = localStorage.getItem(KEY); if (raw) { var o = JSON.parse(raw); for (var k in o) S[k] = o[k]; } } catch (e) {}
if (!S.profile) S.profile = { tel: '' };
if (!S.custom) S.custom = [];
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

/* ---------- métier ---------- */
function all() { return D.pistes.concat(S.custom); }
function byId(id) { return all().filter(function (x) { return x.id === id; })[0] || null; }
function route(p) { return p.onsite || !p.route ? null : D.routes[p.route.key] || null; }
function mins(p) { var r = route(p); return p.onsite ? 0 : r ? r.min : 99; }
function kms(p) { var r = route(p); return r ? r.km : 0; }
function zone(m) { return m <= 20 ? 'z-near' : m <= 30 ? 'z-mid' : 'z-far'; }
function st(p) { return (S.pistes[p.id] && S.pistes[p.id].s) || 'À faire'; }
function ps(id) { return S.pistes[id] || (S.pistes[id] = {}); }
function due(p) { var x = S.pistes[p.id]; if (!x || !x.d) return false; if (x.s === 'Contacté') return days(x.d, TODAY) >= 3; if (x.s === 'Relancé') return days(x.d, TODAY) >= 4; return false; }
var ORDER = { 'A?': 0, A: 0, B: 1, C: 2, ecarte: 8, arnaque: 9 };
function sorted(l) { return l.slice().sort(function (a, b) { return (mins(a) - mins(b)) || (ORDER[a.score] - ORDER[b.score]); }); }
function active() { return all().filter(function (p) { return ORDER[p.score] < 8; }); }
function left() { return Math.max(0, days(TODAY, D.meta.deadline)); }
function kind(p) {
  var n = p.name.toLowerCase();
  if (p.kind === 'structure') return { un: 'une demande de logement', le: 'ma demande de logement' };
  if (/colocation/.test(n) || p.kind === 'coloc') return { un: 'une chambre en colocation', le: 'la chambre en colocation' };
  if (/studio/.test(n)) return { un: 'un studio', le: 'le studio' };
  if (/chambre/.test(n)) return { un: 'une chambre', le: 'la chambre' };
  return { un: 'un logement', le: 'le logement' };
}
function home(p) {
  if (p.adresse) return p.adresse;
  var d = p.dest; if (d) return d.label + ', France';
  return p.commune.replace('-Sud', '') + ', Nord, France';
}
function work() { return D.meta.workplace.address; }
/* Par défaut : du logement vers le stage. */
function mapsUrl(p, mode, back) {
  var a = home(p), b = work();
  return 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(back ? b : a) + '&destination=' + encodeURIComponent(back ? a : b) + '&travelmode=' + mode;
}
function placeUrl() { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(work()); }

/* ---------- utilitaires d'interface ---------- */
var tt;
function toast(t) { var e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(tt); tt = setTimeout(function () { e.classList.remove('on'); }, 2400); }
function copy(t, msg) {
  function fb() { var a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); toast(msg || 'Copié'); } catch (e) { toast('Sélectionnez le texte pour le copier'); } a.remove(); }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { toast(msg || 'Copié'); }, fb); else fb();
}
var IC = {
  today: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  pistes: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l4-8h5l3 8M10 9 8.5 6H6m9 3-1.5-3H16"/></svg>',
  mails: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="m4 8 8 6 8-6"/></svg>',
  dossier: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>',
  map: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z"/><path d="M9 4v14M15 6v14"/></svg>',
  bus: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3.5" width="14" height="14" rx="3"/><path d="M5 11h14M8 20.5v-3m8 3v-3"/></svg>',
  walk: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="13" cy="4.5" r="1.8"/><path d="m9 21 2.5-6.5L9 11l1-4 3 1 2 3h3M7 12l1-4M13.5 15l2.5 6"/></svg>',
  pen: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  ext: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  plus: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>'
};
var TABS = [['today', 'Accueil'], ['pistes', 'Pistes'], ['mails', 'Mails'], ['dossier', 'Dossier']];
function renderDock(cur) {
  var rel = all().filter(due).length, th = document.documentElement.getAttribute('data-theme');
  $('#dock').innerHTML = TABS.map(function (t) {
    return '<a href="#' + t[0] + '"' + (t[0] === cur ? ' aria-current="page"' : '') + '>' + IC[t[0]] + '<span>' + t[1] + '</span>' + (t[0] === 'pistes' && rel ? '<i class="count" aria-label="' + rel + ' relances à faire">' + rel + '</i>' : '') + '</a>';
  }).join('') + '<span class="sep"></span><button class="theme" id="theme" aria-label="Passer au thème ' + (th === 'dark' ? 'clair' : 'sombre') + '">' + (th === 'dark' ? IC.sun : IC.moon) + '</button>';
}

/* ---------- dessins ---------- */
function projector(pts, W, H, p) {
  var la0 = 1e9, la1 = -1e9, lo0 = 1e9, lo1 = -1e9;
  pts.forEach(function (q) { la0 = Math.min(la0, q[0]); la1 = Math.max(la1, q[0]); lo0 = Math.min(lo0, q[1]); lo1 = Math.max(lo1, q[1]); });
  var cos = Math.cos((la0 + la1) / 2 * Math.PI / 180), w = Math.max((lo1 - lo0) * cos, 1e-5), h = Math.max(la1 - la0, 1e-5);
  var s = Math.min((W - 2 * p) / w, (H - 2 * p) / h), ox = (W - w * s) / 2, oy = (H - h * s) / 2;
  return function (q) { return [ox + (q[1] - lo0) * cos * s, oy + (la1 - q[0]) * s]; };
}
function pathOf(shape, pr) { return 'M' + shape.map(function (q) { var a = pr(q); return a[0].toFixed(1) + ' ' + a[1].toFixed(1); }).join('L'); }
function communeCounts() { var c = {}; active().forEach(function (p) { if (p.route) c[p.route.key] = (c[p.route.key] || 0) + 1; }); return c; }

var drawn = false, lastTrace = '';
function constellation(big) {
  var W = big ? 720 : 820, H = big ? 620 : 640, cnt = communeCounts(), keys = Object.keys(D.routes), pts = [];
  keys.forEach(function (k) { pts = pts.concat(D.routes[k].shape); });
  var pr = projector(pts, W - (big ? 240 : 0), H, big ? 30 : 34), dx = big ? 120 : 0, wp = D.meta.workplace;
  function at(q) { var a = pr(q); return [a[0] + dx, a[1]]; }
  var hub = at([wp.lat, wp.lon]);
  var lines = keys.map(function (k, i) {
    var d = 'M' + D.routes[k].shape.map(function (q) { var a = at(q); return a[0].toFixed(1) + ' ' + a[1].toFixed(1); }).join('L');
    return '<path class="cl' + (cnt[k] ? ' on' : '') + '" pathLength="1" style="--d:' + i * 55 + 'ms" d="' + d + '"/>';
  }).join('');
  var items = keys.map(function (k) { var r = D.routes[k], a = at(r.shape[0]); return { k: k, x: a[0], y: a[1], ly: a[1] + 4, right: a[0] >= hub[0], n: cnt[k] || 0, r: r }; });
  var labels = '';
  if (big) {
    [true, false].forEach(function (side) {
      var arr = items.filter(function (p) { return p.right === side; }).sort(function (a, b) { return a.ly - b.ly; });
      for (var it = 0; it < 90; it++) for (var i = 1; i < arr.length; i++) { var g = arr[i].ly - arr[i - 1].ly; if (g < 17) { var s = (17 - g) / 2; arr[i - 1].ly -= s; arr[i].ly += s; } }
    });
    labels = items.map(function (p) {
      var lx = p.right ? W - 8 : 8, name = D.communes[p.k] ? p.k : byId(p.k).name.replace(/ \(.*/, '');
      return '<path class="leader" d="M' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + 'L' + (p.right ? lx - 92 : lx + 92) + ' ' + (p.ly - 4).toFixed(1) + '"/><text class="lbl' + (p.n ? '' : ' dim') + '" x="' + lx + '" y="' + p.ly.toFixed(1) + '" text-anchor="' + (p.right ? 'end' : 'start') + '">' + esc(name) + ' ' + p.r.min + ' min</text>';
    }).join('');
  }
  var nodes = items.map(function (p) { return '<circle class="node' + (p.n ? ' on' : '') + '" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (p.n ? 5 : 3.4) + '"/>'; }).join('');
  var hubm = '<circle class="ring" cx="' + hub[0].toFixed(1) + '" cy="' + hub[1].toFixed(1) + '" r="18"/><circle class="ring" cx="' + hub[0].toFixed(1) + '" cy="' + hub[1].toFixed(1) + '" r="34" stroke-dasharray="2 5"/><circle class="hub" cx="' + hub[0].toFixed(1) + '" cy="' + hub[1].toFixed(1) + '" r="7"/>' + (big ? '<text class="lbl" x="' + hub[0].toFixed(1) + '" y="' + (hub[1] + 56).toFixed(1) + '" text-anchor="middle">Stage</text>' : '');
  var cls = (big ? '' : 'sky') + (drawn ? '' : ' draw');
  return '<svg class="' + cls + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet"' + (big ? ' role="img" aria-label="Communes reliées au lieu de stage par leur itinéraire à vélo"' : ' aria-hidden="true"') + '>' + lines + labels + nodes + hubm + '</svg>';
}
function trace(r, back) {
  var W = 460, H = 230, pr = projector(r.shape, W, H, 34), a = pr(r.shape[0]), b = pr(r.shape[r.shape.length - 1]);
  var from = back ? b : a, to = back ? a : b, shape = back ? r.shape.slice().reverse() : r.shape;
  function lab(p, t) { var anchor = p[0] > W * .7 ? 'end' : p[0] < W * .3 ? 'start' : 'middle', y = p[1] < 44 ? p[1] + 26 : p[1] - 14; return '<text x="' + p[0].toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="' + anchor + '">' + t + '</text>'; }
  var key = r.km + '/' + r.shape.length + '/' + back, still = key === lastTrace; lastTrace = key;
  return '<svg class="trace' + (still ? ' still' : '') + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true"><path class="t" pathLength="1" d="' + pathOf(shape, pr) + '"/><circle cx="' + from[0].toFixed(1) + '" cy="' + from[1].toFixed(1) + '" r="6"/><circle class="end" cx="' + to[0].toFixed(1) + '" cy="' + to[1].toFixed(1) + '" r="6"/>' + lab(from, back ? 'Stage' : 'Logement') + lab(to, back ? 'Logement' : 'Stage') + '</svg>';
}
function thumb(r) {
  var pr = projector(r.shape, 60, 42, 5), b = pr(r.shape[r.shape.length - 1]);
  return '<svg class="thumb" viewBox="0 0 60 42" aria-hidden="true"><path d="' + pathOf(r.shape, pr) + '"/><circle cx="' + b[0].toFixed(1) + '" cy="' + b[1].toFixed(1) + '" r="2.6"/></svg>';
}

/* ---------- Accueil ---------- */
function nextAction() {
  var r = all().filter(due)[0];
  if (r) return { tag: 'Relance à envoyer', t: r.name, d: 'Sans réponse depuis ' + days(S.pistes[r.id].d, TODAY) + ' jours. Le brouillon de relance est prêt.', b: 'Préparer la relance', go: 'relance:' + r.id };
  var nA = D.plateformes.filter(function (p) { return S.alerts[p.id]; }).length;
  if (nA < 5) return { tag: 'À faire une seule fois', t: 'Créez vos alertes (' + nA + ' sur ' + D.plateformes.length + ')', d: 'Une alerte vous prévient dès qu\'une annonce arrive. Commencez par Leboncoin, PAP et Bien\'ici.', b: 'Ouvrir la liste', go: 'dossier:alertes' };
  var nx = sorted(active().filter(function (p) { return st(p) === 'À faire' && p.msg; }))[0];
  if (nx) return { tag: 'Piste la plus proche', t: nx.name, d: (nx.onsite ? 'Sur votre lieu de stage' : mins(nx) + ' min à vélo') + (nx.rent ? ', ' + nx.rent + ' €' : '') + '. Personne ne l\'a encore contactée.', b: 'Écrire le message', go: 'mail:' + nx.id };
  return { tag: 'Bravo', t: 'Toutes les pistes sont contactées', d: 'Parcourez les plateformes du jour pour en trouver de nouvelles.', b: 'Voir les pistes', go: 'hash:pistes' };
}
function viewToday() {
  var now = new Date(), rot = D.rotation[now.getDay()], tk = S.tasks[TODAY] || {}, done = 0, m = 0, tot = 0;
  D.tasks.forEach(function (t) { tot += t.min; if (tk[t.id]) { done++; m += t.min; } });
  var na = nextAction(), rel = all().filter(due), near = sorted(active().filter(function (p) { return !p.onsite && mins(p) <= 25; })).slice(0, 4);
  var h = '<section class="hero">' + constellation(false) + '<h1><span>Cap</span><em>Templemars</em></h1><p class="hero-line">Bonjour Habib. Il reste ' + left() + ' jours avant votre entrée du 24 décembre.</p><p class="hero-meta">' + JOURS[now.getDay()] + ' ' + now.getDate() + ' ' + MOIS[now.getMonth()] + ', pistes mises à jour le ' + fr(D.meta.updated) + '</p></section>';
  h += '<div class="home-grid"><div><div class="next"><span class="tag">' + esc(na.tag) + '</span><h2>' + esc(na.t) + '</h2><p>' + esc(na.d) + '</p><button class="btn" data-go="' + esc(na.go) + '">' + esc(na.b) + '</button></div>';
  if (rel.length > 1) h += '<h2 class="sec">À relancer<small>' + rel.length + ' pistes attendent une relance</small></h2><div class="list">' + rel.map(function (p) { return '<button class="item" data-go="relance:' + esc(p.id) + '"><span class="grow"><span class="t">' + esc(p.name) + '</span><span class="d">Contacté le ' + fr(S.pistes[p.id].d) + '</span></span></button>'; }).join('') + '</div>';
  if (near.length) h += '<h2 class="sec">Les plus proches du stage</h2><div class="rows">' + near.map(row).join('') + '</div>';
  h += '</div><aside><h2 class="sec">Séance de 2 heures<small>' + done + ' sur ' + D.tasks.length + ' terminées, ' + m + ' min sur ' + tot + '</small></h2><div class="bar" style="margin:0"><i style="width:' + Math.round(m / tot * 100) + '%"></i></div><div class="list" style="border-top:0">' + D.tasks.map(function (t) { return '<label class="item' + (tk[t.id] ? ' done' : '') + '"><input type="checkbox" data-task="' + t.id + '"' + (tk[t.id] ? ' checked' : '') + '><span class="grow"><span class="t">' + esc(t.t) + ', ' + t.min + ' min</span><span class="d">' + esc(t.d) + '</span></span></label>'; }).join('') + '</div>';
  h += '<h2 class="sec">À consulter ce ' + rot.n.toLowerCase() + '</h2><p style="font-weight:500">' + esc(rot.p) + '</p><p class="small" style="margin-top:4px">' + esc(rot.x) + '</p></aside></div>';
  return h;
}

/* ---------- Pistes ---------- */
var pf = 'all', dir = 'go';
function tags(p) {
  var s = st(p), sc = p.score === 'A?' ? 'A' : p.score, b = [];
  if (p.rent) b.push('<span class="tag-s num">' + p.rent + ' €</span>');
  b.push('<span class="tag-s ' + (s === 'Retenu' ? 'good' : s === 'Refusé' ? 'bad' : s === 'À faire' ? '' : 'warn') + '">' + esc(s) + '</span>');
  if (due(p)) b.push('<span class="tag-s bad">À relancer</span>');
  if (p.score === 'arnaque') b.push('<span class="tag-s bad">Arnaque possible</span>');
  else if (p.score === 'ecarte') b.push('<span class="tag-s warn">Écartée</span>');
  else if (sc) b.push('<span class="tag-s' + (sc === 'A' ? ' good' : '') + '">Score ' + esc(sc) + '</span>');
  return '<div class="tags">' + b.join('') + '</div>';
}
function row(p) {
  var m = mins(p), r = route(p), sel = desk.matches && S.sel === p.id;
  var time = p.onsite ? '<span class="time"><b style="font-size:24px;padding-top:6px">Sur place</b></span>' : '<span class="time"><b>' + m + '</b><span>min vélo</span></span>';
  return '<article class="row ' + zone(m) + (sel ? ' sel' : '') + '"><button class="row-main" data-piste="' + esc(p.id) + '"' + (sel ? ' aria-current="true"' : '') + '>' + time + '<span style="min-width:0;display:block"><h3>' + esc(p.name) + '</h3><span class="sub" style="display:block">' + esc(p.commune.replace('-Sud', '')) + (r ? ', ' + km(r.km) + ' km' : '') + '</span>' + (r ? '<span class="sub modes-line" style="display:block">À pied ' + dur(r.walk.min) + (r.transit.length ? ', transports ' + span(r.transit) : ', pas de liaison trouvée') + '</span>' : '') + tags(p) + '</span></button>' + (r ? thumb(r) : '') + '<a class="mini row-map" href="' + esc(p.onsite ? placeUrl() : mapsUrl(p, 'bicycling')) + '" target="_blank" rel="noopener" aria-label="Ouvrir le trajet de ' + esc(p.name) + ' dans Google Maps">' + IC.map + '<span>Maps</span></a></article>';
}
function viewPistes() {
  var base = sorted(active()), vis = base.filter(function (p) { return mins(p) <= S.maxMin; }), c = { todo: 0, cours: 0, rel: 0 };
  base.forEach(function (p) { var s = st(p); if (s === 'À faire') c.todo++; else if (['Contacté', 'Relancé', 'Réponse reçue', 'Visite prévue'].indexOf(s) >= 0) c.cours++; if (due(p)) c.rel++; });
  var list = vis.filter(function (p) { var s = st(p); if (pf === 'todo') return s === 'À faire'; if (pf === 'cours') return ['Contacté', 'Relancé', 'Réponse reçue', 'Visite prévue'].indexOf(s) >= 0; if (pf === 'rel') return due(p); return true; });
  var h = '<header class="page-head"><h1>Pistes</h1><p>Classées par temps à vélo jusqu\'au Casier Français. Chaque piste donne la distance, le trajet écrit et le lien Google Maps.</p></header>';
  h += '<div class="tools"><div class="seg" role="group" aria-label="Affichage"><button data-pv="list" aria-pressed="' + (S.pView === 'list') + '">Liste</button><button data-pv="map" aria-pressed="' + (S.pView === 'map') + '">Carte</button></div><div class="range"><input type="range" id="maxmin" min="10" max="45" step="5" value="' + S.maxMin + '" aria-label="Temps de trajet maximum à vélo"><output id="mmv">Jusqu\'à <b>' + S.maxMin + ' min</b></output></div><button class="mini" id="add">' + IC.plus + 'Ajouter une piste</button></div>';
  if (S.pView === 'map') return h + viewMap();
  h += '<div class="chips" role="group" aria-label="Filtrer" style="margin-top:14px">' + [['all', 'Toutes', vis.length], ['todo', 'À contacter', c.todo], ['cours', 'En cours', c.cours], ['rel', 'À relancer', c.rel]].map(function (f) { return '<button class="chip" data-pf="' + f[0] + '" aria-pressed="' + (pf === f[0]) + '">' + f[1] + '<span class="n">' + f[2] + '</span></button>'; }).join('') + '</div>';
  if (desk.matches && !list.some(function (p) { return p.id === S.sel; })) S.sel = list[0] ? list[0].id : '';
  h += '<div class="pistes"><div><div class="rows">' + (list.length ? list.map(row).join('') : '<p class="muted" style="padding:20px 0">Aucune piste ici. Élargissez le temps de trajet ou changez de filtre.</p>') + '</div>';
  if (base.length > vis.length) h += '<p class="small" style="margin-top:10px">' + (base.length - vis.length) + ' piste(s) masquée(s) au-delà de ' + S.maxMin + ' min.</p>';
  h += '<h2 class="sec">Où chercher ensuite</h2><div class="list">' + D.chercher.map(function (x) { var t = x.commune.split(', ').map(function (n) { return D.communes[n] ? D.communes[n].min : null; }).filter(function (v) { return v != null; }); return '<div class="item"><span class="grow"><span class="t">' + esc(x.commune) + '</span><span class="d">' + Math.min.apply(null, t) + ' à ' + Math.max.apply(null, t) + ' min à vélo. ' + esc(x.ou) + '</span></span></div>'; }).join('') + '</div>';
  var rej = sorted(all().filter(function (p) { return ORDER[p.score] >= 8; }));
  if (rej.length) h += '<h2 class="sec">Écartées</h2><div class="rows">' + rej.map(row).join('') + '</div>';
  h += '</div><aside class="pane" aria-label="Détail de la piste">' + (S.sel && byId(S.sel) ? detail(byId(S.sel)) : '<p class="muted">Choisissez une piste pour voir son trajet.</p>') + '</aside></div>';
  return h;
}
function viewMap() {
  var h = '<div class="two"><div class="map-wrap">' + constellation(true) + '</div><div><h2 class="sec" style="margin-top:20px">Temps par commune</h2><div class="list">' + Object.keys(D.communes).sort(function (a, b) { return D.communes[a].min - D.communes[b].min; }).map(function (n) { var c = D.communes[n], p = { commune: n }; return '<a class="item ' + zone(c.min) + '" style="text-decoration:none;align-items:center" href="' + esc(mapsUrl(p, 'bicycling')) + '" target="_blank" rel="noopener"><span class="time" style="width:54px"><b style="font-size:28px">' + c.min + '</b></span><span class="grow"><span class="t">' + esc(n) + '</span><span class="d">' + km(c.km) + ' km à vélo, à pied ' + dur(D.routes[n].walk.min) + (D.routes[n].transit.length ? ', transports ' + span(D.routes[n].transit) : ', pas de liaison trouvée') + '</span></span>' + IC.map + '</a>'; }).join('') + '</div></div></div>';
  return h + '<p class="small" style="margin-top:14px;max-width:70ch">' + esc(D.meta.routing) + '</p>';
}

/* ---------- fiche d'une piste ---------- */
function detail(p) {
  var x = S.pistes[p.id] || {}, m = mins(p), s = st(p), r = route(p), back = dir === 'back', wp = D.meta.workplace;
  var h = '<div class="d-head ' + zone(m) + '"><p class="small">' + esc(p.commune.replace('-Sud', '')) + (p.rent ? ', ' + p.rent + ' €' : '') + '</p><h2>' + esc(p.name) + '</h2>';
  if (p.onsite) {
    h += '<p class="note good" style="margin-top:16px">C\'est votre lieu de stage : aucun trajet à prévoir.</p><div class="btns" style="margin-top:14px"><a class="btn ghost" href="' + esc(placeUrl()) + '" target="_blank" rel="noopener">' + IC.map + 'Voir le lieu dans Google Maps</a></div></div>';
  } else if (r) {
    var sm = back ? r.backMin : r.min, sk = back ? r.backKm : r.km, label = esc(p.route.label);
    h += '<div class="big"><b>' + sm + '</b><span>min à vélo, <strong>' + km(sk) + ' km</strong><br>' + (back ? 'du stage à ' + label : 'de ' + label + ' au stage') + '</span></div>' + trace(r, back);
    h += '<div class="dir-row"><span class="small">Arrivée : ' + esc(wp.name) + ', ' + esc(wp.label) + '</span><div class="seg" role="group" aria-label="Sens du trajet"><button data-dir="go" aria-pressed="' + !back + '">Aller</button><button data-dir="back" aria-pressed="' + back + '">Retour</button></div></div>';
    h += '<div class="btns fill way-btns"><a class="btn" href="' + esc(mapsUrl(p, 'bicycling', back)) + '" target="_blank" rel="noopener">' + IC.map + 'Google Maps</a><a class="btn ghost" href="' + esc(mapsUrl(p, 'transit', back)) + '" target="_blank" rel="noopener">' + IC.bus + 'En bus</a><a class="btn ghost" href="' + esc(mapsUrl(p, 'walking', back)) + '" target="_blank" rel="noopener">' + IC.walk + 'À pied</a></div>';
    if (p.routeNote || !p.route.precise) h += '<p class="small" style="margin-top:12px">' + esc(p.routeNote || 'L\'annonce ne donne pas d\'adresse exacte : le trajet part du centre de la commune.') + '</p>';
    if (m > 30) h += '<p class="note" style="margin-top:12px">Plus de 30 min à vélo : vérifiez aussi le trajet en bus.</p>';
    var wk = back ? r.backWalk : r.walk, tr = back ? r.backTransit : r.transit;
    h += '<div class="modes"><div><span>À pied</span><b>' + dur(wk.min) + '</b><small>' + km(wk.km) + ' km</small></div><div><span>En transports</span>' + (tr.length ? '<b>' + span(tr) + '</b><small>' + (Math.min.apply(null, tr.map(function (o) { return o.ch; })) ? 'Avec correspondance' : 'Liaison directe possible') + '</small>' : '<b class="none">Aucune liaison trouvée</b><small>À vérifier sur ilevia.fr</small>') + '</div></div>';
    h += '</div>';
  } else h += '</div>';
  h += '<h3 class="d-sec">Où en êtes-vous ?</h3><div class="chips" role="group" aria-label="Statut">' + STATUS.map(function (o) { return '<button class="chip" data-st="' + esc(o) + '" data-sid="' + esc(p.id) + '" aria-pressed="' + (o === s) + '">' + o + '</button>'; }).join('') + '</div>';
  if (x.d) h += '<p class="small" style="margin-top:8px">Dernier contact le ' + fr(x.d) + (due(p) ? ', relance à envoyer' : '') + '.</p>';
  h += '<div class="btns fill" style="margin-top:16px">' + (p.msg ? '<button class="btn" data-go="' + (due(p) ? 'relance:' : 'mail:') + esc(p.id) + '">' + IC.pen + (due(p) ? 'Préparer la relance' : 'Écrire le message') + '</button>' : '') + (p.url ? '<a class="btn ghost" href="' + esc(p.url) + '" target="_blank" rel="noopener">' + IC.ext + 'Voir l\'annonce</a>' : '') + '</div>';
  if (r) {
    var steps = back ? r.backSteps : r.steps;
    h += '<details class="way" open><summary><h3 class="d-sec">Trajet écrit, ' + steps.length + ' étapes</h3></summary><ol class="turns">' + steps.map(function (t) { return '<li><span>' + esc(t.i) + '</span><span class="k">' + (t.km ? (t.km < 1 ? Math.round(t.km * 1000) + ' m' : km(t.km.toFixed(1)) + ' km') : '') + '</span></li>'; }).join('') + '</ol></details>';
    h += transitBlock(back ? r.backTransit : r.transit, back);
  }
  h += '<h3 class="d-sec">À savoir</h3><p>' + esc(p.note || 'Aucune information complémentaire.') + '</p>';
  var kv = [['Contact', p.contact], ['Téléphone', p.phone], ['E-mail', p.email]].filter(function (a) { return a[1]; });
  if (kv.length) h += '<dl class="kv">' + kv.map(function (a) { return '<dt>' + a[0] + '</dt><dd>' + esc(a[1]) + '</dd>' + (a[0] === 'Contact' ? '<span></span>' : '<button class="mini" data-copy="' + esc(a[1]) + '" aria-label="Copier : ' + a[0] + '">Copier</button>'); }).join('') + '</dl>';
  h += '<label class="field" style="margin-top:20px"><span>Mes notes</span><input type="text" id="snote" data-sid="' + esc(p.id) + '" value="' + esc(x.n || '') + '" placeholder="Interlocuteur, réponse, date limite"></label>';
  if (/^c\d/.test(p.id)) h += '<div style="margin-top:16px"><button class="mini" data-del="' + esc(p.id) + '">Retirer cette piste</button></div>';
  return h;
}
function legText(l, i, n, back) {
  if (l.m === 'WALK') {
    var dest = l.t ? 'à ' + esc(l.t) : (back ? 'au logement' : 'au stage');
    return (i > 0 && i < n - 1 ? 'Correspondance : marchez ' : 'Marchez ') + l.min + ' min jusqu\'' + dest + '.';
  }
  return '<strong>' + (MODE[l.m] || 'Transport') + (l.l ? ' ' + esc(l.l) : '') + '</strong>' + (l.h ? ', direction ' + esc(l.h) : '') + ' : de ' + esc(l.f) + ' à ' + esc(l.t) + ', ' + l.min + ' min.';
}
function transitBlock(list, back) {
  var d = D.meta.transitDate ? fr(D.meta.transitDate) : '';
  if (!list.length) return '<h3 class="d-sec">En transports</h3><p class="small">Aucune liaison trouvée pour ce trajet. Vérifiez sur <a href="https://www.ilevia.fr/" target="_blank" rel="noopener">ilevia.fr</a> ou avec le bouton « En bus ».</p>';
  return '<details class="way" open><summary><h3 class="d-sec">En transports, ' + list.length + ' option' + (list.length > 1 ? 's' : '') + '</h3></summary>' + list.map(function (o) {
    return '<div class="opt"><p><strong>' + dur(o.min) + '</strong>, ' + (o.ch ? o.ch + ' correspondance' + (o.ch > 1 ? 's' : '') : 'direct') + '<span class="small">Départ ' + clock(o.dep) + ', arrivée ' + clock(o.arr) + '</span></p><ol class="legs">' + o.legs.map(function (l, i) { return '<li>' + legText(l, i, o.legs.length, back) + '</li>'; }).join('') + '</ol></div>';
  }).join('') + '<p class="small" style="margin-top:12px">Exemples calculés pour le lundi ' + d + (back ? ', départ vers 17 h 30' : ', arrivée avant 9 h') + '. Confirmez les horaires sur <a href="https://www.ilevia.fr/" target="_blank" rel="noopener">ilevia.fr</a> et vérifiez que votre titre de transport est valable sur chaque ligne.</p></details>';
}
var lastFocus = null;
function fillSheet(html, label) {
  var sh = $('#sheet'); sh.innerHTML = '<div class="grab"></div><button class="close" data-close aria-label="Fermer">✕</button>' + html; sh.setAttribute('aria-label', label); sh.hidden = false; $('#backdrop').hidden = false; document.body.style.overflow = 'hidden'; $('#app').inert = true; $('#dock').inert = true;
}
function openSheet(id, keep) {
  var p = byId(id); if (!p) return;
  if (!keep) { lastFocus = document.activeElement; dir = 'go'; }
  var top = $('#sheet').scrollTop;
  fillSheet(detail(p), 'Détail de la piste');
  $('#sheet').setAttribute('data-id', id);
  if (keep) $('#sheet').scrollTop = top; else { $('#sheet').scrollTop = 0; setTimeout(function () { var c = $('#sheet .close'); if (c) c.focus({ preventScroll: true }); }, 60); }
}
function closeSheet(noRender) { var sh = $('#sheet'); sh.hidden = true; sh.removeAttribute('data-id'); $('#backdrop').hidden = true; document.body.style.overflow = ''; $('#app').inert = false; $('#dock').inert = false; if (!noRender) render(); if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true }); lastFocus = null; }
function show(id) {
  if (desk.matches) { S.sel = id; dir = 'go'; save(); if (route_() === 'pistes') { render(); var pn = $('.pane'); if (pn) pn.scrollTop = 0; } else location.hash = '#pistes'; }
  else openSheet(id);
}
function refreshDetail() { var id = $('#sheet').getAttribute('data-id'); if (id && !$('#sheet').hidden) openSheet(id, true); else render(); }
function openAdd() {
  lastFocus = document.activeElement;
  var cs = Object.keys(D.communes).sort(function (a, b) { return D.communes[a].min - D.communes[b].min; });
  fillSheet('<h2 style="font-size:32px;margin-bottom:6px">Ajouter une piste</h2><p class="small">La distance et le trajet écrit viennent de la commune. Google Maps utilisera l\'adresse si vous la renseignez.</p><form id="addf" class="stack" style="margin-top:18px"><label class="field"><span>Nom de la piste</span><input type="text" name="name" required placeholder="Chambre à Seclin, 12 m²"></label><label class="field"><span>Commune</span><select name="commune">' + cs.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select></label><label class="field"><span>Adresse (facultatif)</span><input type="text" name="adresse" placeholder="12 rue des Lilas, Seclin"></label><label class="field"><span>Loyer charges comprises, en euros (facultatif)</span><input type="number" name="rent" min="0" inputmode="numeric"></label><label class="field"><span>Lien de l\'annonce (facultatif)</span><input type="url" name="url" inputmode="url" placeholder="https://"></label><label class="field"><span>E-mail du contact (facultatif)</span><input type="email" name="email" inputmode="email"></label><label class="field"><span>Téléphone du contact (facultatif)</span><input type="tel" name="phone"></label><label class="field"><span>Type de contact</span><select name="msg">' + ['particulier', 'coloc', 'agence', 'residence', 'structure'].map(function (k) { return '<option value="' + k + '">' + esc(D.messages[k].t) + '</option>'; }).join('') + '</select></label><button class="btn" type="submit">Ajouter la piste</button></form>', 'Ajouter une piste');
  $('#sheet').scrollTop = 0;
  setTimeout(function () { var n = $('#addf input[name=name]'); if (n) n.focus(); }, 60);
}

/* ---------- Mails ---------- */
function fill(p, key) {
  var t = D.messages[key], sj = t.subject, b = t.body, x = p ? (S.pistes[p.id] || {}) : {};
  var map = {}; if (p) { var kd = kind(p); map = { '[commune]': p.commune.replace('-Sud', ''), '[un logement]': kd.un, '[le logement]': kd.le }; if (x.d) map["[date d'envoi]"] = fr(x.d); }
  Object.keys(map).forEach(function (a) { sj = sj.split(a).join(map[a]); b = b.split(a).join(map[a]); });
  b = (p && p.ask) ? b.split('[précisions]').join(p.ask) : b.replace('[précisions]\n\n', '');
  if (S.profile.tel && b.indexOf(S.profile.tel) < 0) b += '\n' + S.profile.tel;
  return { subject: sj, body: b };
}
function setMail(id, tpl) { var p = byId(id); if (!tpl) tpl = p && p.msg ? p.msg : 'particulier'; var f = fill(p, tpl); S.mail = { id: id || '', tpl: tpl, subject: f.subject, body: f.body, ok: false }; save(); }
function viewMails() {
  var m = S.mail, p = byId(m.id), tpl = D.messages[m.tpl];
  var lft = m.tpl ? ((m.subject + m.body).match(/\[[^\]]+\]/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }) : [];
  var step = !m.tpl ? 1 : (!m.ok || lft.length ? 2 : 3);
  var h = '<header class="page-head"><h1>Mails</h1><p>Un brouillon poli, au ton adapté à chaque contact. Vous le relisez, puis vous l\'envoyez vous-même depuis Gmail.</p></header><div class="mail"><div>';
  h += '<ol class="steps"><li class="on">Choisir</li><li class="' + (step >= 2 ? 'on' : '') + '">Relire</li><li class="' + (step >= 3 ? 'on' : '') + '">Envoyer</li></ol>';
  h += '<div class="stack"><label class="field"><span>À qui écrivez-vous ?</span><select id="mp"><option value="">Choisir une piste</option>' + sorted(active()).map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === m.id ? ' selected' : '') + '>' + esc(x.name) + (x.onsite ? '' : ', ' + mins(x) + ' min') + '</option>'; }).join('') + '</select></label><label class="field"><span>Modèle et ton</span><select id="mt">' + Object.keys(D.messages).map(function (a) { return '<option value="' + a + '"' + (a === m.tpl ? ' selected' : '') + '>' + esc(D.messages[a].t) + ', ' + esc(D.messages[a].ton.toLowerCase()) + '</option>'; }).join('') + '</select></label></div>';
  if (!m.tpl) return h + '</div><div class="letter"><p class="muted">Choisissez une piste : le ton et les questions s\'adaptent tout seuls, formels pour une agence, chaleureux pour un particulier, amicaux pour une colocation.</p></div></div>';
  if (p && !p.onsite) { var r = route(p); h += '<div class="item ' + zone(mins(p)) + '" style="margin-top:18px;align-items:center;border-top:1px solid var(--hair-2)"><span class="time" style="width:58px"><b>' + mins(p) + '</b><span>min vélo</span></span><span class="grow"><span class="t">' + (r ? km(r.km) + ' km jusqu\'au stage' : '') + '</span><a class="small" href="' + esc(mapsUrl(p, 'bicycling')) + '" target="_blank" rel="noopener">Ouvrir le trajet dans Google Maps</a></span></div>'; }
  var notes = [];
  if (lft.length) notes.push('<div class="note bad"><b>À remplacer avant l\'envoi :</b> ' + esc(lft.join(' ')) + '</div>');
  if (p && !p.email) notes.push('<div class="note">Pas d\'adresse e-mail pour cette piste. Contact : ' + esc(p.contact || 'le site de l\'annonce') + '. Copiez le message et collez-le là-bas.</div>');
  if (!S.profile.tel) notes.push('<div class="note">Ajoutez votre numéro dans Dossier, Profil : il sera placé sous votre signature.</div>');
  if (notes.length) h += '<div class="stack" style="margin-top:18px">' + notes.join('') + '</div>';
  h += '</div><div><div class="letter stack"><span class="ton">Ton ' + esc(tpl.ton.toLowerCase()) + '</span><label class="field"><span>Objet</span><input type="text" id="ms" value="' + esc(m.subject) + '"></label><label class="field"><span>Message</span><textarea id="mb">' + esc(m.body) + '</textarea></label></div>';
  h += '<label class="check" style="margin-top:18px"><input type="checkbox" id="mok"' + (m.ok ? ' checked' : '') + '><span><span style="font-weight:500;display:block">J\'ai relu, tout est exact</span><span class="small">Dates, commune, prix et ma situation.</span></span></label>';
  var can = m.ok && !lft.length && p && p.email;
  var gm = can ? 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(p.email) + '&su=' + encodeURIComponent(m.subject) + '&body=' + encodeURIComponent(m.body) : '#';
  h += '<div class="btns fill" style="margin-top:16px"><a class="btn" id="gm" href="' + esc(gm) + '"' + (can ? ' target="_blank" rel="noopener"' : ' aria-disabled="true" tabindex="-1"') + '>' + IC.mails.replace('<svg', '<svg class="ico"') + 'Ouvrir dans Gmail</a><button class="btn ghost" id="mc"' + (lft.length || !m.ok ? ' disabled' : '') + '>Copier le message</button>' + (p && p.url && !p.email ? '<a class="btn ghost" href="' + esc(p.url) + '" target="_blank" rel="noopener">' + IC.ext + 'Voir l\'annonce</a>' : '') + '</div>';
  if (p) h += '<div class="btns fill" style="margin-top:10px"><button class="btn ghost" id="msent">J\'ai envoyé ce message</button></div>';
  h += '<p class="small" style="margin-top:12px">Rien ne part sans votre clic dans Gmail. « J\'ai envoyé » enregistre le contact et programme une relance dans 3 jours.</p></div></div>';
  return h;
}

/* ---------- Dossier ---------- */
function hasDoc(d) { return S.docs[d.id] !== undefined ? S.docs[d.id] : d.st === 'ready'; }
function viewDossier() {
  var t = S.dTab;
  var h = '<header class="page-head"><h1>Dossier</h1><p>Vos pièces, vos alertes, les aides et vos réglages.</p></header><div class="btns" style="margin-bottom:18px"><a class="btn" href="' + esc(D.meta.driveUrl) + '" target="_blank" rel="noopener">' + IC.dossier.replace('<svg', '<svg class="ico"') + 'Ouvrir mon Drive</a><a class="btn ghost" href="' + esc(D.meta.sheetUrl) + '" target="_blank" rel="noopener">' + IC.ext + 'Suivi des annonces</a></div>';
  h += '<div class="chips" role="group" aria-label="Rubrique">' + [['docs', 'Documents'], ['alertes', 'Alertes'], ['aides', 'Aides'], ['memo', 'Pense-bête'], ['profil', 'Profil']].map(function (x) { return '<button class="chip" data-dtab="' + x[0] + '" aria-pressed="' + (t === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div><div style="max-width:880px">';
  if (t === 'docs') {
    var list = D.docs.filter(function (d) { return d.types.indexOf(S.docType) >= 0; }), done = list.filter(hasDoc).length, g = {};
    list.forEach(function (d) { (g[d.g] = g[d.g] || []).push(d); });
    h += '<label class="field" style="margin-top:22px"><span>Type de logement visé</span><select id="dtype">' + D.typesDoc.map(function (x) { return '<option value="' + x.k + '"' + (x.k === S.docType ? ' selected' : '') + '>' + esc(x.l) + '</option>'; }).join('') + '</select></label>';
    h += '<div style="margin-top:22px"><h2 style="font-size:30px">' + done + ' pièces prêtes sur ' + list.length + '</h2><div class="bar"><i style="width:' + (done / list.length * 100) + '%"></i></div><p class="small" style="margin-top:12px">N\'envoyez jamais une pièce d\'identité avant d\'avoir visité le logement ou vérifié l\'annonce.</p></div>';
    Object.keys(g).forEach(function (k) {
      h += '<h2 class="sec" style="display:flex;justify-content:space-between;align-items:center;gap:12px">' + esc(k) + (D.driveFolders[k] ? '<a class="mini" style="font-family:var(--body)" href="' + esc(D.driveFolders[k]) + '" target="_blank" rel="noopener" aria-label="Déposer dans le dossier Drive ' + esc(k) + '">Déposer</a>' : '') + '</h2><div class="list">' + g[k].map(function (d) { var on = hasDoc(d); return '<label class="item' + (on ? ' done' : '') + '"><input type="checkbox" data-doc="' + d.id + '"' + (on ? ' checked' : '') + '><span class="grow"><span class="t">' + esc(d.t) + '</span><span class="d">' + esc(d.h) + '</span>' + (d.st === 'update' ? '<span class="tags"><span class="tag-s warn">À mettre à jour sur le Drive</span></span>' : '') + '</span></label>'; }).join('') + '</div>';
    });
  }
  if (t === 'alertes') {
    var n = D.plateformes.filter(function (p) { return S.alerts[p.id]; }).length;
    h += '<div class="note good" style="margin-top:22px"><b>Réglage commun :</b> communes à moins de 30 min à vélo, meublé, 450 € maximum, alerte immédiate par e-mail. ' + n + ' alertes créées sur ' + D.plateformes.length + '.</div><div class="list" style="margin-top:16px">' + D.plateformes.map(function (p) { return '<div class="item' + (S.alerts[p.id] ? ' done' : '') + '"><input type="checkbox" aria-label="Alerte créée sur ' + esc(p.n) + '" data-alert="' + p.id + '"' + (S.alerts[p.id] ? ' checked' : '') + '><span class="grow"><span class="t">' + esc(p.n) + '</span><span class="d">' + esc(p.h) + '</span></span><a class="mini" href="' + esc(p.u) + '" target="_blank" rel="noopener" aria-label="Ouvrir ' + esc(p.n) + '">Ouvrir</a></div>'; }).join('') + '</div>';
  }
  if (t === 'aides') {
    h += '<div class="list" style="margin-top:22px">' + D.aides.map(function (a) { return '<div class="item" style="display:block"><h3 style="font-size:22px">' + esc(a.t) + '</h3><ul style="margin:8px 0 0;padding-left:1.1em;color:var(--ink-muted)">' + a.s.map(function (s) { return '<li style="margin:3px 0">' + esc(s) + '</li>'; }).join('') + '</ul>' + (a.u ? '<p style="margin-top:12px"><a class="mini" href="' + esc(a.u) + '" target="_blank" rel="noopener">Site officiel</a></p>' : '') + '</div>'; }).join('') + '</div><div class="note bad" style="margin-top:18px"><b>Signaux d\'arnaque.</b> Ne payez rien et n\'envoyez aucun document en cas de paiement avant la visite, mandat cash, carte cadeau, PCS ou Transcash, propriétaire « à l\'étranger », prix très bas, refus de visite, ou site qui fait payer pour « diffuser votre candidature ».</div>';
  }
  if (t === 'memo') h += '<div class="list" style="margin-top:22px">' + D.pensebete.map(function (a) { return '<div class="item"><span class="grow"><span class="t">' + esc(a.t) + '</span><span class="d">' + esc(a.d) + '</span></span></div>'; }).join('') + '</div>';
  if (t === 'profil') {
    var perm = ('Notification' in window) ? Notification.permission : 'na';
    h += '<div class="stack" style="margin-top:22px"><label class="field"><span>Votre téléphone, ajouté sous votre signature et gardé sur cet appareil</span><input type="tel" id="ptel" value="' + esc(S.profile.tel) + '" placeholder="06 12 34 56 78" autocomplete="tel"></label>';
    h += '<h2 class="sec" style="margin-top:20px">Rappel du jour<small>' + (perm === 'granted' ? 'Activé : un rappel s\'affiche à l\'ouverture après 7 h.' : perm === 'denied' ? 'Bloqué dans les réglages du navigateur.' : perm === 'default' ? 'Recevez le point du jour à l\'ouverture de l\'application.' : 'Non pris en charge ici.') + '</small></h2>' + (perm === 'default' ? '<div><button class="btn" id="notif">Activer le rappel</button></div>' : '');
    h += '<h2 class="sec" style="margin-top:20px">Sauvegarde<small>Votre suivi reste sur cet appareil. Copiez-le pour le transférer vers un autre.</small></h2><div class="btns"><button class="btn ghost" id="exp">Copier mon suivi</button><button class="btn ghost" id="imp">Coller un suivi</button></div></div>';
  }
  return h + '</div>';
}

/* ---------- rendu ---------- */
var VIEWS = { today: viewToday, pistes: viewPistes, mails: viewMails, dossier: viewDossier };
function route_() { var h = (location.hash || '#today').slice(1); return VIEWS[h] ? h : 'today'; }
var lastView = '', FOCUS = ['data-task', 'data-doc', 'data-alert', 'data-pf', 'data-dtab', 'data-pv', 'data-piste', 'data-dir'];
function render() {
  var r = route_(), ae = document.activeElement, sel = null, app = $('#app');
  if (ae && ae !== document.body) { if (ae.id) sel = '#' + ae.id; else FOCUS.forEach(function (a) { if (ae.hasAttribute(a)) sel = '[' + a + '="' + ae.getAttribute(a) + '"]'; }); }
  var pane = $('.pane'), ptop = pane ? pane.scrollTop : 0;
  app.innerHTML = VIEWS[r]();
  if (r !== lastView) { app.classList.remove('enter'); void app.offsetWidth; app.classList.add('enter'); lastView = r; }
  renderDock(r); drawn = true;
  var np = $('.pane'); if (np) np.scrollTop = ptop;
  if (sel) { try { var el = $(sel); if (el) el.focus({ preventScroll: true }); } catch (e) {} }
}
function go(spec) {
  var g = spec.split(':');
  if (!$('#sheet').hidden) closeSheet(true);
  if (g[0] === 'hash') { location.hash = '#' + g[1]; return; }
  if (g[0] === 'dossier') { S.dTab = g[1]; save(); if (route_() === 'dossier') render(); else location.hash = '#dossier'; return; }
  if (g[0] === 'mail' || g[0] === 'relance') { setMail(g[1], g[0] === 'relance' ? 'relance' : ''); if (route_() === 'mails') render(); else location.hash = '#mails'; }
}

/* ---------- événements ---------- */
document.addEventListener('click', function (e) {
  var t = e.target, b;
  if ((b = t.closest('[data-go]'))) { go(b.getAttribute('data-go')); return; }
  if ((b = t.closest('[data-piste]'))) { show(b.getAttribute('data-piste')); return; }
  if ((b = t.closest('[data-close]')) || t.id === 'backdrop') { closeSheet(); return; }
  if ((b = t.closest('[data-copy]'))) { copy(b.getAttribute('data-copy'), 'Copié'); return; }
  if ((b = t.closest('[data-dir]'))) { dir = b.getAttribute('data-dir'); refreshDetail(); return; }
  if ((b = t.closest('[data-del]'))) { var did = b.getAttribute('data-del'); S.custom = S.custom.filter(function (p) { return p.id !== did; }); delete S.pistes[did]; S.sel = ''; save(); if (!$('#sheet').hidden) closeSheet(true); render(); toast('Piste retirée'); return; }
  if ((b = t.closest('[data-st]'))) { var x = ps(b.getAttribute('data-sid')), v = b.getAttribute('data-st'); x.s = v; if (v === 'Contacté' || v === 'Relancé') x.d = TODAY; save(); refreshDetail(); toast('Statut enregistré : ' + v); return; }
  if ((b = t.closest('[data-pf]'))) { pf = b.getAttribute('data-pf'); render(); return; }
  if ((b = t.closest('[data-pv]'))) { S.pView = b.getAttribute('data-pv'); save(); render(); return; }
  if ((b = t.closest('[data-dtab]'))) { S.dTab = b.getAttribute('data-dtab'); save(); render(); return; }
  if (t.closest('#theme')) { var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', cur); try { localStorage.setItem(THEME, cur); } catch (er) {} $('meta[name=theme-color]').content = cur === 'dark' ? '#0d0e10' : '#e8dcc8'; renderDock(route_()); $('#theme').focus(); return; }
  if (t.closest('#add')) { openAdd(); return; }
  if (t.closest('#mc')) { copy(S.mail.subject + '\n\n' + S.mail.body, 'Message copié'); return; }
  if (t.closest('#msent')) { var y = ps(S.mail.id); y.s = (y.s === 'Contacté' || y.s === 'Relancé') ? 'Relancé' : 'Contacté'; y.d = TODAY; save(); toast('Enregistré. Relance prévue dans 3 jours.'); render(); return; }
  if (t.closest('#notif')) { Notification.requestPermission().then(function () { render(); daily(); }); return; }
  if (t.closest('#exp')) { copy(JSON.stringify(S), 'Suivi copié'); return; }
  if (t.closest('#imp')) { var v2 = window.prompt('Collez ici votre suivi copié'); if (v2) { try { var o2 = JSON.parse(v2); for (var k2 in o2) S[k2] = o2[k2]; save(); render(); toast('Suivi importé'); } catch (er) { toast('Ce texte n\'est pas un suivi valide'); } } return; }
});
document.addEventListener('submit', function (e) {
  if (e.target.id !== 'addf') return;
  e.preventDefault();
  var f = new FormData(e.target), c = f.get('commune'), id = 'c' + Date.now(), adr = String(f.get('adresse') || '').trim();
  S.custom.push({ id: id, name: String(f.get('name')).trim(), kind: f.get('msg') === 'coloc' ? 'coloc' : f.get('msg') === 'structure' ? 'structure' : 'particulier', commune: c, score: 'B', rent: f.get('rent') ? +f.get('rent') : null, contact: '', email: String(f.get('email') || '').trim(), phone: String(f.get('phone') || '').trim(), url: String(f.get('url') || '').trim(), msg: f.get('msg'), note: '', adresse: adr, route: { key: c, label: c + ' (centre)', precise: false } });
  S.sel = id; save(); closeSheet(true); if (route_() === 'pistes') render(); else location.hash = '#pistes'; toast('Piste ajoutée');
});
document.addEventListener('change', function (e) {
  var t = e.target, v;
  if ((v = t.getAttribute('data-task'))) { (S.tasks[TODAY] = S.tasks[TODAY] || {})[v] = t.checked; save(); render(); if (t.checked) toast('Bravo, une étape de moins'); return; }
  if ((v = t.getAttribute('data-doc'))) { S.docs[v] = t.checked; save(); render(); return; }
  if ((v = t.getAttribute('data-alert'))) { S.alerts[v] = t.checked; save(); render(); return; }
  if (t.id === 'snote') { ps(t.getAttribute('data-sid')).n = t.value; save(); toast('Note enregistrée'); return; }
  if (t.id === 'mp') { setMail(t.value, ''); render(); return; }
  if (t.id === 'mt') { setMail(S.mail.id, t.value); render(); return; }
  if (t.id === 'mok') { S.mail.ok = t.checked; save(); render(); return; }
  if (t.id === 'ms' || t.id === 'mb' || t.id === 'maxmin') { render(); return; }
  if (t.id === 'dtype') { S.docType = t.value; save(); render(); return; }
  if (t.id === 'ptel') { S.profile.tel = t.value.trim(); save(); toast('Téléphone enregistré'); return; }
});
document.addEventListener('input', function (e) {
  var t = e.target;
  if (t.id === 'maxmin') { S.maxMin = +t.value; $('#mmv').innerHTML = 'Jusqu\'à <b>' + S.maxMin + ' min</b>'; save(); return; }
  if (t.id === 'ms') { S.mail.subject = t.value; S.mail.ok = false; save(); return; }
  if (t.id === 'mb') { S.mail.body = t.value; S.mail.ok = false; save(); return; }
});
window.addEventListener('hashchange', function () { if (!$('#sheet').hidden) closeSheet(true); render(); window.scrollTo(0, 0); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
if (desk.addEventListener) desk.addEventListener('change', function () { if (!D) return; if (!$('#sheet').hidden) closeSheet(true); render(); });

/* ---------- rappel quotidien ---------- */
function daily() {
  if (!('Notification' in window) || Notification.permission !== 'granted' || S.notifDay === TODAY || new Date().getHours() < 7) return;
  var rel = all().filter(due).length;
  try { new Notification('Cap Templemars, J-' + left(), { body: (rel ? rel + ' relance(s) à envoyer. ' : '') + 'Aujourd\'hui : ' + D.rotation[new Date().getDay()].p + '.' }); S.notifDay = TODAY; save(); } catch (e) {}
}

/* ---------- démarrage ---------- */
if ('serviceWorker' in navigator && /^https:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(function () {});
fetch('data/data.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) {
  D = j; render(); daily();
  document.addEventListener('visibilitychange', function () { if (!document.hidden && $('#sheet').hidden) { TODAY = ymd(new Date()); render(); daily(); } });
}).catch(function () {
  $('#app').innerHTML = '<header class="page-head"><h1>Cap Templemars</h1><p>Les données n\'ont pas pu être chargées. Vérifiez votre connexion, puis rechargez la page.</p></header>';
});
})();
