// ==UserScript==
// @name         Captura Automática de Aulas HTML - Alura
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Captura automaticamente todas as aulas de texto de um curso em uma única aba
// @match        *://cursos.alura.com.br/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    if (!window.location.hostname.includes('cursos.alura.com.br')) {
        return;
    }

    const STORAGE_KEY = 'alura_auto_capture_state_v1';
    const DELAY_ENTRE_AULAS = 3000;
    const DELAY_CARREGAMENTO_INICIAL = 3000;
    const DELAY_APOS_SALVAR = 2500;
    const MAX_TENTATIVAS = 3;
    const TIMEOUT_CONTEUDO = 10000; // 10 segundos para aguardar conteúdo

    // ========== GERENCIAMENTO DE ESTADO ==========
    function getEstado() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        } catch (e) {
            return null;
        }
    }

    function salvarEstado(estado) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(estado));
    }

    function limparEstado() {
        localStorage.removeItem(STORAGE_KEY);
    }

    function isAutoMode() {
        const estado = getEstado();
        return estado && estado.ativo;
    }

    // ========== DETECÇÃO DE PÁGINA ==========
    function ehPaginaDeAula() {
        return window.location.href.includes('/task/');
    }

    function ehPaginaDoCurso() {
        return window.location.href.includes('/course/') ||
               window.location.href.includes('/classpage/');
    }

    // ========== COLETA DE URLs ==========
    function coletarURLsAulasTexto() {
        const todasAulas = document.querySelectorAll('div[data-section-id] a[href*="/task/"]');
        const urls = [];
        const urlsVistas = new Set();

        todasAulas.forEach(aula => {
            const temDuracao = aula.querySelector('.text-xs.font-jetbrains-mono');

            if (!temDuracao) {
                const href = aula.getAttribute('href');
                const urlCompleta = window.location.origin + href;

                if (!urlsVistas.has(urlCompleta)) {
                    urlsVistas.add(urlCompleta);
                    const nomeAula = aula.querySelector('.text-sm.text-balance')?.innerText.trim() || 'Aula';

                    urls.push({
                        url: urlCompleta,
                        nome: nomeAula
                    });
                }
            }
        });

        return urls;
    }

    // ========== VERIFICAÇÃO DE CONTEÚDO ==========
    function aguardarConteudo() {
        return new Promise((resolve, reject) => {
            let tentativas = 0;
            const maxTentativas = TIMEOUT_CONTEUDO / 500; // Verifica a cada 500ms

            const verificar = () => {
                tentativas++;

                // Verifica se o conteúdo principal está presente
                const section = document.querySelector('section[aria-label="Conteúdo da aula"]');
                const temConteudo = section && section.innerText.trim().length > 50;

                if (temConteudo) {
                    console.log(`[Auto-Capture] ✅ Conteúdo carregado (tentativa ${tentativas})`);
                    resolve(true);
                    return;
                }

                if (tentativas >= maxTentativas) {
                    console.error(`[Auto-Capture] ❌ Timeout aguardando conteúdo`);
                    reject(new Error('Timeout aguardando conteúdo'));
                    return;
                }

                // Continua verificando
                setTimeout(verificar, 500);
            };

            verificar();
        });
    }

    // ========== PROCESSAMENTO AUTOMÁTICO ==========
    async function processarAulaAutomatica() {
        const estado = getEstado();
        if (!estado || !estado.ativo) return;

        const aulaAtual = estado.indiceAtual + 1;
        const totalAulas = estado.urls.length;

        console.log(`[Auto-Capture] 📖 Processando aula ${aulaAtual}/${totalAulas}`);

        try {
            // Aguarda o conteúdo carregar completamente
            await aguardarConteudo();

            // Aguarda um pouco mais para garantir que tudo está renderizado
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Verifica se tem vídeo
            if (verificarVideo()) {
                console.log('[Auto-Capture] ⏭️ Aula com vídeo, pulando...');
                estado.estatisticas.ignorado++;
                salvarEstado(estado);
                avancarParaProxima();
                return;
            }

            // Tenta salvar com retry
            let salvou = false;
            let tentativas = 0;

            while (!salvou && tentativas < MAX_TENTATIVAS) {
                tentativas++;
                console.log(`[Auto-Capture] Tentativa ${tentativas}/${MAX_TENTATIVAS} de salvar...`);

                try {
                    const nomeArquivo = extrairNomeArquivo();
                    const conteudoLimpo = obterConteudoLimpo();

                    if (!conteudoLimpo) {
                        throw new Error('Não foi possível extrair conteúdo');
                    }

                    const htmlCompleto = gerarHTMLCompleto(conteudoLimpo, nomeArquivo);
                    baixarHTML(htmlCompleto, nomeArquivo);

                    estado.estatisticas.sucesso++;
                    salvarEstado(estado);
                    console.log(`[Auto-Capture] ✅ Aula salva: ${nomeArquivo}`);
                    salvou = true;

                } catch (e) {
                    console.error(`[Auto-Capture] ❌ Erro na tentativa ${tentativas}:`, e);

                    if (tentativas < MAX_TENTATIVAS) {
                        console.log(`[Auto-Capture] 🔄 Aguardando 2s antes de tentar novamente...`);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
            }

            if (!salvou) {
                console.error(`[Auto-Capture] ❌ Falha após ${MAX_TENTATIVAS} tentativas`);
                estado.estatisticas.erro++;
                salvarEstado(estado);
            }

            // Aguarda o download iniciar e avança
            setTimeout(() => {
                avancarParaProxima();
            }, DELAY_APOS_SALVAR);

        } catch (e) {
            console.error('[Auto-Capture] ❌ Erro ao processar aula:', e);
            estado.estatisticas.erro++;
            salvarEstado(estado);
            avancarParaProxima();
        }
    }

    function avancarParaProxima() {
        const estado = getEstado();
        if (!estado) return;

        estado.indiceAtual++;
        salvarEstado(estado);

        if (estado.indiceAtual >= estado.urls.length) {
            finalizarCaptura();
            return;
        }

        const proximaURL = estado.urls[estado.indiceAtual].url;
        console.log(`[Auto-Capture] ➡️ Navegando para próxima aula...`);

        setTimeout(() => {
            window.location.href = proximaURL;
        }, DELAY_ENTRE_AULAS);
    }

    function finalizarCaptura() {
        const estado = getEstado();
        if (!estado) return;

        estado.ativo = false;
        salvarEstado(estado);

        setTimeout(() => {
            const mensagem = `
✅ Captura Concluída!

📊 Estatísticas:
• Aulas salvas com sucesso: ${estado.estatisticas.sucesso}
• Aulas ignoradas (vídeo): ${estado.estatisticas.ignorado}
• Aulas com erro: ${estado.estatisticas.erro}
• Total processado: ${estado.urls.length}

O estado da automação foi limpo.
            `.trim();

            alert(mensagem);
            console.log('[Auto-Capture]', mensagem);

            setTimeout(() => {
                limparEstado();
                atualizarPainel();
            }, 5000);
        }, 1000);
    }

    // ========== FUNÇÕES DE SALVAMENTO ==========
    function verificarVideo() {
        return document.querySelector('video') ||
               document.querySelector('.video-js') ||
               document.querySelector('[class*="video-player"]');
    }

function extrairNomeArquivo() {
    try {
        const pathAtual = window.location.pathname;
        const linkAulaAtual = document.querySelector(`a[href="${pathAtual}"]`);

        if (linkAulaAtual) {
            const secaoAtual = linkAulaAtual.closest('div[data-section-id]');

            if (secaoAtual) {
                // Pega o texto do título da seção/módulo
                const textoSecao = secaoAtual.querySelector('button div.flex.items-center.gap-1')?.innerText.trim();

                // Regex atualizado para aceitar tanto "Seção 01" quanto "Aula 01"
                const matchSecao = textoSecao?.match(/(?:Se[cç][aã]o|Aula)\s*(\d+)/i);
                const numeroSecao = matchSecao ? matchSecao[1].padStart(2, '0') : '00';

                // Pega o nome da aula e formata o número (ex: 2. -> 02.)
                const textoAula = linkAulaAtual.querySelector('span.text-sm.text-balance')?.innerText.trim();
                let nomeAulaFormatado = textoAula || 'Aula';

                const matchAula = nomeAulaFormatado.match(/^(\d+)\.(.*)$/);
                if (matchAula) {
                    nomeAulaFormatado = `${matchAula[1].padStart(2, '0')}.${matchAula[2]}`;
                }

                // Monta o nome final: 01-03. Para saber mais_ Corrotinas.html
                const nomeArquivo = `${numeroSecao}-${nomeAulaFormatado}`;
                return nomeArquivo.replace(/[\\/:"*?<>|]+/g, '_').trim() + '.html';
            }
        }
    } catch (e) {
        console.error('[Gerar HTML] Erro ao extrair nome do arquivo:', e);
    }

    // Fallback usando título da página
    const tituloOriginal = document.title;
    const match = tituloOriginal.match(/>\s*(.*?)\s*\|/);
    if (match && match[1]) {
        return match[1].trim().replace(/[\\/:"*?<>|]+/g, '_') + '.html';
    }
    return "Atividade_Alura.html";
}

    function extrairTituloH3() {
        const h2 = document.querySelector('section[aria-label="Conteúdo da aula"] h2');
        if (h2) return h2.innerText.trim();
        const match = document.title.match(/>\s*(.*?)\s*\|/);
        if (match && match[1]) return match[1].trim();
        return "Conteúdo da atividade";
    }

    function obterConteudoLimpo() {
        const section = document.querySelector('section[aria-label="Conteúdo da aula"]');
        if (!section) {
            console.error('[Auto-Capture] Section não encontrada');
            return null;
        }

        // Verifica se tem conteúdo real
        if (section.innerText.trim().length < 50) {
            console.error('[Auto-Capture] Conteúdo muito curto ou vazio');
            return null;
        }

        const clone = section.cloneNode(true);

        const uls = clone.querySelectorAll('ul');
        uls.forEach(ul => {
            const botoes = ul.querySelectorAll(':scope > li > button');
            if (botoes.length > 1) {
                const novoUl = document.createElement('ul');
                novoUl.className = 'alternativas-list';

                botoes.forEach(btn => {
                    let letra = '';
                    const letraCandidates = btn.querySelectorAll('div');
                    for (let div of letraCandidates) {
                        const txt = div.innerText.trim();
                        if (txt.length === 1 && /^[A-E]$/.test(txt)) {
                            letra = txt;
                            break;
                        }
                    }

                    let conteudoHTML = '';
                    const mainDivs = btn.querySelectorAll(':scope > div');
                    if (mainDivs.length >= 2) {
                        const conteudoWrapper = mainDivs[1].querySelector('div');
                        if (conteudoWrapper) {
                            conteudoHTML = conteudoWrapper.innerHTML;
                        } else {
                            conteudoHTML = mainDivs[1].innerHTML;
                        }
                    }

                    const li = document.createElement('li');
                    li.className = 'alternativa-item';
                    li.innerHTML = `
                        <div class="alternativa-letra">${letra}</div>
                        <div class="alternativa-conteudo">${conteudoHTML}</div>
                    `;
                    novoUl.appendChild(li);
                });

                ul.replaceWith(novoUl);
            }
        });

        const h2 = clone.querySelector('h2');
        if (h2) {
            const headerContainer = h2.closest('div.flex');
            if (headerContainer) headerContainer.remove();
        }

        const bottomActions = clone.querySelector('div.my-5.flex.flex-col.justify-end');
        if (bottomActions) bottomActions.remove();

        clone.querySelectorAll('button').forEach(btn => {
            const isCopyBtn = btn.getAttribute('title') === 'Copiar' || btn.getAttribute('aria-label') === 'Copiar';
            if (!isCopyBtn) {
                btn.remove();
            }
        });

        clone.querySelectorAll('#task-content-extra-action-slot, #task-content-title-action-slot').forEach(el => el.remove());

        const textoH3 = extrairTituloH3();
        const novoTitulo = document.createElement('h3');
        novoTitulo.textContent = textoH3;
        novoTitulo.style.cssText = 'color:#2A7AE4; margin:0 0 20px 0; font-size:24px; border-left:4px solid #EE0F0F; padding-left:12px; font-weight:bold;';
        clone.insertBefore(novoTitulo, clone.firstChild);

        return clone;
    }

    function gerarHTMLCompleto(conteudoLimpo, nomeArquivo) {
        const estilos = `
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&display=swap');
                * { margin:0; padding:0; box-sizing:border-box; }
                body {
                    font-family: 'Google Sans', 'Product Sans', 'Roboto', 'Segoe UI', sans-serif;
                    line-height: 1.6;
                    background: white;
                    padding: 30px 20px;
                    color: #111;
                }
                .container { max-width: 900px; margin: 0 auto; font-size: 16px; }
                .formattedText p { margin: 1em 0; font-size: 18px; line-height: 1.6; }
                .formattedText h1, .formattedText h2, .formattedText h3, .formattedText h4 {
                    margin-top: 1.5em;
                    margin-bottom: 0.5em;
                    font-weight: 500;
                }
                .formattedText a { color: #2A7AE4; text-decoration: underline; }
                .formattedText strong { font-weight: bold; }
                .formattedText pre {
                    background: #f6f8fa;
                    border: 1px solid #d0d7de;
                    border-radius: 6px;
                    padding: 16px;
                    overflow-x: auto;
                    font-family: 'JetBrains Mono', 'Courier New', monospace;
                    font-size: 14px;
                    page-break-inside: avoid;
                    position: relative;
                    margin: 1.5em 0;
                    color: #24292f;
                }
                .formattedText code {
                    font-family: 'JetBrains Mono', 'Courier New', monospace;
                    background: #f6f8fa;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 14px;
                    color: #24292f;
                }
                .formattedText pre code {
                    background: transparent;
                    padding: 0;
                }
                .formattedText img { max-width: 100%; height: auto; margin: 20px auto; border-radius: 8px; }
                .formattedText blockquote {
                    border-left: 4px solid #2A7AE4;
                    padding-left: 15px;
                    margin: 1em 0;
                    color: #555;
                }
                button[title="Copiar"], button[aria-label="Copiar"] {
                    background: #2A7AE4;
                    color: white;
                    border: none;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    margin-top: 8px;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                }
                button[title="Copiar"]:hover, button[aria-label="Copiar"]:hover { background: #1e5eb9; }
                button[title="Copiar"] svg, button[aria-label="Copiar"] svg { display: none; }

                .alternativas-list {
                    list-style-type: none;
                    padding: 0;
                    margin: 1.5em 0;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                .alternativa-item {
                    display: flex;
                    border: 1px solid #d0d7de;
                    border-radius: 8px;
                    overflow: hidden;
                    background: #fff;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                    border-left: 6px solid #2A7AE4;
                    page-break-inside: avoid;
                }
                .alternativa-letra {
                    background: #f6f8fa;
                    color: #2A7AE4;
                    font-weight: bold;
                    font-size: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 60px;
                    padding: 16px;
                    border-right: 1px solid #d0d7de;
                    font-family: 'Google Sans', sans-serif;
                }
                .alternativa-conteudo {
                    padding: 16px 20px;
                    flex: 1;
                    font-size: 16px;
                    line-height: 1.6;
                    color: #24292f;
                }
                .alternativa-conteudo p {
                    margin: 0.8em 0;
                }
                .alternativa-conteudo p:first-child {
                    margin-top: 0;
                }
                .alternativa-conteudo p:last-child {
                    margin-bottom: 0;
                }
            </style>
        `;

        const scriptCopiar = `
            <script>
                document.addEventListener('DOMContentLoaded', function() {
                    const botoes = document.querySelectorAll('button[title="Copiar"], button[aria-label="Copiar"]');
                    botoes.forEach(botao => {
                        botao.addEventListener('click', function(e) {
                            e.preventDefault();
                            const wrapper = this.closest('.relative') || this.parentElement;
                            let pre = wrapper.querySelector('pre');
                            if (!pre) pre = this.closest('div').querySelector('pre');

                            if (pre) {
                                const code = pre.querySelector('code');
                                const texto = code ? code.innerText : pre.innerText;
                                navigator.clipboard.writeText(texto).then(() => {
                                    const span = this.querySelector('span');
                                    if (span) {
                                        const originalText = span.innerText;
                                        span.innerText = '✓ Copiado!';
                                        setTimeout(() => { span.innerText = originalText; }, 1500);
                                    } else {
                                        const originalText = this.innerText;
                                        this.innerText = '✓ Copiado!';
                                        setTimeout(() => { this.innerText = originalText; }, 1500);
                                    }
                                }).catch(err => console.error('Erro ao copiar:', err));
                            }
                        });
                    });
                });
            <\/script>
        `;

        conteudoLimpo.classList.add('formattedText');

        return `<!DOCTYPE html>
        <html lang="pt-BR">
        <head><meta charset="UTF-8"><title>${nomeArquivo.replace('.html', '')}</title>${estilos}</head>
        <body><div class="container">${conteudoLimpo.outerHTML}</div>${scriptCopiar}</body>
        </html>`;
    }

    function baixarHTML(htmlString, nomeArquivo) {
        const blob = new Blob([htmlString], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ========== PAINEL DE CONTROLE ==========
    function criarPainel() {
        if (document.getElementById('painel-auto-capture')) return;

        const painel = document.createElement('div');
        painel.id = 'painel-auto-capture';
        painel.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: white;
            border: 2px solid #2A7AE4;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.15);
            z-index: 999999;
            font-family: 'Google Sans', 'Roboto', sans-serif;
            min-width: 320px;
            max-width: 400px;
        `;

        painel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; color: #2A7AE4; font-size: 18px; font-weight: bold;">
                    📥 Captura Automática
                </h3>
                <button id="fechar-painel" style="
                    background: none;
                    border: none;
                    font-size: 24px;
                    cursor: pointer;
                    color: #666;
                    padding: 0;
                    width: 28px;
                    height: 28px;
                    line-height: 1;
                ">×</button>
            </div>

            <div id="conteudo-painel"></div>
        `;

        document.body.appendChild(painel);

        document.getElementById('fechar-painel').onclick = () => {
            painel.style.display = 'none';
        };

        atualizarPainel();
    }

    function atualizarPainel() {
        const estado = getEstado();
        const painel = document.getElementById('painel-auto-capture');
        if (!painel) return;

        const conteudo = document.getElementById('conteudo-painel');
        if (!conteudo) return;

        if (estado && estado.ativo) {
            const progresso = ((estado.indiceAtual + 1) / estado.urls.length * 100).toFixed(1);
            conteudo.innerHTML = `
                <div style="margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="font-size: 14px; color: #666;">Progresso:</span>
                        <span style="font-size: 14px; font-weight: bold; color: #2A7AE4;">
                            ${estado.indiceAtual + 1}/${estado.urls.length}
                        </span>
                    </div>
                    <div style="background: #f6f8fa; border-radius: 4px; overflow: hidden; height: 20px;">
                        <div style="background: #2A7AE4; height: 100%; width: ${progresso}%; transition: width 0.3s;"></div>
                    </div>
                </div>

                <div style="background: #f0f9ff; padding: 12px; border-radius: 6px; margin-bottom: 16px; font-size: 13px;">
                    <div style="color: #0369a1; margin-bottom: 4px;">✅ Sucesso: ${estado.estatisticas.sucesso}</div>
                    <div style="color: #0369a1; margin-bottom: 4px;">⏭️ Ignoradas: ${estado.estatisticas.ignorado}</div>
                    <div style="color: #0369a1;">❌ Erros: ${estado.estatisticas.erro}</div>
                </div>

                <button id="parar-captura" style="
                    width: 100%;
                    background: #EE0F0F;
                    color: white;
                    border: none;
                    padding: 12px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: bold;
                    transition: background 0.2s;
                ">⏸️ Parar Captura</button>
            `;

            document.getElementById('parar-captura').onclick = () => {
                if (confirm('Deseja parar a captura?')) {
                    estado.ativo = false;
                    salvarEstado(estado);
                    alert('⏸️ Captura parada. Você pode retomar depois.');
                    atualizarPainel();
                }
            };
        } else {
            conteudo.innerHTML = `
                <p style="color: #666; font-size: 14px; margin-bottom: 16px;">
                    Clique em "Iniciar Captura" para salvar automaticamente todas as aulas de texto deste curso.
                </p>

                <button id="iniciar-captura" style="
                    width: 100%;
                    background: #2A7AE4;
                    color: white;
                    border: none;
                    padding: 12px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: bold;
                    transition: background 0.2s;
                    margin-bottom: 8px;
                ">🚀 Iniciar Captura</button>

                <button id="limpar-estado" style="
                    width: 100%;
                    background: #f6f8fa;
                    color: #666;
                    border: 1px solid #d0d7de;
                    padding: 8px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: background 0.2s;
                ">🗑️ Limpar Estado (se travou)</button>
            `;

            document.getElementById('iniciar-captura').onclick = () => {
                iniciarCaptura();
            };

            document.getElementById('limpar-estado').onclick = () => {
                if (confirm('Deseja limpar o estado da automação? Use isso se a automação travou.')) {
                    limparEstado();
                    alert('✅ Estado limpo com sucesso!');
                    atualizarPainel();
                }
            };
        }
    }

    function iniciarCaptura() {
        const urls = coletarURLsAulasTexto();

        if (urls.length === 0) {
            alert('❌ Nenhuma aula de texto encontrada!\n\nVerifique se o menu lateral do curso está visível.');
            return;
        }

        const confirmar = confirm(
            `📚 Captura Automática\n\n` +
            `Foram encontradas ${urls.length} aulas de texto.\n\n` +
            `Aulas de vídeo serão ignoradas automaticamente.\n\n` +
            `Deseja iniciar a captura?`
        );

        if (!confirmar) return;

        const estado = {
            urls: urls,
            indiceAtual: 0,
            ativo: true,
            estatisticas: {
                sucesso: 0,
                erro: 0,
                ignorado: 0
            },
            dataInicio: new Date().toISOString()
        };

        salvarEstado(estado);

        alert(
            `✅ Captura iniciada!\n\n` +
            `A automação começará em 3 segundos.\n\n` +
            `⚠️ IMPORTANTE:\n` +
            `• Não feche esta aba\n` +
            `• Você pode usar outras abas normalmente\n` +
            `• Os arquivos serão salvos na pasta de downloads\n\n` +
            `Total de aulas: ${urls.length}`
        );

        setTimeout(() => {
            window.location.href = urls[0].url;
        }, 3000);
    }

    // ========== INICIALIZAÇÃO ==========
    function inicializar() {
        if (!ehPaginaDoCurso()) return;

        if (isAutoMode() && ehPaginaDeAula()) {
            console.log('[Auto-Capture] 🤖 Modo automação detectado, processando aula...');
            criarPainel();
            atualizarPainel();
            processarAulaAutomatica();
            return;
        }

        setTimeout(() => {
            criarPainel();
            atualizarPainel();
        }, 2000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializar);
    } else {
        inicializar();
    }

    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            setTimeout(inicializar, 1000);
        }
    }).observe(document, { subtree: true, childList: true });

})();