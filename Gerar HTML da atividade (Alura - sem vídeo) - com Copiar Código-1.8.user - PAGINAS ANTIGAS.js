// ==UserScript==
// @name         Gerar HTML da atividade (Alura - sem vídeo) - com Copiar Código
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  Adiciona botão vermelho para gerar arquivo HTML com conteúdo limpo, fonte Google Sans, botões "Copiar código" e Alternativas de múltipla escolha/Ordenar blocos.
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
            // Tenta pegar o número da seção pelo data attribute
            const taskSection = document.querySelector('section.task[data-section-number]');
            let numeroSecao = '00';

            if (taskSection) {
                numeroSecao = taskSection.getAttribute('data-section-number').padStart(2, '0');
            } else {
                const selectSecao = document.querySelector('.task-menu-sections-select option[selected]');
                if (selectSecao) {
                    const match = selectSecao.innerText.match(/^(\d+)\./);
                    if (match) {
                        numeroSecao = match[1].padStart(2, '0');
                    }
                }
            }

            // Pega o nome da aula
            const linkAulaAtual = document.querySelector(`a[href="${window.location.pathname}"]`);
            let nomeAulaFormatado = 'Aula';

            if (linkAulaAtual) {
                const tituloAula = linkAulaAtual.querySelector('.task-menu-nav-item-title')?.getAttribute('title') ||
                                   linkAulaAtual.querySelector('.task-menu-nav-item-title')?.innerText.trim() ||
                                   linkAulaAtual.innerText.trim();

                if (tituloAula) {
                    nomeAulaFormatado = tituloAula;
                }

                const numeroAula = linkAulaAtual.querySelector('.task-menu-nav-item-number')?.innerText.trim();
                if (numeroAula) {
                    nomeAulaFormatado = `${numeroAula.padStart(2, '0')}. ${nomeAulaFormatado}`;
                }
            } else {
                // Fallback para o título da página
                const tituloOriginal = document.title;
                const match = tituloOriginal.match(/:\s*(.*?)\s*\|/);
                if (match && match[1]) {
                    nomeAulaFormatado = match[1].trim();
                }
            }

            const nomeArquivo = `${numeroSecao}-${nomeAulaFormatado}`;
            return nomeArquivo.replace(/[\\/:"*?<>|]+/g, '_').trim() + '.html';
        } catch (e) {
            console.error('[Gerar HTML] Erro ao extrair nome do arquivo:', e);
        }

        // Fallback final
        const tituloOriginal = document.title;
        const match = tituloOriginal.match(/:\s*(.*?)\s*\|/);
        if (match && match[1]) {
            return match[1].trim().replace(/[\\/:"*?<>|]+/g, '_') + '.html';
        }
        return "Atividade_Alura.html";
    }

    function extrairTituloH3() {
        const h1 = document.querySelector('.task-body-header-title-text');
        if (h1) return h1.innerText.trim();

        const h2 = document.querySelector('section[aria-label="Conteúdo da aula"] h2');
        if (h2) return h2.innerText.trim();

        const match = document.title.match(/:\s*(.*?)\s*\|/);
        if (match && match[1]) return match[1].trim();

        return "Conteúdo da atividade";
    }

    // ---------- Função para garantir URLs absolutos ----------
    function garantirUrlsAbsolutos(element) {
        const baseUrl = window.location.origin;

        // Garantir que todas as imagens tenham URLs absolutos
        element.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src');
            if (src && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('//')) {
                if (src.startsWith('/')) {
                    img.setAttribute('src', baseUrl + src);
                } else {
                    img.setAttribute('src', baseUrl + '/' + src);
                }
            }
        });

        // Garantir que todos os links tenham URLs absolutos
        element.querySelectorAll('a[href]').forEach(link => {
            const href = link.getAttribute('href');
            if (href && !href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('//') && !href.startsWith('#')) {
                if (href.startsWith('/')) {
                    link.setAttribute('href', baseUrl + href);
                } else {
                    link.setAttribute('href', baseUrl + '/' + href);
                }
            }
        });
    }

    // ---------- Limpeza e montagem do conteúdo ----------
    function obterConteudoLimpo() {
        let section = document.querySelector('section[aria-label="Conteúdo da aula"]') || document.querySelector('section#task-content');
        if (!section) {
            console.error('[Gerar HTML] Seção de conteúdo não encontrada');
            return null;
        }

        const clone = section.cloneNode(true);

        // Garantir que todas as URLs sejam absolutas ANTES de qualquer processamento
        garantirUrlsAbsolutos(clone);

        // Remover elementos de vídeo, configurações e alertas
        clone.querySelectorAll('.video.settings, .settings-box, .settings-button, .task-body-alert').forEach(el => el.remove());

        // Remover botões de submissão e ações
        clone.querySelectorAll('.task-submit-blocks-wrapper, #tryAgain, #submitBlocks, .task-actions').forEach(el => el.remove());

        // Processar Sort Blocks (Ordenar Blocos)
        const sortBlocksOrigin = clone.querySelector('#sortBlocksOrigin');
        if (sortBlocksOrigin) {
            const blocks = sortBlocksOrigin.querySelectorAll('.blockContainer .block');
            if (blocks.length > 0) {
                const ul = document.createElement('ul');
                ul.className = 'alternativas-list';
                blocks.forEach((btn, index) => {
                    const li = document.createElement('li');
                    li.className = 'alternativa-item';
                    const letra = String.fromCharCode(65 + index); // A, B, C...
                    li.innerHTML = `
                        <div class="alternativa-letra">${letra}</div>
                        <div class="alternativa-conteudo">${btn.innerText.trim()}</div>
                    `;
                    ul.appendChild(li);
                });

                // Substitui a área de blocos originais pela lista formatada
                sortBlocksOrigin.replaceWith(ul);

                // Remove outros elementos desnecessários dentro de .blocks
                const blocksContainer = clone.querySelector('.blocks');
                if (blocksContainer) {
                    blocksContainer.querySelectorAll('#sortBlocksDestination, .taskOpinion, .task-submit-blocks-wrapper').forEach(el => el.remove());
                }
            }
        }

        // Processar alternativas de múltipla escolha (caso existam)
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
                    } else {
                        conteudoHTML = btn.innerHTML;
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

        // Remover botões de copiar e outros botões indesejados
        clone.querySelectorAll('button').forEach(btn => {
            const isCopyBtn = btn.getAttribute('title') === 'Copiar' || btn.getAttribute('aria-label') === 'Copiar';
            if (!isCopyBtn) {
                btn.remove();
            }
        });

        clone.querySelectorAll('#task-content-extra-action-slot, #task-content-title-action-slot').forEach(el => el.remove());

        // Adicionar título
        const textoH3 = extrairTituloH3();
        const novoTitulo = document.createElement('h3');
        novoTitulo.textContent = textoH3;
        novoTitulo.style.cssText = 'color:#2A7AE4; margin:0 0 20px 0; font-size:24px; border-left:4px solid #EE0F0F; padding-left:12px; font-weight:bold;';

        if (clone.firstChild) {
            clone.insertBefore(novoTitulo, clone.firstChild);
        } else {
            clone.appendChild(novoTitulo);
        }

        // Log para debug - verificar se imagens estão presentes
        const imagensNoClone = clone.querySelectorAll('img');
        console.log(`[Gerar HTML] ${imagensNoClone.length} imagens encontradas no conteúdo clonado`);
        imagensNoClone.forEach((img, idx) => {
            console.log(`[Gerar HTML] Imagem ${idx + 1}: ${img.getAttribute('src')}`);
        });

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
                .formattedText img {
                    max-width: 100%;
                    height: auto;
                    margin: 20px auto;
                    border-radius: 8px;
                    display: block;
                    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                }
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

                /* Estilos para as Alternativas de Múltipla Escolha e Sort Blocks */
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

        // Tenta encontrar o slot de ações no cabeçalho da tarefa
        let target = document.querySelector('.task-body-header-actions');

        // Se não encontrar, tenta usar o container do cabeçalho
        if (!target) {
            target = document.querySelector('.task-body-header .container');
        }

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

        // Insere o botão no início do target para ficar antes do botão "Próxima Atividade"
        if (target.firstChild) {
            target.insertBefore(botao, target.firstChild);
        } else {
            target.appendChild(botao);
        }
    }

    // ---------- Monitoramento contínuo (Polling) para SPAs ----------
    setInterval(() => {
        if (window.location.href.includes('/task/')) {
            const botao = document.getElementById('meuBotaoHTML');
            const conteudo = document.querySelector('section#task-content') || document.querySelector('section[aria-label="Conteúdo da aula"]');
            const headerActions = document.querySelector('.task-body-header-actions') || document.querySelector('.task-body-header .container');

            if (headerActions && conteudo && !botao) {
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