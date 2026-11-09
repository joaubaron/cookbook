// Constantes Globais
const CATEGORIAS_PADRAO = Object.freeze([
'Café', 'Doces', 'Drinks', 'Especial', 'Jantar', 'Petiscos', 'Salgados', 'Saudável'
]);

window.addEventListener('unhandledrejection', function(event) {
if (event.reason &&
event.reason.message &&
(event.reason.message.includes('fail is not a function') ||
event.reason.message.includes('webintent'))) {
console.warn("WebIntent interceptado e silenciado");
event.preventDefault();
event.stopPropagation();
}
});

window.addEventListener('error', function(event) {
if (event.error &&
event.error.message &&
(event.error.message.includes('fail is not a function') ||
event.error.message.includes('webintent'))) {
console.warn("⚠️ Erro global síncrono do WebIntent interceptado");
event.preventDefault();
event.stopPropagation();
}
return false;
});

let receitas = [];
let categoriaAtual = '';
let termoBusca = '';
let modoBusca = false;
let cacheReceitasOrdenadas = null;
let ultimaCategoria = null;
let mapaIndicesReceitas = new Map();
let modoFavoritos = false;

function safeWebIntentCall(callback) {
try {
if (typeof callback !== 'function') return;
if (!window.plugins?.webintent) return;
callback();
} catch (error) {
// silenciado
}
}

document.addEventListener('deviceready', function() {
inicializar();
configurarWebIntent();
}, false);

document.addEventListener('DOMContentLoaded', function() {
if (!window.cordova) {
inicializar();
}
capturarCompartilhamentoPWA();
}, false);

function tentarCapturarCompartilhamento(tentativa = 1) {
if (!window.plugins?.webintent) return;
safeWebIntentCall(() => {
window.plugins.webintent.getExtra(window.plugins.webintent.EXTRA_TEXT, function(text) {
if (text) { processarCompartilhamento(text); return; }
safeWebIntentCall(() => {
window.plugins.webintent.getUri(function(uri) {
if (uri) { processarCompartilhamento(uri); return; }
safeWebIntentCall(() => {
window.plugins.webintent.getExtra(window.plugins.webintent.EXTRA_STREAM, function(stream) {
if (stream) { processarCompartilhamentoComImagem({ extras: { 'android.intent.extra.STREAM': stream } }); return; }
if (tentativa < 5) setTimeout(() => tentarCapturarCompartilhamento(tentativa + 1), 250);
});
});
});
});
});
});
}

function configurarWebIntent() {
if (!window.plugins || !window.plugins.webintent) return;
tentarCapturarCompartilhamento();
}

function processarCompartilhamento(intent) {
let textoCompartilhado = '';
if (typeof intent === 'string') {
textoCompartilhado = intent;
} else if (intent && intent.extras) {
if (intent.extras['android.intent.extra.STREAM']) {
processarCompartilhamentoComImagem(intent);
return;
}
textoCompartilhado = intent.extras['android.intent.extra.TEXT'] ||
intent.extras['android.intent.extra.SUBJECT'] ||
intent.extras.text || '';
}
if (textoCompartilhado) {
let nomeReceita = extrairNomeReceita(textoCompartilhado);
let linkReceita = extrairLink(textoCompartilhado);
const nomeInput = document.getElementById('nomeReceita');
if (nomeReceita) {
nomeInput.value = nomeReceita;
nomeInput.placeholder = "Edite o nome da receita se quiser...";
} else {
nomeInput.value = '';
nomeInput.placeholder = "Digite aqui o nome da receita...";
}
if (linkReceita) document.getElementById('linkReceita').value = linkReceita;
destacarCamposPreenchidos();
nomeInput.focus();
mostrarMensagem('Link pronto! Confira o nome e escolha a categoria.', 'sucesso');
}
}

const SITES_SEM_NOME = /(youtube\.com|youtu\.be|instagram\.com|facebook\.com|fb\.watch|tiktok\.com|pinterest\.)/i;

function nomeDoLink(url) {
  try {
    const u = new URL(url);
    if (SITES_SEM_NOME.test(u.hostname)) return '';
    for (const chave of ['nome', 'title', 'recipe']) {
      const v = u.searchParams.get(chave);
      if (v && v.trim().length >= 3) return capitalizarTitulo(v.replace(/[-_]+/g, ' ').trim());
    }
    let slug = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
    slug = slug.replace(/\.[a-z0-9]{2,5}$/i, '');
    const palavras = slug.split(/[-_\s]+/).filter(p => /[a-zà-ú]{2,}/i.test(p));
    if (palavras.length < 2) return '';
    return capitalizarTitulo(slug.replace(/[-_]+/g, ' ').trim());
  } catch (e) { return ''; }
}

function extrairNomeReceita(texto) {
  if (!texto || !String(texto).trim()) return '';
  let t = String(texto);
  try { t = t.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, ''); } catch (e) {}
  t = t.replace(/\s+/g, ' ').trim();
  const url = (t.match(/https?:\/\/[^\s]+/i) || [''])[0];
  let nome = t.replace(/https?:\/\/[^\s]+/gi, ' ').split('|')[0];
  nome = nome.replace(/[\s\-–—]*\b(YouTube|Instagram|Facebook|TikTok|Pinterest)\b[\s\-–—]*$/i, '');
  nome = nome.replace(/^\s*(receita d[eao]s?|como fazer|passo a passo|tutorial)\s+/i, '');
  ['o melhor', 'a melhor', 'melhor', 'fácil', 'facil', 'simples', 'rápido', 'rapido', 'perfeito', 'perfeita', 'completo', 'vídeo', 'video']
    .forEach(r => { nome = nome.replace(new RegExp(`\\b${r}\\b`, 'gi'), ''); });
  nome = nome.replace(/\b20\d\d\b/g, '').replace(/\s{2,}/g, ' ').replace(/^[\s\-–—,:;.]+|[\s\-–—,:;.]+$/g, '');
  if (nome.length >= 3) {
    if (nome.length > 70) nome = nome.slice(0, 70).replace(/\s+\S*$/, '');
    return capitalizarTitulo(nome);
  }
  return url ? nomeDoLink(url) : '';
}

function capitalizarTitulo(texto) {
if (!texto) return '';
const manterMinusculas = ["de", "da", "do", "das", "dos", "com", "sem", "para", "em", "e", "ou"];
return texto.toLowerCase().split(" ")
.map((palavra, index) => (index > 0 && manterMinusculas.includes(palavra)) ? palavra : palavra.charAt(0).toUpperCase() + palavra.slice(1))
.join(" ").trim();
}

function extrairLink(texto) {
let urlMatch = texto.match(/(https?:\/\/[^\s]+)/i);
if (urlMatch) return urlMatch[1];
urlMatch = texto.match(/(\b(www\.|[a-z0-9\-]+\.)[a-z]{2,}[^\s\.\?!]*)/i);
if (urlMatch && urlMatch[1]) return urlMatch[1];
return '';
}

function processarCompartilhamentoComImagem(intent) {
let textoCompartilhado = '';
let streamLink = '';
if (intent && intent.extras) {
textoCompartilhado = intent.extras['android.intent.extra.TEXT'] ||
intent.extras['android.intent.extra.SUBJECT'] ||
intent.extras.text || '';
streamLink = intent.extras['android.intent.extra.STREAM'] || '';
}
if (streamLink) {
const nomeBase = textoCompartilhado || "Receita com Imagem";
document.getElementById('nomeReceita').value = extrairNomeReceita(nomeBase);
document.getElementById('linkReceita').value = streamLink;
destacarCamposPreenchidos();
document.getElementById('categoriaReceita').focus();
mostrarMensagem('Imagem recebida! Confira o link e salve.', 'sucesso');
return;
}
if (textoCompartilhado) processarCompartilhamento(textoCompartilhado);
}

function inicializar() {
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().then(granted => {
      console.log(`Storage persistente: ${granted ? '✅ protegido' : '⚠️ pode ser limpo pelo sistema'}`);
    });
  }

  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.style.cssText = `
      position: fixed; top: 20px; right: 20px; z-index: 10000;
    `;
    document.body.appendChild(toastContainer);
  }

  carregarReceitas();
  criarAbasCategorias();

  setTimeout(() => {
    const container = document.querySelector('.container');
    if (container) container.focus();
  }, 50);
}

function normalizarLink(link) {
  link = String(link || '').trim();
  if (!/^(https?|content|file):\/\//i.test(link)) link = 'https://' + link;
  return link;
}

function normalizarLista(lista) {
  return lista
    .filter(r => r && typeof r.nome === 'string')
    .map(r => ({
      ...r,
      link: typeof r.link === 'string' ? r.link : '',
      categoria: CATEGORIAS_PADRAO.includes(r.categoria) ? r.categoria : 'Especial',
      favorito: r.favorito === true
    }));
}

function resetarBuscaVisual() {
  const campo = document.getElementById('campoBusca');
  const btn = document.getElementById('btnLimparBusca');
  if (campo) { campo.value = ''; campo.classList.remove('busca-ativa'); }
  if (btn) btn.style.display = 'none';
  termoBusca = '';
  modoBusca = false;
  document.body.classList.remove('modo-busca');
}

function persistirReceitas() {
  const json = JSON.stringify(receitas);
  try {
    localStorage.setItem('receitas', json);
  } catch (e) {
    console.error('Erro ao salvar:', e);
    mostrarMensagem('Não deu para salvar. O aparelho está sem espaço.', 'erro');
    return false;
  }
  try { localStorage.setItem('receitas_backup', json); }
  catch (e) { console.warn('Backup não pôde ser atualizado:', e); }
  return true;
}

function carregarReceitas() {
  const CHAVE_PRINCIPAL = 'receitas';
  const CHAVE_BACKUP    = 'receitas_backup';

  try {
    const dados = localStorage.getItem(CHAVE_PRINCIPAL);

    if (!dados) {
      const backup = localStorage.getItem(CHAVE_BACKUP);
      if (backup) {
        const parsed = JSON.parse(backup);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.warn('Dados principais vazios, restaurando backup...');
          receitas = normalizarLista(parsed);
          localStorage.setItem(CHAVE_PRINCIPAL, JSON.stringify(receitas));
          mostrarMensagem('Suas receitas foram recuperadas.', 'sucesso');
          invalidarCache();
          mostrarReceitas();
          return;
        }
      }
      receitas = [];
      invalidarCache();
      mostrarReceitas();
      return;
    }

    const parsed = JSON.parse(dados);
    if (!Array.isArray(parsed)) throw new Error('Dados corrompidos: não é um array');

    receitas = normalizarLista(parsed);

    if (receitas.length > 0) {
      try { localStorage.setItem(CHAVE_BACKUP, JSON.stringify(receitas)); }
      catch (e) { console.warn('Não foi possível salvar backup:', e); }
    }

  } catch (e) {
    console.error('Erro ao ler receitas:', e);
    try {
      const backup = localStorage.getItem(CHAVE_BACKUP);
      if (backup) {
        const parsed = JSON.parse(backup);
        if (Array.isArray(parsed) && parsed.length > 0) {
          receitas = normalizarLista(parsed);
          localStorage.setItem(CHAVE_PRINCIPAL, JSON.stringify(receitas));
          mostrarMensagem('Houve um problema, mas suas receitas foram recuperadas.', 'sucesso');
          invalidarCache();
          mostrarReceitas();
          return;
        }
      }
    } catch (backupErr) {
      console.error('Backup também falhou:', backupErr);
    }
    mostrarMensagem('Não deu para abrir suas receitas. Toque em Importar e escolha seu arquivo de backup.', 'erro');
  }

  invalidarCache();
  mostrarReceitas();
}

function destacarCamposPreenchidos() {
const nomeInput = document.getElementById('nomeReceita');
const linkInput = document.getElementById('linkReceita');
if (nomeInput.value) nomeInput.classList.add('campo-preenchido');
if (linkInput.value) linkInput.classList.add('campo-preenchido');
nomeInput.addEventListener('input', function() { this.classList.remove('campo-preenchido'); }, { once: true });
linkInput.addEventListener('input', function() { this.classList.remove('campo-preenchido'); }, { once: true });
document.body.classList.add('modo-compartilhamento');
}

function escapeHTML(str = "") {
return String(str)
.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
.replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function validarURL(url) {
try {
url = url.trim();
if (url.startsWith('content://') || url.startsWith('file://')) return true;
let urlParaValidar = url;
if (!url.startsWith('http://') && !url.startsWith('https://')) urlParaValidar = 'https://' + url;
new URL(urlParaValidar);
return true;
} catch { return false; }
}

function mostrarMensagem(mensagem, tipo = 'sucesso') {
const container = document.getElementById('toast-container');
if (!container) return;
container.innerHTML = '';
const mensagemEl = document.createElement('div');
mensagemEl.className = `custom-message ${tipo}`;
mensagemEl.textContent = mensagem;
mensagemEl.style.cssText = `
padding: 12px 20px;
background: ${tipo === 'sucesso' ? '#4CAF50' : '#f44336'};
color: white; border-radius: 4px; margin-bottom: 10px;
animation: slideInRight 0.3s ease; font-weight: 600;
box-shadow: 0 4px 12px rgba(0,0,0,0.15); pointer-events: none; max-width: 300px;
`;
container.appendChild(mensagemEl);
setTimeout(() => {
mensagemEl.style.animation = 'slideOutRight 0.3s ease';
setTimeout(() => mensagemEl.remove(), 300);
}, 4000);
}

function voltarParaInicio() {
const campoBusca = document.getElementById('campoBusca');
const btnLimpar = document.getElementById('btnLimparBusca');
const btnFavoritos = document.getElementById("btnFavoritos");
if (campoBusca) campoBusca.value = '';
termoBusca = '';
if (btnLimpar) btnLimpar.style.display = 'none';
if (campoBusca) campoBusca.classList.remove('busca-ativa');
document.body.classList.remove('modo-busca');
modoBusca = false;
if (campoBusca) campoBusca.blur();
document.getElementById('formReceita').reset();
document.body.classList.remove('modo-compartilhamento');
const nomeInput = document.getElementById('nomeReceita');
const linkInput = document.getElementById('linkReceita');
if (nomeInput) nomeInput.classList.remove('campo-preenchido');
if (linkInput) linkInput.classList.remove('campo-preenchido');
modoFavoritos = false;
categoriaAtual = '';
criarAbasCategorias();
mostrarReceitas();
setTimeout(() => {
const container = document.querySelector('.container');
if (container) container.focus();
}, 10);
}

function invalidarCache() {
cacheReceitasOrdenadas = null;
ultimaCategoria = null;
mapaIndicesReceitas.clear();
receitas.forEach((r, i) => mapaIndicesReceitas.set(r, i));
}

function salvarReceita(event) {
event.preventDefault();
const nome = document.getElementById('nomeReceita').value.trim();
let link = document.getElementById('linkReceita').value.trim();
const categoria = document.getElementById('categoriaReceita').value;
if (!nome || !link || !categoria) {
mostrarMensagem('Preencha nome, link e categoria.', 'erro');
return;
}
link = normalizarLink(link);
if (!validarURL(link)) {
mostrarMensagem('Esse link não parece certo.', 'erro');
return;
}
const receitaExistente = receitas.find(r => r.nome.toLowerCase() === nome.toLowerCase());
if (receitaExistente) {
mostrarMensagem('Já existe uma receita com este nome!', 'erro');
return;
}
const novaReceita = { nome, link, categoria, data: new Date().toISOString(), favorito: false };
receitas.unshift(novaReceita);
persistirReceitas();
modoFavoritos = false;
resetarBuscaVisual();
document.getElementById('formReceita').reset();
invalidarCache();
document.body.classList.remove('modo-compartilhamento');
categoriaAtual = categoria;
criarAbasCategorias();
mostrarReceitas();
const btn = document.querySelector('#formReceita button[type="submit"]');
const textoOriginal = btn.textContent;
btn.textContent = 'Salvo';
setTimeout(() => { btn.textContent = textoOriginal; }, 1500);
mostrarMensagem('Receita salva!', 'sucesso');
}

function filtrarPorCategoria(cat) {
categoriaAtual = categoriaAtual === cat ? '' : cat;
modoFavoritos = false;
const btnFavoritos = document.getElementById("btnFavoritos");
criarAbasCategorias();
mostrarReceitas();
}

function contarReceitasPorCategoria() {
return receitas.reduce((acc, receita) => {
const cat = receita.categoria || 'Especial';
acc[cat] = (acc[cat] || 0) + 1;
return acc;
}, {});
}

function criarAbasCategorias() {
const categoriasTabs = document.getElementById('categoriasTabs');
if (!categoriasTabs) return;
const categoriasPadraoArray = [...CATEGORIAS_PADRAO].sort((a, b) => a.localeCompare(b, 'pt-BR'));
const contagem = contarReceitasPorCategoria();
categoriasTabs.innerHTML = categoriasPadraoArray.map(cat => {
const count = contagem[cat] || 0;
return `
<button class="categoria-tab ${categoriaAtual === cat ? 'active' : ''}" onclick="filtrarPorCategoria('${cat}')">
${cat} ${count > 0 ? `<span class="categoria-count">${count}</span>` : ''}
</button>`;
}).join('');
}

function obterReceitasOrdenadas() {
if (cacheReceitasOrdenadas && ultimaCategoria === categoriaAtual) return cacheReceitasOrdenadas;
const receitasFiltradas = categoriaAtual ? receitas.filter(r => r.categoria === categoriaAtual) : receitas;
cacheReceitasOrdenadas = [...receitasFiltradas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
ultimaCategoria = categoriaAtual;
return cacheReceitasOrdenadas;
}

function atualizarBotaoFavoritos() {
  const btn = document.getElementById('btnFavoritos');
  if (!btn) return;
  btn.classList.toggle('ativo', modoFavoritos);
  btn.setAttribute('aria-pressed', modoFavoritos ? 'true' : 'false');
}

function mostrarReceitas() {
  desenharReceitas();
  atualizarBotaoFavoritos();
}

function desenharReceitas() {
const lista = document.getElementById('listaReceitas');
const listaCard = document.getElementById('listaCard');
const stats = document.getElementById('stats');
const btnFavoritos = document.getElementById("btnFavoritos");
if (!lista || !listaCard || !stats) return;

if (modoBusca && termoBusca) {
const resultados = buscarReceitas(termoBusca).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
modoFavoritos = false;
if (resultados.length === 0) {
lista.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div><p class="empty-state-text">Nenhuma receita encontrada</p></div>`;
stats.innerHTML = `<div class="busca-stats">Busca: "${escapeHTML(termoBusca)}" - 0 resultados</div>`;
listaCard.style.display = 'block'; listaCard.style.padding = '25px'; return;
}
listaCard.style.display = 'block'; listaCard.style.padding = '15px 25px';
stats.innerHTML = `<div class="busca-stats">🔍 Busca: "${escapeHTML(termoBusca)}" - ${resultados.length} ${resultados.length === 1 ? 'resultado' : 'resultados'}<button onclick="limparBusca()" style="margin-left: 10px; background: none; border: none; color: #6a4c93; cursor: pointer; font-size: 0.6em;">limpar</button></div>`;
lista.innerHTML = resultados.map((r) => {
const indexOriginal = mapaIndicesReceitas.get(r);
return `<div class="receita-linha resultado-busca busca-destaque">
<div class="favorito-star" onclick="toggleFavorito(${indexOriginal})" style="cursor:pointer; font-size:18px; margin-right:6px;">${r.favorito ? '❤️' : '🤍'}</div>
<div class="receita-info">
<a href="#" onclick="abrirLink(${indexOriginal}); return false;" class="receita-nome">${destacarTexto(r.nome, termoBusca)}</a>
<span class="receita-categoria">${destacarTexto(r.categoria, termoBusca)}</span>
</div>
<div class="receita-actions">
<button class="btn-rename" onclick="renomearReceita(${indexOriginal})" title="Renomear">✏️</button>
<button class="btn-delete" onclick="excluirReceita(${indexOriginal})" title="Excluir">🗑️</button>
</div></div>`;
}).join('');
return;
}

if (!categoriaAtual && !modoFavoritos) {
lista.innerHTML = `<div class="empty-state" style="text-align: center; padding: 0;">
<img src="cozinheiro.png" alt="Cozinheiro" style="width: 250px; height: auto; margin-top: -5px; display: block; margin-left: auto; margin-right: auto;">
<a href="https://cozinhabaron.blogspot.com/" target="_blank" style="display: inline-block; margin-top: 6px; font-size: 11px; color: #a0522d; text-decoration: none;">Acesse o blog Feito na Minha Cozinha</a>
</div>`;
stats.textContent = `Você tem ${receitas.length} receitas salvas 💾`;
listaCard.style.display = 'block'; listaCard.style.padding = '5px'; return;
}

let receitasFiltradas = obterReceitasOrdenadas();
if (modoFavoritos) {
categoriaAtual = '';
criarAbasCategorias();
receitasFiltradas = receitasFiltradas.filter(r => r.favorito);
}

if (receitasFiltradas.length === 0) {
lista.innerHTML = `<div class="empty-state"><p class="empty-state-text">${modoFavoritos ? '❤️ Nenhuma receita favorita' : `🥣 Sem receitas na categoria ${categoriaAtual}`}</p></div>`;
stats.textContent = '';
listaCard.style.display = 'block'; listaCard.style.padding = '25px'; return;
}

listaCard.style.display = 'block'; listaCard.style.padding = '15px 25px';
stats.textContent = modoFavoritos
? `Você tem ${receitasFiltradas.length} ${receitasFiltradas.length === 1 ? 'receita' : 'receitas'} nos favoritos ❤️`
: `🍛 ${receitasFiltradas.length} ${receitasFiltradas.length === 1 ? 'receita' : 'receitas'} em ${categoriaAtual}`;

lista.innerHTML = receitasFiltradas.map((r) => {
const indexOriginal = mapaIndicesReceitas.get(r);
return `<div class="receita-linha">
<div class="favorito-star" onclick="toggleFavorito(${indexOriginal})" style="cursor:pointer; font-size:12px; margin-right:6px;">${r.favorito ? '❤️' : '🤍'}</div>
<div class="receita-info">
<a href="#" onclick="abrirLink(${indexOriginal}); return false;" class="receita-nome">${escapeHTML(r.nome)}</a>
</div>
<div class="receita-actions">
<button class="btn-rename" onclick="renomearReceita(${indexOriginal})" title="Renomear">✏️</button>
<button class="btn-delete" onclick="excluirReceita(${indexOriginal})" title="Excluir">🗑️</button>
</div></div>`;
}).join('');
}

function abrirLink(index) {
  const receita = receitas[index];
  const url = receita && receita.link ? normalizarLink(receita.link) : '';
  if (!url || !validarURL(url)) { mostrarMensagem('Não deu para abrir o link.', 'erro'); return; }
  if (window.cordova && cordova.InAppBrowser) {
    if (/^https?:/i.test(url)) {
      cordova.InAppBrowser.open(url, '_system');
    } else if (window.plugins?.webintent?.startActivity) {
      window.plugins.webintent.startActivity({ action: 'android.intent.action.VIEW', url: url },
        function() {}, function() { mostrarMensagem('Não deu para abrir o arquivo.', 'erro'); });
    } else { mostrarMensagem('Não deu para abrir o link.', 'erro'); }
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

function excluirReceita(index) {
const receita = receitas[index];
if (!receita) { mostrarMensagem("Receita não encontrada.", "erro"); return; }
const overlay = document.createElement('div');
overlay.className = 'custom-modal-overlay';
overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000; animation: fadeIn 0.3s ease;`;
const modalContent = document.createElement('div');
modalContent.style.cssText = `background: white; padding: 25px; border-radius: 12px; text-align: center; max-width: 80%; box-shadow: 0 4px 12px rgba(0,0,0,0.15); animation: slideUp 0.3s ease;`;
modalContent.innerHTML = `<p style="font-size: 16px; color: #333; margin-bottom: 20px;">Deseja excluir a receita "<strong>${escapeHTML(receita.nome)}</strong>"?</p>
<div style="display: flex; justify-content: center; gap: 12px;">
<button id="btnConfirmar" style="padding: 8px 16px; background: #ff7043; color: white; border: none; border-radius: 8px; font-weight: 600;">Sim</button>
<button id="btnCancelar" style="padding: 8px 16px; background: #e0e0e0; color: #333; border: none; border-radius: 8px; font-weight: 600;">Não</button>
</div>`;
overlay.appendChild(modalContent);
document.body.appendChild(overlay);
document.getElementById('btnCancelar').addEventListener('click', () => overlay.remove());
document.getElementById('btnConfirmar').addEventListener('click', () => {
const receitaExcluida = receitas.splice(index, 1)[0];
persistirReceitas();
invalidarCache();
criarAbasCategorias();
mostrarReceitas();
overlay.remove();
mostrarMensagem(`"${receitaExcluida.nome}" foi excluída.`, 'sucesso');
});
}

const debounce = (func, wait) => {
let timeout;
return function executedFunction(...args) {
const later = () => { clearTimeout(timeout); func(...args); };
clearTimeout(timeout);
timeout = setTimeout(later, wait);
};
};

const filtrarReceitas = debounce(function() {
const campoBusca = document.getElementById('campoBusca');
const btnLimpar = document.getElementById('btnLimparBusca');
const btnFavoritos = document.getElementById("btnFavoritos");
if (!campoBusca || !btnLimpar) return;
termoBusca = campoBusca.value.trim().toLowerCase();
if (termoBusca) {
btnLimpar.style.display = 'block';
campoBusca.classList.add('busca-ativa');
document.body.classList.add('modo-busca');
modoBusca = true;
modoFavoritos = false;
} else {
btnLimpar.style.display = 'none';
campoBusca.classList.remove('busca-ativa');
document.body.classList.remove('modo-busca');
modoBusca = false;
}
mostrarReceitas();
}, 300);

function limparBusca() {
const campoBusca = document.getElementById('campoBusca');
const btnLimpar = document.getElementById('btnLimparBusca');
if (!campoBusca || !btnLimpar) return;
campoBusca.value = ''; termoBusca = '';
btnLimpar.style.display = 'none';
campoBusca.classList.remove('busca-ativa');
document.body.classList.remove('modo-busca');
modoBusca = false;
campoBusca.blur();
setTimeout(() => { const container = document.querySelector('.container'); if (container) container.focus(); }, 10);
mostrarReceitas();
}

function destacarTexto(texto, termo) {
if (!termo) return escapeHTML(texto);
const textoEscapado = escapeHTML(texto);
const termoEscapado = termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
return textoEscapado.replace(new RegExp(`(${termoEscapado})`, 'gi'), '<span class="highlight">$1</span>');
}

function buscarReceitas(termo) {
if (!termo) return receitas;
return receitas.filter(receita =>
receita.nome.toLowerCase().includes(termo) ||
receita.categoria.toLowerCase().includes(termo) ||
(receita.link && receita.link.toLowerCase().includes(termo))
);
}

function exportarReceitas() {
if (receitas.length === 0) { mostrarMensagem("Você ainda não tem receitas.", "erro"); return; }
const now = new Date();
const dia = String(now.getDate()).padStart(2, '0');
const mes = String(now.getMonth() + 1).padStart(2, '0');
const ano = String(now.getFullYear()).slice(-2);
const hora = String(now.getHours()).padStart(2, '0');
const min = String(now.getMinutes()).padStart(2, '0');
const fileName = `cookbook${dia}${mes}${ano}${hora}${min}.json`;
const dadosExportacao = { versao: "1.0", dataExportacao: new Date().toISOString(), totalReceitas: receitas.length, receitas: receitas };
const jsonData = JSON.stringify(dadosExportacao, null, 2);
const blob = new Blob([jsonData], { type: 'application/json' });
if (window.cordova && cordova.file) {
const directoryPath = cordova.file.externalRootDirectory + "Download/";
window.resolveLocalFileSystemURL(directoryPath,
function(dirEntry) { salvarArquivo(dirEntry, fileName, blob); },
function() {
window.resolveLocalFileSystemURL(cordova.file.externalRootDirectory,
function(rootEntry) { rootEntry.getDirectory("Download", { create: true }, function(dirEntry) { salvarArquivo(dirEntry, fileName, blob); }, function() { mostrarMensagem("Não deu para salvar o arquivo.", "erro"); }); },
function() { mostrarMensagem("Não deu para salvar o arquivo.", "erro"); }
);
});
} else {
try {
const url = URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url; link.download = fileName; link.style.display = 'none';
document.body.appendChild(link); link.click();
setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(url); }, 100);
mostrarMensagem(`Pronto! Arquivo salvo: ${fileName}`, 'sucesso');
} catch (error) { mostrarMensagem("Não deu para exportar.", "erro"); }
}
}

function salvarArquivo(dirEntry, fileName, blob) {
dirEntry.getFile(fileName, { create: true, exclusive: false },
function(fileEntry) {
fileEntry.createWriter(function(fileWriter) {
fileWriter.onwriteend = function() { showPersistentModal(fileName); };
fileWriter.onerror = function() { mostrarMensagem("Não deu para exportar.", "erro"); };
fileWriter.write(blob);
}, function() { mostrarMensagem("Não deu para exportar.", "erro"); });
}, function() { mostrarMensagem("Não deu para exportar.", "erro"); });
}

function importarReceitas() {
const fileInput = document.getElementById('fileInput');
if (fileInput) fileInput.click();
}

function processarImportacao(event) {
  const file = event.target.files[0];
  if (!file) { mostrarMensagem('Nenhum arquivo escolhido.', 'erro'); return; }
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const dados = JSON.parse(e.target.result);
      const lista = Array.isArray(dados) ? dados : (dados && Array.isArray(dados.receitas) ? dados.receitas : null);
      if (!lista) {
        mostrarMensagem('Esse arquivo não é de receitas.', 'erro');
      } else {
        const nomes = new Set(receitas.map(r => r.nome.toLowerCase()));
        const novas = [];
        let repetidas = 0, comProblema = 0;
        lista.forEach(r => {
          if (!r || typeof r.nome !== 'string' || typeof r.link !== 'string' || !r.nome.trim() || !r.link.trim()) { comProblema++; return; }
          const nome = r.nome.trim();
          const link = normalizarLink(r.link);
          if (!validarURL(link)) { comProblema++; return; }
          if (nomes.has(nome.toLowerCase())) { repetidas++; return; }
          nomes.add(nome.toLowerCase());
          novas.push({
            nome, link,
            categoria: CATEGORIAS_PADRAO.includes(r.categoria) ? r.categoria : 'Especial',
            data: r.data || new Date().toISOString(),
            favorito: r.favorito === true
          });
        });
        receitas = [...receitas, ...novas];
        persistirReceitas();
        invalidarCache();
        criarAbasCategorias();
        mostrarReceitas();
        mostrarMensagem(`Pronto! Novas: ${novas.length}. Já existiam: ${repetidas}. Com problema: ${comProblema}.`, 'sucesso');
      }
    } catch (err) { mostrarMensagem('Não deu para importar. Confira o arquivo.', 'erro'); }
    event.target.value = '';
  };
  reader.readAsText(file);
}

function renomearReceita(index) {
const receita = receitas[index];
if (!receita) return;
const overlay = document.createElement('div');
overlay.className = 'custom-modal-overlay';
overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000; animation: fadeIn 0.3s ease;`;
const modalContent = document.createElement('div');
modalContent.style.cssText = `background: #fff; padding: 25px 30px; border-radius: 14px; text-align: center; max-width: 85%; box-shadow: 0 6px 18px rgba(0,0,0,0.25); animation: slideUp 0.3s ease;`;
modalContent.innerHTML = `<p style="color: #444; font-size: 14px; margin-bottom: 12px;">Renomear "<strong>${escapeHTML(receita.nome)}</strong>" para:</p>
<input type="text" id="novoNomeReceita" value="${escapeHTML(receita.nome)}" style="width: 90%; padding: 8px 10px; border-radius: 8px; border: 1px solid #ccc; outline: none; font-size: 15px; color: #333;">
<div style="display: flex; justify-content: center; gap: 12px; margin-top: 20px;">
<button id="btnSalvarNome" style="padding: 8px 16px; background: #6a4c93; color: white; border: none; border-radius: 8px; font-weight: 600;">Salvar</button>
<button id="btnCancelarNome" style="padding: 8px 16px; background: #e0e0e0; color: #333; border: none; border-radius: 8px; font-weight: 600;">Cancelar</button>
</div>`;
overlay.appendChild(modalContent);
document.body.appendChild(overlay);
const input = document.getElementById('novoNomeReceita');
input.focus(); input.setSelectionRange(0, input.value.length);
const fecharModal = () => overlay.remove();
document.getElementById('btnCancelarNome').addEventListener('click', fecharModal);
document.getElementById('btnSalvarNome').addEventListener('click', () => {
const novoNome = input.value.trim();
if (!novoNome) { mostrarMensagem('Escreva um nome.', 'erro'); return; }
const jaExiste = receitas.some((r, i) => i !== index && r.nome.toLowerCase() === novoNome.toLowerCase());
if (jaExiste) { mostrarMensagem('Já existe uma receita com esse nome!', 'erro'); return; }
receita.nome = novoNome;
persistirReceitas();
invalidarCache();
criarAbasCategorias();
mostrarReceitas();
fecharModal();
mostrarMensagem('Nome alterado!', 'sucesso');
});
input.addEventListener('keydown', e => {
if (e.key === 'Enter') document.getElementById('btnSalvarNome').click();
if (e.key === 'Escape') fecharModal();
});
}

function showPersistentModal(fileName) {
const existingModal = document.querySelector('.custom-modal-overlay');
if (existingModal) existingModal.remove();
const overlay = document.createElement('div');
overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000; animation: fadeIn 0.3s ease;`;
const modalContent = document.createElement('div');
modalContent.style.cssText = `background: white; padding: 25px; border-radius: 12px; text-align: center; max-width: 80%; box-shadow: 0 4px 12px rgba(0,0,0,0.15); animation: slideUp 0.3s ease;`;
modalContent.innerHTML = `<p style="font-size: 13px; line-height: 1.4;">Arquivo salvo em Downloads:<br><br><span style="color: #8d6e63; font-weight: 600;">${fileName}</span><br><br><span style="color: #5d4037; font-size: 12px;">💾 Guarde este arquivo para usar depois.</span></p>
<div style="text-align: center; margin-top: 16px;"><button id="btnFecharModal" style="padding: 8px 16px; font-size: 14px; font-weight: 600; color: #6a4c93; background: #f3e5f5; border: 1px solid #ce93d8; border-radius: 8px;">OK</button></div>`;
overlay.appendChild(modalContent);
document.body.appendChild(overlay);
document.getElementById('btnFecharModal').addEventListener('click', () => overlay.remove());
}

function capturarCompartilhamentoPWA() {
const urlParams = new URLSearchParams(window.location.search);
const title = urlParams.get('title');
const text = urlParams.get('text');
const sharedUrl = urlParams.get('url');
let conteudo = title || text || sharedUrl || '';
if (conteudo) {
setTimeout(() => {
const nomeReceita = extrairNomeReceita(conteudo);
const linkReceita = extrairLink(conteudo) || sharedUrl || '';
if (nomeReceita) document.getElementById('nomeReceita').value = nomeReceita;
if (linkReceita) document.getElementById('linkReceita').value = linkReceita;
if (nomeReceita || linkReceita) {
destacarCamposPreenchidos();
mostrarMensagem('Link pronto! Confira o nome e escolha a categoria.', 'sucesso');
}
}, 500);
}
}

function toggleFavorito(index) {
const receita = receitas[index];
if (!receita) return;
receita.favorito = !receita.favorito;
persistirReceitas();
if (receita.favorito) {
modoFavoritos = true;
categoriaAtual = '';
}
mostrarReceitas();
}

function toggleFavoritos() {
  if (modoBusca) { resetarBuscaVisual(); modoFavoritos = true; }
  else { modoFavoritos = !modoFavoritos; }
  categoriaAtual = '';
  criarAbasCategorias();
  mostrarReceitas();
}

document.addEventListener('keydown', function(e) {
if (e.key === 'Escape' && modoBusca) limparBusca();
});

const style = document.createElement('style');
style.textContent = `
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes slideOutRight { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
.custom-message { pointer-events: none; }
.receita-linha { display: flex; align-items: center; }
.receita-info { flex-grow: 1; display: flex; flex-direction: column; }
`;
document.head.appendChild(style);
