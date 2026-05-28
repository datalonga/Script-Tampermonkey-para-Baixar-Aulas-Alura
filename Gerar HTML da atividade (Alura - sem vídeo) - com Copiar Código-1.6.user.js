// ==UserScript==
// @name         Gerar HTML da atividade (Alura - sem vídeo) - com Copiar Código
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Adiciona botão vermelho para gerar arquivo HTML com conteúdo limpo, fonte Google Sans, botões "Copiar código" e Alternativas de múltipla escolha.
// @author       Você
// @match        *://cursos.alura.com.br/course/*/task/*
// @match        *://cursos.alura.com.br/classpage/*/task/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Verifica se há player de vídeo
    function verificarVideo() {
        return document.querySelector('video') || document.querySelector('.video-js') || document.querySelector('[class*="video-player"]');
    }

    // ---------- Funções de extração ----------
    function extrairNomeArquivo() {
        try {
            // 1. Tenta pegar pelo link ativo no menu lateral
            const pathAtual = window.location.pathname;
            const linkAulaAtual = document.querySelector(`a[href="${pathAtual}"]`);

            if (linkAulaAtual) {
                // 2. Sobe no DOM até encontrar a div da seção (módulo)
                const secaoAtual = linkAulaAtual.closest('div[data-section-id]');

                if (secaoAtual) {
                    // 3. Pega o número da seção (módulo)
                    const textoSecao = secaoAtual.querySelector('button div.flex.items-center.gap-1')?.innerText.trim();
                    const matchSecao = textoSecao?.match(/Se[cç][aã]o\s*(\d+)/i);
                    const numeroSecao = matchSecao ? matchSecao[1].padStart(2, '0') : '00';

                    // 4. Pega o nome da aula e formata o número (ex: 2. -> 02.)
                    const textoAula = linkAulaAtual.querySelector('span.text-sm.text-balance')?.innerText.trim();
                    let nomeAulaFormatado = textoAula || 'Aula';

                    const matchAula = nomeAulaFormatado.match(/^(\d+)\.(.*)$/);
                    if (matchAula) {
                        nomeAulaFormatado = `${matchAula[1].padStart(2, '0')}.${matchAula[2]}`;
                    }

                    // 5. Monta o nome final: 05-02. Preparando o ambiente.html
                    const nomeArquivo = `${numeroSecao}-${nomeAulaFormatado}`;
                    return nomeArquivo.replace(/[\\/:"*?<>|]+/g, '_').trim() + '.html';
                }
            }
        } catch (e) {
            console.error('[Gerar HTML] Erro ao extrair nome do arquivo pelo menu:', e);
        }

        // Fallback para o método original (usando o título da página) caso o menu não seja encontrado
        const tituloOriginal = document.title;
        const match = tituloOriginal.match(/>\s*(.*?)\s*\|/);
        if (match && match[1]) {
            return match[1].trim().replace(/[\\/:"*?<>|]+/g, '_') + '.html';
        }
        const match2 = tituloOriginal.match(/^(.*?)\s*\|/i);
        if (match2 && match2[1]) {
            return match2[1].trim().replace(/[\\/:"*?<>|]+/g, '_') + '.html';
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

    // ---------- Limpeza e montagem do conteúdo ----------
    function obterConteudoLimpo() {
        const section = document.querySelector('section[aria-label="Conteúdo da aula"]');
        if (!section) return null;

        const clone = section.cloneNode(true);

        // 1. Processar alternativas de múltipla escolha ANTES de remover botões
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

    // ---------- Geração do HTML completo ----------
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

                /* Estilos para as Alternativas de Múltipla Escolha */
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

    function gerarHTML() {
        console.log('[Gerar HTML] Gerando arquivo HTML...');
        const nomeArquivo = extrairNomeArquivo();
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
        if (verificarVideo()) return;

        const target = document.getElementById('task-content-title-action-slot');
        if (!target) return;
        if (document.getElementById('meuBotaoHTML')) return;

        const botao = document.createElement('button');
        botao.id = 'meuBotaoHTML';
        botao.innerText = '📄 Salvar como HTML';
        botao.style.cssText = 'background-color:#EE0F0F; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer; font-size:14px; font-weight:bold; margin-right:10px; transition:background 0.2s; font-family:"Google Sans", "Roboto", sans-serif; box-shadow: 0 2px 4px rgba(0,0,0,0.2); z-index: 999; position: relative;';

        botao.onmouseover = () => botao.style.backgroundColor = '#c40c0c';
        botao.onmouseout = () => botao.style.backgroundColor = '#EE0F0F';

        botao.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            gerarHTML();
        };

        target.appendChild(botao);
    }

    // ---------- Monitoramento contínuo (Polling) para SPAs ----------
    setInterval(() => {
        if (window.location.href.includes('/task/')) {
            const slot = document.getElementById('task-content-title-action-slot');
            const botao = document.getElementById('meuBotaoHTML');
            const conteudo = document.querySelector('section[aria-label="Conteúdo da aula"]');

            if (slot && conteudo && !botao) {
                adicionarBotao();
            }
        }
    }, 800);

    const originalPushState = history.pushState;
    history.pushState = function() {
        originalPushState.apply(this, arguments);
        setTimeout(adicionarBotao, 500);
    };

    window.addEventListener('popstate', () => {
        setTimeout(adicionarBotao, 500);
    });

})();