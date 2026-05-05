// Constantes Globais
const CATEGORIAS_PADRAO = Object.freeze([
'Café', 'Doces', 'Drinks', 'Especial', 'Jantar', 'Petiscos', 'Salgados', 'Saudável'
]);

// Intercepta erros globais de Promise do WebIntent
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

// Intercepta erros globais síncronos
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
let mapaIndicesReceitas = new Map(); // Mapa para otimização de performance (Chave: objeto Receita, Valor: índice no array 'receitas')

// ✅ 2. Variáveis novas no início do script.js
let modoFavoritos = false;

// safeWebIntentCall - SILÊNCIO TOTAL
function safeWebIntentCall(callback) {
try {
if (typeof callback !== 'function') return;
if (!window.plugins?.webintent) return;

callback();
} catch (error) {
// SILENCIO TOTAL - não loga nada, ignora completamente o bug do plugin
}
}

document.addEventListener('deviceready', function() {
console.log("=== INICIANDO APP MONACA/CORDOVA ===");
console.log("Cordova:", !!window.cordova);
console.log("Plugins:", !!window.plugins);
console.log("WebIntent:", !!window.plugins?.webintent);

// 1. Inicializa o app normalmente
inicializar();

// 2. Configura os handlers para WebIntent
configurarWebIntent();
}, false);

// Bloco Consolidado
document.addEventListener('DOMContentLoaded', function() {
// 1. Fallback para desenvolvimento web (só inicializa se não for ambiente Cordova/DeviceReady)
if (!window.cordova) {
inicializar();
}

// NOVO: Capturar compartilhamento do PWA
capturarCompartilhamentoPWA();

// 2. Adicionar event listeners para prevenir foco automático e atalhos na busca
const btnLimpar = document.getElementById('btnLimparBusca');
const campoBusca = document.getElementById('campoBusca');

if (btnLimpar) {
btnLimpar.addEventListener('click', function(e) {
e.preventDefault();
e.stopPropagation();
});
}

if (campoBusca) {
campoBusca.addEventListener('keydown', function(e) {
if (e.key === 'Escape') {
limparBusca();
e.preventDefault();
}
});
}
}, false); // O 'false' é para consistência com o deviceready

// --- NOVO BLOCO DE WEBINTENT RECURSIVO (PASSO 4) ---

function tentarCapturarCompartilhamento(tentativa = 1) {
if (!window.plugins?.webintent) return;

console.log("Tentativa de captura:", tentativa);

safeWebIntentCall(() => {
window.plugins.webintent.getExtra(window.plugins.webintent.EXTRA_TEXT, function(text) {
if (text) {
console.log("📥 Capturado EXTRA_TEXT:", text);
processarCompartilhamento(text);
return;
}

safeWebIntentCall(() => {
window.plugins.webintent.getUri(function(uri) {
if (uri) {
console.log("📥 Capturado URI:", uri);
processarCompartilhamento(uri);
return;
}

safeWebIntentCall(() => {
window.plugins.webintent.getExtra(window.plugins.webintent.EXTRA_STREAM, function(stream) {
if (stream) {
console.log("📥 Capturado STREAM:", stream);
processarCompartilhamentoComImagem({
    extras: { 'android.intent.extra.STREAM': stream }
});
return;
}

if (tentativa < 5) {
setTimeout(() => {
    tentarCapturarCompartilhamento(tentativa + 1);
}, 250);
} else {
console.log("❌ Não recebeu dados do compartilhamento após 5 tentativas.");
}
});
});
});
});
});
});
}

// --- FIM NOVO BLOCO ---

// --- FUNÇÃO CONFIGURARWEBINTENT (PASSO 2 E 3) ---
function configurarWebIntent() {
if (!window.plugins || !window.plugins.webintent) {
console.log("WebIntent não disponível para configuração.");
return;
}

console.log("=== CONFIGURANDO WEBINTENT PARA COMPARTILHAMENTO ===");

// NOVO: tenta capturar automaticamente com múltiplas tentativas
tentarCapturarCompartilhamento();
}

// Função para processar conteúdo compartilhado
function processarCompartilhamento(intent) {
let textoCompartilhado = '';

// Verifica se é uma string (URI ou EXTRA_TEXT) ou um objeto intent
if (typeof intent === 'string') {
textoCompartilhado = intent;
} else if (intent && intent.extras) {
// Verifica se é compartilhamento com imagem (STREAM)
if (intent.extras['android.intent.extra.STREAM']) {
processarCompartilhamentoComImagem(intent);
return;
}

textoCompartilhado = intent.extras['android.intent.extra.TEXT'] ||

intent.extras['android.intent.extra.SUBJECT'] ||
intent.extras.text ||
'';
}

if (textoCompartilhado) {
let nomeReceita = extrairNomeReceita(textoCompartilhado);
let linkReceita = extrairLink(textoCompartilhado);

const nomeInput = document.getElementById('nomeReceita');

if (nomeReceita) {
nomeInput.value = nomeReceita;
// Placeholder para quando já tem nome (usuário pode editar)
nomeInput.placeholder = "Edite o nome da receita se quiser...";
} else {
nomeInput.value = '';
// Placeholder claro para leigos quando não detecta nome
nomeInput.placeholder = "Digite aqui o nome da receita...";
}

if (linkReceita) {
document.getElementById('linkReceita').value = linkReceita;
}

// Destacar campos e focar na categoria
destacarCamposPreenchidos();

// Foca no campo do nome para usuário preencher
nomeInput.focus();

mostrarMensagem('Link detectado! Dê um nome para sua receita e selecione a categoria.', 'sucesso');
}
}

// Função para extrair nome da receita do texto compartilhado (MELHORADA com limpeza e regex mais abrangente)
function extrairNomeReceita(texto) {
if (!texto || texto.trim() === '') return '';

let titulo = texto;

// 1. Limpeza básica
try {
titulo = titulo.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
} catch (e) {
// Fallback para ambientes sem suporte a Unicode
}

titulo = titulo.replace(/[\n\r\t]+/g, " ").replace(/\s{2,}/g, " ").trim();

// 2. Se for apenas URL sem texto, retorna vazio
const urlMatch = titulo.match(/https?:\/\/[^\s]+/);
if (urlMatch && titulo.trim() === urlMatch[0]) {
return '';
}

// 3. Tenta extrair de slugs (melhor método para links estruturados)
const slugMatch = titulo.match(/\/([a-z0-9\-_%]+?)(?:\.[a-z]+)?(?:$|[?#])/i);
if (slugMatch && slugMatch[1]) {
let slug = slugMatch[1]
.replace(/-/g, " ")
.replace(/_/g, " ")
.replace(/%20/g, " ")
.replace(/\d+/g, "")
.trim();

if (slug.length >= 3) {
return capitalizarTitulo(slug);
}
}

// 4. Tenta extrair de parâmetros
const paramMatch = titulo.match(/(?:nome|title|recipe|r|q)=([^&]+)/i);
if (paramMatch && paramMatch[1]) {
let param = decodeURIComponent(paramMatch[1])
.replace(/-/g, " ")
.replace(/_/g, " ")
.replace(/%20/g, " ")
.trim();

if (param.length >= 3) {
return capitalizarTitulo(param);
}
}

// 5. Remove ruídos específicos (CORRIGIDO)
const ruidos = [
"receita", "receitas", "como fazer", "passo a passo", "tutorial",
"aprenda", "fácil", "facil", "simples", "rápido", "rapido",
"perfeito", "perfeita", "melhor", "2024", "2023", "2022",
"completo", "o melhor", "a melhor", "vídeo", "video"
];

ruidos.forEach(ruido => {
titulo = titulo.replace(new RegExp(`\\b${ruido}\\b`, 'gi'), ''); // ✅ CORRIGIDO
});

titulo = titulo.replace(/\s{2,}/g, " ").trim();

// 6. Padrões comuns (fallback para YouTube e similar)
const youtubeMatch = titulo.match(/[-–—]?\s*([^|\n]*?)(?:\s*[-–—]?\s*YouTube|\s*[-–—]?\s*\||\s*https?:\/\/|$)/i);
if (youtubeMatch && youtubeMatch[1].trim()) {
let nome = youtubeMatch[1].trim();
nome = nome.replace(/[-–—,:;.]+$/, '').trim();
if (nome.length >= 3) return capitalizarTitulo(nome);
}

const receitaMatch = titulo.match(/(?:Receita de|Como fazer|Tutorial)\s+(.+?)(?:\s*[-–—]|\s*\||\s*https?:\/\/|$)/i);
if (receitaMatch && receitaMatch[1].trim()) {
return capitalizarTitulo(receitaMatch[1].trim());
}

// 7. Fallback: primeira linha razoável
const primeiraLinha = titulo.split('\n')[0].trim();
if (primeiraLinha && primeiraLinha.length >= 3 && primeiraLinha.length < 80 && 
!primeiraLinha.match(/^https?:\/\/[^\s]+$/)) {
return capitalizarTitulo(primeiraLinha);
}

return ""; // Retorna vazio para usuário preencher conscientemente
}

// Função auxiliar para capitalização inteligente
function capitalizarTitulo(texto) {
if (!texto) return '';

const manterMinusculas = ["de", "da", "do", "das", "dos", "com", "sem", "para", "em", "e", "ou"];

return texto
.toLowerCase()
.split(" ")
.map((palavra, index) => 
(index > 0 && manterMinusculas.includes(palavra)) ? 
palavra : 
palavra.charAt(0).toUpperCase() + palavra.slice(1)
)
.join(" ")
.trim();
}

// Função para extrair link do texto (AJUSTADO para aceitar links sem http/https)
function extrairLink(texto) {
// 1. Tenta capturar links com protocolo (https?://...)
let urlMatch = texto.match(/(https?:\/\/[^\s]+)/i);
if (urlMatch) return urlMatch[1];

// 2. Tenta capturar links sem protocolo (ex: instagram.com/reels/...)
// Procura por algo que comece com uma palavra/www., seguido por um ponto, e que não seja o fim de uma frase (não termina com ponto final)
// Isso é um pouco heurístico, mas cobre o caso de uso comum
urlMatch = texto.match(/(\b(www\.|[a-z0-9\-]+\.)[a-z]{2,}[^\s\.\?!]*)/i);
if (urlMatch && urlMatch[1]) return urlMatch[1];

return '';
}

// Função para processar compartilhamento com imagem/stream (ex: Instagram)
function processarCompartilhamentoComImagem(intent) {
let textoCompartilhado = '';
let streamLink = '';

if (intent && intent.extras) {
// Tenta pegar o texto do compartilhamento (descrição/título)
textoCompartilhado = intent.extras['android.intent.extra.TEXT'] ||
intent.extras['android.intent.extra.SUBJECT'] ||
intent.extras.text ||
'';

streamLink = intent.extras['android.intent.extra.STREAM'] || '';
}

// Se veio com imagem (stream), força um nome base se não tiver texto
if (streamLink) {
const nomeBase = textoCompartilhado || "Receita com Imagem";
document.getElementById('nomeReceita').value = extrairNomeReceita(nomeBase);

// Coloca o stream link no campo de link, pois pode ser uma URI local
document.getElementById('linkReceita').value = streamLink;

destacarCamposPreenchidos();
document.getElementById('categoriaReceita').focus();

mostrarMensagem('Conteúdo com imagem detectado! Verifique o link (pode ser um link local/URI) e salve.', 'sucesso');
return;
}

// Fallback caso seja só texto (redundante, mas seguro)
if (textoCompartilhado) {
processarCompartilhamento(textoCompartilhado);
}
}

function inicializar() {
// Solicita armazenamento persistente ao Android/Chrome para evitar limpeza automática
if (navigator.storage && navigator.storage.persist) {
navigator.storage.persist().then(granted => {
console.log(`Storage persistente: ${granted ? '✅ protegido' : '⚠️ pode ser limpo pelo sistema'}`);
});
}

// 1. Cria o container de mensagens (toast)
let toastContainer = document.getElementById('toast-container');
if (!toastContainer) {
toastContainer = document.createElement('div');
toastContainer.id = 'toast-container';
toastContainer.style.cssText = `
position: fixed;
top: 20px;
right: 20px;
z-index: 10000;
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

function destacarCamposPreenchidos() {
const nomeInput = document.getElementById('nomeReceita');
const linkInput = document.getElementById('linkReceita');

if (nomeInput.value) {
nomeInput.classList.add('campo-preenchido');
}

if (linkInput.value) {
linkInput.classList.add('campo-preenchido');
}

// Remover destaque após o usuário interagir
nomeInput.addEventListener('input', function() {
this.classList.remove('campo-preenchido');
});

linkInput.addEventListener('input', function() {
this.classList.remove('campo-preenchido');
});

document.body.classList.add('modo-compartilhamento');
}

// Função para escapar HTML e prevenir XSS (MAIS SEGURO/EFICIENTE)
function escapeHTML(str = "") {
return String(str)
.replace(/&/g, "&amp;")
.replace(/</g, "&lt;")
.replace(/>/g, "&gt;")
.replace(/"/g, "&quot;")
.replace(/'/g, "&#039;");
}

// Função para validar URL
function validarURL(url) {
try {
url = url.trim();
// Trata URIs locais como válidas
if (url.startsWith('content://') || url.startsWith('file://')) return true;

let urlParaValidar = url;
if (!url.startsWith('http://') && !url.startsWith('https://')) {
urlParaValidar = 'https://' + url; // Tenta HTTPS primeiro
}
new URL(urlParaValidar);
return true;
} catch {
return false;
}
}

// Sistema de mensagens (Refatorado para Toast Container)
function mostrarMensagem(mensagem, tipo = 'sucesso') {
const container = document.getElementById('toast-container');
if (!container) return;

// Remove a mensagem anterior
container.innerHTML = '';

const mensagemEl = document.createElement('div');
mensagemEl.className = `custom-message ${tipo}`;
mensagemEl.textContent = mensagem;
mensagemEl.style.cssText = `
padding: 12px 20px;
background: ${tipo === 'sucesso' ? '#4CAF50' : '#f44336'};
color: white;
border-radius: 4px;
margin-bottom: 10px;
animation: slideInRight 0.3s ease;
font-weight: 600;
box-shadow: 0 4px 12px rgba(0,0,0,0.15);
pointer-events: none;
max-width: 300px;
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

// Limpar o estado de compartilhamento
document.getElementById('formReceita').reset();
document.body.classList.remove('modo-compartilhamento');

// Remover classes de campo-preenchido caso existam
const nomeInput = document.getElementById('nomeReceita');
const linkInput = document.getElementById('linkReceita');
if (nomeInput) nomeInput.classList.remove('campo-preenchido');
if (linkInput) linkInput.classList.remove('campo-preenchido');

// Desativa modo favoritos
modoFavoritos = false;
if (btnFavoritos) btnFavoritos.textContent = "❤️";


categoriaAtual = '';
criarAbasCategorias();
mostrarReceitas();

setTimeout(() => {
const container = document.querySelector('.container');
if (container) {
container.focus();
}
}, 10);
}

function carregarReceitas() {
try {
const dados = localStorage.getItem('receitas');
// Adiciona 'favorito: false' se a receita não tiver a propriedade, para compatibilidade
const receitasCarregadas = dados ? JSON.parse(dados) : [];
receitas = receitasCarregadas.map(r => ({
...r,
favorito: r.favorito === undefined ? false : r.favorito
}));
} catch (e) {
console.error('Erro ao ler receitas do localStorage:', e);
receitas = [];
mostrarMensagem('⚠️ Dados não puderam ser lidos. Importe seu backup JSON.', 'erro');
}
invalidarCache(); // Garantir que o mapa seja criado/atualizado
mostrarReceitas();
}

function invalidarCache() {
cacheReceitasOrdenadas = null;
ultimaCategoria = null;
// Atualiza o mapa de índices para refletir a ordem atual (O(n) na inicialização, O(1) na renderização)
mapaIndicesReceitas.clear();
receitas.forEach((r, i) => mapaIndicesReceitas.set(r, i));
}

function salvarReceita(event) {
event.preventDefault();
const nome = document.getElementById('nomeReceita').value.trim();
let link = document.getElementById('linkReceita').value.trim();
const categoria = document.getElementById('categoriaReceita').value;

if (!nome || !link || !categoria) {
mostrarMensagem('Finalize os campos Nome, Link e Categoria e depois Salve...', 'erro');
return;
}

// Não força http/https se for um link local/URI de compartilhamento
if (!link.startsWith('content://') && !link.startsWith('file://') &&
!link.startsWith('http://') && !link.startsWith('https://')) {
// Tenta HTTPS por padrão
link = 'https://' + link;
}

if (!validarURL(link)) {
mostrarMensagem('Por favor, insira uma URL válida! (ou URI local se for o caso)', 'erro');
return;
}

const receitaExistente = receitas.find(r =>
r.nome.toLowerCase() === nome.toLowerCase()
);

if (receitaExistente) {
mostrarMensagem('Já existe uma receita com este nome!', 'erro');
return;
}

const novaReceita = {
nome,
link,
categoria,
data: new Date().toISOString(),
favorito: false // Inicializa como não favorito
};

receitas.unshift(novaReceita);
localStorage.setItem('receitas', JSON.stringify(receitas));
document.getElementById('formReceita').reset();

invalidarCache();
document.body.classList.remove('modo-compartilhamento'); // Limpa destaque de preenchimento

categoriaAtual = categoria;
criarAbasCategorias();
mostrarReceitas();

const btn = document.querySelector('.btn-primary');
const textoOriginal = btn.textContent;
btn.textContent = 'Salvo';
setTimeout(() => {
btn.textContent = textoOriginal;
}, 1500);

mostrarMensagem('Receita salva com sucesso!', 'sucesso');
}

function filtrarPorCategoria(cat) {
// Se clicar na mesma categoria, volta para "Todas" (limpa o filtro)
categoriaAtual = categoriaAtual === cat ? '' : cat; 

// Ao filtrar por categoria, desativa o modo favoritos
modoFavoritos = false;
const btnFavoritos = document.getElementById("btnFavoritos");
if (btnFavoritos) btnFavoritos.textContent = "❤️";

criarAbasCategorias(); // Recria as abas para atualizar o estado 'active'
mostrarReceitas(); // Exibe as receitas filtradas (ou todas)
}


// Função para contar receitas por categoria
function contarReceitasPorCategoria() {
const contagem = receitas.reduce((acc, receita) => {
const cat = receita.categoria || 'Especial';
acc[cat] = (acc[cat] || 0) + 1;
return acc;
}, {});
return contagem;
}

function criarAbasCategorias() {
const categoriasTabs = document.getElementById('categoriasTabs');
if (!categoriasTabs) return;

// Usando a constante CATEGORIAS_PADRAO
const categoriasPadraoArray = [...CATEGORIAS_PADRAO];

categoriasPadraoArray.sort((a, b) => a.localeCompare(b, 'pt-BR'));

const contagem = contarReceitasPorCategoria();

categoriasTabs.innerHTML = categoriasPadraoArray.map(cat => {
const count = contagem[cat] || 0;
return `
<button class="categoria-tab ${categoriaAtual === cat ? 'active' : ''}"
onclick="filtrarPorCategoria('${cat}')">
${cat}
${count > 0 ? `<span class="categoria-count">${count}</span>` : ''}
</button>
`;
}).join('');
}

function obterReceitasOrdenadas() {
// A função invalidarCache garante que mapaIndicesReceitas esteja atualizado com a ordem de 'receitas'
if (cacheReceitasOrdenadas && ultimaCategoria === categoriaAtual) {
return cacheReceitasOrdenadas;
}

const receitasFiltradas = categoriaAtual ?
receitas.filter(r => r.categoria === categoriaAtual) :
receitas;

// CORRIGIDO: Usa o spread operator para evitar mutação do array original receitasFiltradas (Sugestão 1)
cacheReceitasOrdenadas = [...receitasFiltradas]
.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

ultimaCategoria = categoriaAtual;
return cacheReceitasOrdenadas;
}

function mostrarReceitas() {
const lista = document.getElementById('listaReceitas');
const listaCard = document.getElementById('listaCard');
const stats = document.getElementById('stats');
const btnFavoritos = document.getElementById("btnFavoritos");

if (!lista || !listaCard || !stats) return;

if (modoBusca && termoBusca) {
const resultados = buscarReceitas(termoBusca)
.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

// Se estiver no modo busca, desativa o modo favoritos
modoFavoritos = false;
if (btnFavoritos) btnFavoritos.textContent = "❤️";


if (resultados.length === 0) {
lista.innerHTML = `
<div class="empty-state">
<div class="empty-state-icon">🔍</div>
<p class="empty-state-text">Nenhuma receita encontrada</p>
</div>`;
stats.innerHTML = `<div class="busca-stats">Busca: "${termoBusca}" - 0 resultados</div>`;
listaCard.style.display = 'block';
listaCard.style.padding = '25px';
return;
}

listaCard.style.display = 'block';
listaCard.style.padding = '15px 25px';

stats.innerHTML = `
<div class="busca-stats">
🔍 Busca: "${termoBusca}" - ${resultados.length} ${resultados.length === 1 ? 'resultado' : 'resultados'}
<button onclick="limparBusca()" style="margin-left: 10px; background: none; border: none; color: #6a4c93; cursor: pointer; font-size: 0.6em;">[clique para limpar]</button>
</div>
`;

lista.innerHTML = resultados.map((r, i) => {
// Otimização O(1) com mapa
const indexOriginal = mapaIndicesReceitas.get(r);
return `
<div class="receita-linha resultado-busca busca-destaque">
<div class="favorito-star" onclick="toggleFavorito(${indexOriginal})" 
style="cursor:pointer; font-size:18px; margin-right:6px;">
${r.favorito ? '❤️' : '🤍'}
</div>
<div class="receita-info">
<a href="#" onclick="abrirLink('${escapeHTML(r.link)}'); return false;" class="receita-nome">
${destacarTexto(r.nome, termoBusca)}
</a>
<span class="receita-categoria">${destacarTexto(r.categoria, termoBusca)}</span>
</div>
<div class="receita-actions">
<button class="btn-rename" onclick="renomearReceita(${indexOriginal})" title="Renomear">
<i class="fa-solid fa-pen"></i>
</button>
<button class="btn-delete" onclick="excluirReceita(${indexOriginal})" title="Excluir">
<i class="fa-solid fa-trash"></i>
</button>
</div>
</div>
`;
}).join('');
return;
}

if (!categoriaAtual && !modoFavoritos) {
lista.innerHTML = `
<div class="empty-state" style="text-align: center; padding: 0;">
<img src="cozinheiro.png" alt="Cozinheiro" style="width: 250px; height: auto; margin-top: -5px; display: block; margin-left: auto; margin-right: auto;">
<a href="https://cozinhabaron.blogspot.com/" target="_blank" style="display: inline-block; margin-top: 6px; font-size: 11px; color: #a0522d; text-decoration: none;">
Acesse o blog Feito na Minha Cozinha
</a>
</div>`;
stats.textContent = `Você tem ${receitas.length} receitas salvas 💾`;
listaCard.style.display = 'block';
listaCard.style.padding = '5px';
return;
}

// ✅ 5. Ajuste na função mostrarReceitas() - Aplica o filtro de Favoritos
let receitasFiltradas = obterReceitasOrdenadas();
if (modoFavoritos) {
// Limpa o filtro de categoria ao entrar em Favoritos
categoriaAtual = '';
criarAbasCategorias();

receitasFiltradas = receitasFiltradas.filter(r => r.favorito);
}
// Fim da alteração 5.


if (receitasFiltradas.length === 0) {
lista.innerHTML = `
<div class="empty-state">
<p class="empty-state-text">
${modoFavoritos ? '❤️ Nenhuma receita favorita' : `🥣 Sem receitas na categoria ${categoriaAtual}`}
</p>
</div>`;
stats.textContent = '';
listaCard.style.display = 'block';
listaCard.style.padding = '25px';
return;
}

listaCard.style.display = 'block';
listaCard.style.padding = '15px 25px';

if (modoFavoritos) {
stats.textContent = `Você tem ${receitasFiltradas.length} ${receitasFiltradas.length === 1 ? 'receita' : 'receitas'} nos favoritos ❤️`;
} else {
stats.textContent = `🍛 ${receitasFiltradas.length} ${receitasFiltradas.length === 1 ? 'receita' : 'receitas'} em ${categoriaAtual}`;
}


lista.innerHTML = receitasFiltradas.map((r, i) => {
// Otimização O(1) com mapa
const indexOriginal = mapaIndicesReceitas.get(r);
return `
<div class="receita-linha">
<div class="favorito-star" onclick="toggleFavorito(${indexOriginal})"
style="cursor:pointer; font-size:12px; margin-right:6px;">
${r.favorito ? '❤️' : '🤍'}
</div>
<div class="receita-info">
<a href="#" onclick="abrirLink('${escapeHTML(r.link)}'); return false;" class="receita-nome">${escapeHTML(r.nome)}</a>
</div>
<div class="receita-actions">
<button class="btn-rename" onclick="renomearReceita(${indexOriginal})" title="Renomear">
<i class="fa-solid fa-pen"></i>
</button>
<button class="btn-delete" onclick="excluirReceita(${indexOriginal})" title="Excluir">
<i class="fa-solid fa-trash"></i>
</button>
</div>
</div>
`;
}).join('');
}

function abrirLink(url) {
if (window.cordova && cordova.InAppBrowser) {
// Tenta usar o InAppBrowser com "_system" para URLs externas (http/https)
if (url.startsWith('http')) {
cordova.InAppBrowser.open(url, "_system");
} else {
// Para URIs locais (content://, file://), pode tentar usar o Intent nativo
if (window.plugins?.webintent && window.plugins.webintent.startActivity) {
window.plugins.webintent.startActivity({
action: 'android.intent.action.VIEW',
url: url
}, function() {
console.log('URI local aberta com sucesso via Intent');
}, function(e) {
console.error('Erro ao abrir URI local via Intent:', e);
mostrarMensagem('Não foi possível abrir o arquivo/URI local.', 'erro');
});
} else {
mostrarMensagem('Não foi possível abrir o link. Verifique se é um link local/URI.', 'erro');
}
}
} else {
// Fallback para navegadores web/desenvolvimento
window.open(url, "_system");
// Removido o window.location.href = url como um fallback extra, para evitar navegação
}
}

function excluirReceita(index) {
const receita = receitas[index];

if (!receita) {

mostrarMensagem("Erro: Receita não encontrada para exclusão.", "erro");
return;
}

const overlay = document.createElement('div');
overlay.className = 'custom-modal-overlay';
overlay.style.cssText = `
position: fixed;
top: 0;
left: 0;
width: 100%;
height: 100%;
background: rgba(0,0,0,0.5);
display: flex;
align-items: center;
justify-content: center;
z-index: 10000;
animation: fadeIn 0.3s ease;
`;

const modalContent = document.createElement('div');
modalContent.className = 'custom-modal-content';
modalContent.style.cssText = `
background: white;
padding: 25px;
border-radius: 12px;
text-align: center;
max-width: 80%;
box-shadow: 0 4px 12px rgba(0,0,0,0.15);
animation: slideUp 0.3s ease;
`;

modalContent.innerHTML = `
<p style="font-size: 16px; color: #333; margin-bottom: 20px;">
Deseja excluir a receita "<strong>${escapeHTML(receita.nome)}</strong>"?
</p>
<div style="display: flex; justify-content: center; gap: 12px;">
<button id="btnConfirmar" style="
padding: 8px 16px;
background: #ff7043;
color: white;
border: none;
border-radius: 8px;
font-weight: 600;
">Sim</button>
<button id="btnCancelar" style="
padding: 8px 16px;
background: #e0e0e0;
color: #333;
border: none;
border-radius: 8px;
font-weight: 600;
">Não</button>
</div>
`;

overlay.appendChild(modalContent);
document.body.appendChild(overlay);

document.getElementById('btnCancelar').addEventListener('click', () => {
overlay.remove();
});

document.getElementById('btnConfirmar').addEventListener('click', () => {
const receitaExcluida = receitas.splice(index, 1)[0];
localStorage.setItem('receitas', JSON.stringify(receitas));

invalidarCache();

criarAbasCategorias();
mostrarReceitas();
overlay.remove();
mostrarMensagem(`"${receitaExcluida.nome}" foi excluída com sucesso!`, 'sucesso');
});
}

// Função debounce para busca
const debounce = (func, wait) => {
let timeout;
return function executedFunction(...args) {
const later = () => {
clearTimeout(timeout);
func(...args);
};
clearTimeout(timeout);
timeout = setTimeout(later, wait);
};
};

// Função principal de filtragem
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
// Ao buscar, desativa o modo favoritos
modoFavoritos = false;
if (btnFavoritos) btnFavoritos.textContent = "❤️";

} else {
btnLimpar.style.display = 'none';
campoBusca.classList.remove('busca-ativa');
document.body.classList.remove('modo-busca');
modoBusca = false;
}

mostrarReceitas();
}, 300);

// Função para limpar busca
function limparBusca() {
const campoBusca = document.getElementById('campoBusca');
const btnLimpar = document.getElementById('btnLimparBusca');

if (!campoBusca || !btnLimpar) return;

campoBusca.value = '';
termoBusca = '';
btnLimpar.style.display = 'none';
campoBusca.classList.remove('busca-ativa');
document.body.classList.remove('modo-busca');
modoBusca = false;

campoBusca.blur();

setTimeout(() => {
const container = document.querySelector('.container');
if (container) {
container.focus();
}
}, 10);

mostrarReceitas();
}

// Função para destacar termos na busca
function destacarTexto(texto, termo) {
if (!termo) return escapeHTML(texto);

// Usa escapeHTML no texto completo primeiro para segurança (XSS)
const textoEscapado = escapeHTML(texto);

// Ajustado o termo para usar regex
const termoEscapado = termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const regex = new RegExp(`(${termoEscapado})`, 'gi');

// Realiza o destaque
return textoEscapado.replace(regex, '<span class="highlight">$1</span>');
}

// Função de busca
function buscarReceitas(termo) {
if (!termo) return receitas;

return receitas.filter(receita =>
receita.nome.toLowerCase().includes(termo) ||
receita.categoria.toLowerCase().includes(termo) ||
(receita.link && receita.link.toLowerCase().includes(termo))
);
}

function exportarReceitas() {
    if (receitas.length === 0) {
        mostrarMensagem("Nenhuma receita para exportar.", "erro");
        return;
    }

    const now = new Date();
    const dia = String(now.getDate()).padStart(2, '0');
    const mes = String(now.getMonth() + 1).padStart(2, '0');
    const ano = String(now.getFullYear()).slice(-2);
    const hora = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');

    const fileName = `cookbook${dia}${mes}${ano}${hora}${min}.json`;

    const dadosExportacao = {
        versao: "1.0",
        dataExportacao: new Date().toISOString(),
        totalReceitas: receitas.length,
        receitas: receitas
    };

    const jsonData = JSON.stringify(dadosExportacao, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });

    // Verifica se está no Cordova (Android)
    if (window.cordova && cordova.file) {
        // Método para Android/Cordova
        const directoryPath = cordova.file.externalRootDirectory + "Download/";

        window.resolveLocalFileSystemURL(directoryPath,
            function(dirEntry) {
                salvarArquivo(dirEntry, fileName, blob);
            },
            function(error) {
                window.resolveLocalFileSystemURL(cordova.file.externalRootDirectory,
                    function(rootEntry) {
                        rootEntry.getDirectory("Download", { create: true },
                            function(dirEntry) {
                                salvarArquivo(dirEntry, fileName, blob);
                            },
                            function(error) {
                                mostrarMensagem("Erro ao acessar sistema de arquivos. Verifique as permissões.", "erro");
                            }
                        );
                    },
                    function(error) {
                        mostrarMensagem("Erro no sistema de arquivos. Verifique as permissões.", "erro");
                    }
                );
            }
        );
    } else {
        // Método para PWA/Navegador
        try {
            // Cria um link de download
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            link.style.display = 'none';
            
            document.body.appendChild(link);
            link.click();
            
            // Limpeza
            setTimeout(() => {
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }, 100);
            
            mostrarMensagem(`Arquivo "${fileName}" exportado com sucesso!`, 'sucesso');
        } catch (error) {
            console.error('Erro na exportação:', error);
            mostrarMensagem("Erro ao exportar receitas. Tente novamente.", "erro");
        }
    }
}

function salvarArquivo(dirEntry, fileName, blob) {
dirEntry.getFile(fileName, {
create: true,
exclusive: false
},
function(fileEntry) {
fileEntry.createWriter(
function(fileWriter) {
fileWriter.onwriteend = function() {
showPersistentModal(fileName);
};
fileWriter.onerror = function(e) {
mostrarMensagem("Erro ao exportar receitas", "erro");
};
fileWriter.write(blob);
},
function(error) {
mostrarMensagem("Erro ao exportar receitas", "erro");
}
);
},
function(error) {
mostrarMensagem("Erro ao exportar receitas", "erro");
}
);
}

function importarReceitas() {
const fileInput = document.getElementById('fileInput');
if (fileInput) fileInput.click();
}

function processarImportacao(event) {
const file = event.target.files[0];
if (!file) {
mostrarMensagem("Nenhum arquivo selecionado.", "erro");
return;
}

const reader = new FileReader();
reader.onload = function(e) {
try {
const dados = JSON.parse(e.target.result);
let receitasParaImportar = null;
let importadasComSucesso = 0;
let ignoradasPorDuplicação = 0;

if (dados && typeof dados === 'object' && Array.isArray(dados.receitas)) {
receitasParaImportar = dados.receitas;
} else if (Array.isArray(dados)) {
receitasParaImportar = dados;
}

if (receitasParaImportar) {
const receitasExistentes = JSON.parse(localStorage.getItem('receitas')) || [];

const novasReceitas = receitasParaImportar.map(r => {
const nomeNormalizado = r.nome?.toLowerCase();
const linkNormalizado = r.link?.toLowerCase();

if (!nomeNormalizado || !linkNormalizado) {
ignoradasPorDuplicação++;
return null;
}

const receitaExistente = receitasExistentes.find(existente =>
existente.nome.toLowerCase() === nomeNormalizado && existente.link.toLowerCase() === linkNormalizado
);

if (receitaExistente) {
ignoradasPorDuplicação++;
return null;
}

importadasComSucesso++;
return {
nome: r.nome,
link: r.link,
categoria: r.categoria || 'Especial',
data: r.data || new Date().toISOString(),
favorito: r.favorito === undefined ? false : r.favorito
};
}).filter(r => r !== null);

const todasReceitas = [...receitasExistentes, ...novasReceitas];
localStorage.setItem('receitas', JSON.stringify(todasReceitas));
receitas = todasReceitas;

invalidarCache();

criarAbasCategorias();
mostrarReceitas();

mostrarMensagem(`Importação concluída: ${importadasComSucesso} adicionada(s), ${ignoradasPorDuplicação} ignorada(s) por duplicação.`, 'sucesso');

} else {
mostrarMensagem("Arquivo inválido. O formato deve ser um array ou um objeto com a chave 'receitas'.", "erro");
}
} catch (err) {
mostrarMensagem("Erro ao importar. Verifique o arquivo.", "erro");
}
event.target.value = '';
};
reader.readAsText(file);
}

function renomearReceita(index) {
const receita = receitas[index];
if (!receita) return;

const overlay = document.createElement('div');
overlay.className = 'custom-modal-overlay';
overlay.style.cssText = `
position: fixed;
top: 0;
left: 0;
width: 100%;
height: 100%;
background: rgba(0,0,0,0.5);
display: flex;
align-items: center;
justify-content: center;
z-index: 10000;
animation: fadeIn 0.3s ease;
`;

const modalContent = document.createElement('div');
modalContent.className = 'custom-modal-content';
modalContent.style.cssText = `
background: #fff;
padding: 25px 30px;
border-radius: 14px;
text-align: center;
max-width: 85%;
box-shadow: 0 6px 18px rgba(0,0,0,0.25);
animation: slideUp 0.3s ease;
`;

modalContent.innerHTML = `
<p style="color: #444; font-size: 14px; margin-bottom: 12px;">
Renomear receita "<strong>${escapeHTML(receita.nome)}</strong>" para:
</p>
<input type="text" id="novoNomeReceita"
value="${escapeHTML(receita.nome)}"
style="width: 90%; padding: 8px 10px; border-radius: 8px; border: 1px solid #ccc; outline: none; font-size: 15px; color: #333;">
<div style="display: flex; justify: center; gap: 12px; margin-top: 20px;">
<button id="btnSalvarNome" style="
padding: 8px 16px;
background: #6a4c93;
color: white;
border: none;
border-radius: 8px;
font-weight: 600;
">Salvar</button>
<button id="btnCancelarNome" style="
padding: 8px 16px;
background: #e0e0e0;
color: #333;
border: none;
border-radius: 8px;
font-weight: 600;
">Cancelar</button>
</div>
`;

overlay.appendChild(modalContent);
document.body.appendChild(overlay);

const input = document.getElementById('novoNomeReceita');
input.focus();
input.setSelectionRange(0, input.value.length);

const fecharModal = () => overlay.remove();

document.getElementById('btnCancelarNome').addEventListener('click', fecharModal);

document.getElementById('btnSalvarNome').addEventListener('click', () => {
const novoNome = input.value.trim();
if (!novoNome) {
mostrarMensagem('O nome não pode estar em branco!', 'erro');
return;
}

const jaExiste = receitas.some((r, i) =>
i !== index && r.nome.toLowerCase() === novoNome.toLowerCase()
);

if (jaExiste) {
mostrarMensagem('Já existe uma receita com esse nome!', 'erro');
return;
}

receita.nome = novoNome;
localStorage.setItem('receitas', JSON.stringify(receitas));

invalidarCache();
criarAbasCategorias();
mostrarReceitas();

fecharModal();
mostrarMensagem('Receita renomeada com sucesso!', 'sucesso');
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
overlay.className = 'custom-modal-overlay';
overlay.style.cssText = `
position: fixed;
top: 0;
left: 0;
width: 100%;
height: 100%;
background: rgba(0,0,0,0.5);
display: flex;
align-items: center;
justify-content: center;
z-index: 10000;
animation: fadeIn 0.3s ease;
`;

const modalContent = document.createElement('div');
modalContent.className = 'custom-modal-content';
modalContent.style.cssText = `
background: white;
padding: 25px;
border-radius: 12px;
text-align: center;
max-width: 80%;
box-shadow: 0 4px 12px rgba(0,0,0,0.15);
animation: slideUp 0.3s ease;
`;
modalContent.innerHTML = `
<p style="font-size: 13px; line-height: 1.4;">
Receitas exportadas para a pasta Downloads como:
<br><br>
<span style="color: #8d6e63; font-weight: 600;">${fileName}</span>
<br><br>
<span style="color: #5d4037; font-size: 12px;">💾 Salve este arquivo em local seguro para importar depois</span>
</p>
<div style="text-align: center; margin-top: 16px;">
<button id="btnFecharModal" style="padding: 8px 16px; font-size: 14px; font-weight: 600; color: #6a4c93; background: #f3e5f5; border: 1px solid #ce93d8; border-radius: 8px;">OK</button>
</div>
`;

overlay.appendChild(modalContent);
document.body.appendChild(overlay);

document.getElementById('btnFecharModal').addEventListener('click', () => {
overlay.remove();
});
}

// ========== COMPARTILHAMENTO PWA ==========
// Capturar dados quando o PWA for aberto via compartilhamento
function capturarCompartilhamentoPWA() {
    const urlParams = new URLSearchParams(window.location.search);
    const title = urlParams.get('title');
    const text = urlParams.get('text');
    const sharedUrl = urlParams.get('url');
    
    let conteudo = title || text || sharedUrl || '';
    
    if (conteudo) {
        // Pequeno delay para garantir que a página carregou
        setTimeout(() => {
            const nomeReceita = extrairNomeReceita(conteudo);
            const linkReceita = extrairLink(conteudo) || sharedUrl || '';
            
            if (nomeReceita) {
                document.getElementById('nomeReceita').value = nomeReceita;
            }
            if (linkReceita) {
                document.getElementById('linkReceita').value = linkReceita;
            }
            
            if (nomeReceita || linkReceita) {
                destacarCamposPreenchidos();
                mostrarMensagem('Link detectado! Dê um nome para sua receita e selecione a categoria.', 'sucesso');
            }
        }, 500);
    }
}

// Chamar a função quando a página carregar (JÁ EXISTE UM DOMContentLoaded, então adicionamos dentro dele)
// Em vez de criar outro, vamos modificar o existente
// ✅ 3. Função para marcar/desmarcar favorito
function toggleFavorito(index) {
const receita = receitas[index];
if (!receita) return;

receita.favorito = !receita.favorito;

localStorage.setItem('receitas', JSON.stringify(receitas));

// 🔥 NOVO: se virou favorito, ativa aba Favoritos
if (receita.favorito) {
modoFavoritos = true;
categoriaAtual = '';
document.getElementById("btnFavoritos").textContent = "❤️";
}

mostrarReceitas();
}

// ✅ 4. Função para ativar/desativar o modo favoritos (botão novo)
function toggleFavoritos() {
// Força favoritos a ligar SEMPRE
modoFavoritos = true;   

const btn = document.getElementById("btnFavoritos");

categoriaAtual = '';
criarAbasCategorias();

btn.textContent = "❤️"; // Sempre igual

mostrarReceitas();
}

// Adicionar atalho de teclado (ESC para limpar busca) - SEMPRE ATIVO
document.addEventListener('keydown', function(e) {
if (e.key === 'Escape' && modoBusca) {
limparBusca();
}
});

// Adicionar estilos CSS para as animações
const style = document.createElement('style');
style.textContent = `
@keyframes fadeIn {
from { opacity: 0; }
to { opacity: 1; }
}

@keyframes slideUp {
from { transform: translateY(20px); opacity: 0; }
to { transform: translateY(0); opacity: 1; }
}

@keyframes slideInRight {
from { transform: translateX(100%); opacity: 0; }
to { transform: translateX(0); opacity: 1; }
}

@keyframes slideOutRight {
from { transform: translateX(0); opacity: 1; }
to { transform: translateX(100%); opacity: 0; }
}

.custom-modal-overlay.hide {
opacity: 0;
transition: opacity 0.3s ease;
}

.custom-modal-content {
transition: transform 0.3s ease;
}

.custom-message {
pointer-events: none;
}

/* Adicionado para garantir que a estrela e o nome fiquem na mesma linha */
.receita-linha {
display: flex;
align-items: center;
}
 
.receita-info {
flex-grow: 1;
display: flex; /* Adicionado para nome e categoria ficarem flexíveis */
flex-direction: column; /* Organiza nome e categoria verticalmente */
}
`;
document.head.appendChild(style);
