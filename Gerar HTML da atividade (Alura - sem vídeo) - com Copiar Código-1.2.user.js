// ==UserScript==
// @name         Gerar HTML da atividade (Alura - sem vídeo) - com Copiar Código
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Adiciona botão vermelho para gerar arquivo HTML com conteúdo limpo, fonte Google Sans e botões "Copiar código" funcionais.
// @author       Você
// @match        *://cursos.alura.com.br/course/*/task/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Verifica se há player de vídeo (se sim, não adiciona botão)
    if (document.getElementById('video-player')) {
        console.log('[Gerar HTML] Página com vídeo. Botão não adicionado.');
        return;
    }

    // ---------- Funções de extração ----------
    function extrairNomeArquivo() {
        const tituloOriginal = document.title;
        const regex = /(Aula\s*\d+.*?)(?=\s*\|)/i;
        const match = tituloOriginal.match(regex);
        if (match && match[1]) {
            return match[1].trim().replace(/[\\/:"*?<>|]+/g, '_') + '.html';
        }
        return "Atividade_Alura.html";
    }

    function extrairTituloH3() {
        const span = document.querySelector('.task-body-header-title-text');
        if (span) return span.innerText.trim();
        const h1 = document.querySelector('h1.task-body-header-title');
        return h1 ? h1.innerText.trim() : "Conteúdo da atividade";
    }

    // ---------- Limpeza e montagem do conteúdo ----------
    function obterConteudoLimpo() {
        const wrapper = document.querySelector('.task-body__wrapper');
        const main = document.querySelector('.task-body-main');
        let clone;
        if (wrapper) clone = wrapper.cloneNode(true);
        else if (main) clone = main.cloneNode(true);
        else return null;

        // Remove elementos indesejados
        const seletores = [
            '.task-body-alert', '.task-actions-button', '.task-actions-button-next',
            '.task-submit', '.bootcamp-primary-button-theme', '.task-actions',
            '.settings-button', '.settings-box', '#MENU_SETTINGS', '.task-body-header-actions',
            '#menu-button-header', '.chatbot-suggestion-by-selection-section',
            'section.task-actions', '.theater-video.settings', '.settings-button-icon'
        ];
        seletores.forEach(sel => clone.querySelectorAll(sel).forEach(el => el.remove()));

        // Remove h1 original
        const h1Original = clone.querySelector('h1.task-body-header-title');
        if (h1Original) h1Original.remove();

        // Adiciona título H3 no topo
        const textoH3 = extrairTituloH3();
        const novoTitulo = document.createElement('h3');
        novoTitulo.textContent = textoH3;
        novoTitulo.style.cssText = 'color:#2A7AE4; margin:0 0 20px 0; font-size:20px; border-left:4px solid #EE0F0F; padding-left:12px;';
        clone.insertBefore(novoTitulo, clone.firstChild);

        return clone;
    }

    // ---------- Geração do HTML completo com script para copiar código ----------
    function gerarHTMLCompleto(conteudoLimpo, nomeArquivo) {
        // Coleta links CSS originais (opcional)
        const linksCSS = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
            .map(link => link.href)
            .filter(href => href && (href.includes('alura') || href.includes('gnarus') || href.includes('bootcamp')));

        const estilos = `
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&display=swap');
                * { margin:0; padding:0; box-sizing:border-box; }
                body {
                    font-family: 'Google Sans', 'Product Sans', 'Roboto', 'Segoe UI', sans-serif;
                    line-height: 1.6;
                    background: white;
                    padding: 30px 20px;
                    color: #000;
                }
                .container { max-width: 1200px; margin: 0 auto; }
                .formattedText { font-size: 14pt; }
                .formattedText p { margin: 1em 0; }
                .formattedText h1, .formattedText h2, .formattedText h3, .formattedText h4 {
                    margin-top: 1.5em;
                    margin-bottom: 0.5em;
                    font-weight: 500;
                }
                .formattedText pre {
                    background: #f5f5f5;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    padding: 12px;
                    overflow-x: auto;
                    font-family: 'Courier New', monospace;
                    font-size: 12pt;
                    page-break-inside: avoid;
                    position: relative;
                }
                .formattedText code {
                    font-family: 'Courier New', monospace;
                    background: #f5f5f5;
                    padding: 2px 4px;
                    border-radius: 3px;
                }
                .formattedText img { max-width: 100%; height: auto; margin: 20px auto; }
                .formattedText blockquote {
                    border-left: 4px solid #2A7AE4;
                    padding-left: 15px;
                    margin: 1em 0;
                    color: #555;
                }
                button.clipit {
                    background: #2A7AE4;
                    color: white;
                    border: none;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    margin-top: 8px;
                    display: inline-block;
                }
                button.clipit:hover { background: #1e5eb9; }
                .code-wrapper {
                    position: relative;
                }
            </style>
        `;

        const scriptCopiar = `
            <script>
                // Habilita todos os botões "Copiar código"
                document.addEventListener('DOMContentLoaded', function() {
                    const botoes = document.querySelectorAll('button.clipit');
                    botoes.forEach(botao => {
                        botao.addEventListener('click', function(e) {
                            e.preventDefault();
                            // Encontra o bloco <pre> mais próximo (pode ser irmão ou anterior)
                            let pre = this.closest('pre');
                            if (!pre) {
                                // Tenta encontrar o <pre> anterior a este botão
                                pre = this.previousElementSibling;
                                while (pre && pre.tagName !== 'PRE') pre = pre.previousElementSibling;
                            }
                            if (pre) {
                                const code = pre.querySelector('code');
                                const texto = code ? code.innerText : pre.innerText;
                                navigator.clipboard.writeText(texto).then(() => {
                                    const originalText = this.innerText;
                                    this.innerText = '✓ Copiado!';
                                    setTimeout(() => { this.innerText = originalText; }, 1500);
                                }).catch(err => console.error('Erro ao copiar:', err));
                            }
                        });
                    });
                });
            <\/script>
        `;

        const linksHtml = linksCSS.map(href => `<link rel="stylesheet" href="${href}">`).join('\n');

        return `<!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>${nomeArquivo.replace('.html', '')}</title>${linksHtml}${estilos}</head>
        <body><div class="container">${conteudoLimpo.outerHTML}</div>${scriptCopiar}</body>
        </html>`;
    }

    // ---------- Download do arquivo HTML ----------
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

    // ---------- Função principal chamada pelo botão ----------
    function gerarHTML() {
        console.log('Gerando arquivo HTML...');
        const nomeArquivo = extrairNomeArquivo();
        console.log(`Nome do arquivo: ${nomeArquivo}`);
        const conteudoLimpo = obterConteudoLimpo();
        if (!conteudoLimpo) {
            alert('Não foi possível extrair o conteúdo.');
            return;
        }
        const htmlCompleto = gerarHTMLCompleto(conteudoLimpo, nomeArquivo);
        baixarHTML(htmlCompleto, nomeArquivo);
    }

    // ---------- Adiciona botão vermelho na página ----------
    function adicionarBotao() {
        const target = document.querySelector('.task-body-header-actions');
        if (!target) {
            console.warn('Elemento .task-body-header-actions não encontrado.');
            return;
        }
        if (document.getElementById('meuBotaoHTML')) return;

        const botao = document.createElement('button');
        botao.id = 'meuBotaoHTML';
        botao.innerText = '📄 Salvar como HTML';
        botao.style.cssText = 'background-color:#EE0F0F; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer; font-size:14px; font-weight:bold; margin-right:10px; transition:background 0.2s; font-family:"Google Sans", "Roboto", sans-serif;';
        botao.onmouseover = () => botao.style.backgroundColor = '#c40c0c';
        botao.onmouseout = () => botao.style.backgroundColor = '#EE0F0F';
        botao.onclick = gerarHTML;

        target.parentNode.insertBefore(botao, target);
        console.log('Botão "Salvar como HTML" adicionado.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', adicionarBotao);
    } else {
        adicionarBotao();
    }
})();