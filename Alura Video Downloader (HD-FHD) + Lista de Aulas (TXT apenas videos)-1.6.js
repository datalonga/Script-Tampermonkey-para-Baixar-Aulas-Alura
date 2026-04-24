// ==UserScript==
// @name         Alura Video Downloader (HD/FHD) + Lista de Aulas (TXT)
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Detecta a melhor qualidade (FullHD/HD), captura links (gnarus/video2), baixa vídeos e gera lista de aulas (apenas vídeos) em TXT.
// @author       Você
// @match        https://cursos.alura.com.br/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // Função para aguardar um elemento aparecer no DOM
    function waitForElement(selector, callback, intervalTime = 500, timeout = 15000) {
        const startTime = Date.now();
        const interval = setInterval(() => {
            const element = document.querySelector(selector);
            if (element) {
                clearInterval(interval);
                callback(element);
            } else if (Date.now() - startTime > timeout) {
                clearInterval(interval);
                console.log('[Alura Downloader] Tempo limite esgotado esperando pelo seletor: ' + selector);
            }
        }, intervalTime);
    }

    // Função principal de lógica
    function initDownloader() {
        console.log('[Alura Downloader] Iniciando...');

        // --- Lógica do Vídeo ---
        // Espera o botão de configurações/qualidade aparecer
        waitForElement('.vjs-quality-selector', (qualityBtn) => {
            console.log('[Alura Downloader] Botão de qualidade encontrado.');
            setTimeout(() => {
                changeToBestQuality(qualityBtn);
            }, 1000);
        }, 1000);

        // --- Lógica da Lista de Aulas (TXT) ---
        // Espera o título do menu lateral aparecer para criar o botão
        waitForElement('.task-menu-nav-title', (menuTitle) => {
            createTxtButton(menuTitle);
        }, 1000);
    }

    // Lógica para trocar a qualidade (INALTERADA)
    function changeToBestQuality(qualityContainer) {
        const menuButton = qualityContainer.querySelector('button');
        if (menuButton) menuButton.click();

        setTimeout(() => {
            const menuItems = document.querySelectorAll('.vjs-menu-item');
            let targetItem = null;

            menuItems.forEach(item => {
                const textSpan = item.querySelector('.vjs-menu-item-text');
                if (textSpan) {
                    const text = textSpan.innerText.toLowerCase();
                    if (text.includes('fullhd')) {
                        targetItem = item;
                    } else if (text.includes('hd') && !targetItem) {
                        targetItem = item;
                    }
                }
            });

            if (targetItem) {
                console.log('[Alura Downloader] Selecionando qualidade: ' + targetItem.innerText);
                targetItem.click();
            } else {
                console.log('[Alura Downloader] Opções HD/FullHD não encontradas no menu.');
            }

            if (menuButton) menuButton.click();

            // Cria o botão de download do vídeo após ajustar qualidade
            setTimeout(createDownloadButton, 1500);

        }, 500);
    }

    // --- FUNÇÃO NOVA: Criar Botão de TXT ---
    function createTxtButton(menuTitleElement) {
        const btnId = 'alura-txt-btn';
        // Se já existe, não recria
        if (document.getElementById(btnId)) return;

        const btn = document.createElement('button');
        btn.id = btnId;
        btn.innerText = '📋 Lista Aulas (TXT)';

        // Estilização (Similar ao botão de download, mas posicionado no menu lateral)
        btn.style.display = 'inline-block';
        btn.style.marginLeft = '15px';
        btn.style.verticalAlign = 'middle';
        btn.style.backgroundColor = '#2A7AE4';
        btn.style.color = '#fff';
        btn.style.padding = '5px 15px';
        btn.style.border = 'none';
        btn.style.borderRadius = '4px';
        btn.style.cursor = 'pointer';
        btn.style.fontSize = '14px';
        btn.style.fontWeight = 'bold';
        btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
        btn.style.transition = 'background 0.3s';

        btn.onmouseover = function() { this.style.backgroundColor = '#1f60b3'; };
        btn.onmouseout = function() { this.style.backgroundColor = '#2A7AE4'; };

        // Evento de clique para gerar o TXT
        btn.onclick = generateAndDownloadTxt;

        // Insere ao lado do h2 do menu lateral
        menuTitleElement.insertAdjacentElement('afterend', btn);
        console.log('[Alura Downloader] Botão de TXT criado no menu lateral.');
    }

    // --- FUNÇÃO ATUALIZADA: Gerar e Baixar TXT (Apenas Vídeos) ---
    function generateAndDownloadTxt() {
        console.log('[Alura Downloader] Gerando lista de aulas...');

        const listItems = document.querySelectorAll('.task-menu-nav-item');
        let textContent = "Lista de Aulas (Vídeos) - Alura\n\n";

        listItems.forEach(item => {
            // --- FILTRO: Verifica se possui duração (é vídeo) ---
            // Procura pela class "task-menu-nav-item-videoDuration"
            const durationSpan = item.querySelector('.task-menu-nav-item-videoDuration');

            // Se encontrar a duração, pega os dados. Se não, ignora a aula (exercício ou texto).
            if (durationSpan) {
                const numberSpan = item.querySelector('.task-menu-nav-item-number');
                const titleSpan = item.querySelector('.task-menu-nav-item-title');

                if (numberSpan && titleSpan) {
                    const num = numberSpan.innerText.trim();
                    const title = titleSpan.innerText.trim();
                    textContent += `${num} - ${title}\n`;
                }
            }
        });

        // Cria o Blob e faz o download
        const blob = new Blob([textContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'alura_lista_aulas.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Cria o botão de download do vídeo (INALTERADA)
    function createDownloadButton() {
        let existingBtn = document.getElementById('alura-dl-btn');
        const videoSrc = getVideoSrc();

        if (!videoSrc) {
            console.log('[Alura Downloader] Vídeo source não encontrado ainda. Tentando novamente...');
            return;
        }

        if (existingBtn) {
            existingBtn.href = videoSrc;
            return;
        }

        const titleElement = document.querySelector('.task-body-header-title-text');
        if (!titleElement) return;

        const a = document.createElement('a');
        a.id = 'alura-dl-btn';
        a.href = videoSrc;
        a.target = '_blank';
        a.innerText = '⬇ Baixar Vídeo';

        a.style.display = 'inline-block';
        a.style.marginLeft = '15px';
        a.style.verticalAlign = 'middle';
        a.style.backgroundColor = '#2A7AE4';
        a.style.color = '#fff';
        a.style.padding = '5px 15px';
        a.style.borderRadius = '4px';
        a.style.textDecoration = 'none';
        a.style.fontFamily = 'sans-serif';
        a.style.fontSize = '14px';
        a.style.fontWeight = 'bold';
        a.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
        a.style.transition = 'background 0.3s';
        a.style.cursor = 'pointer';

        a.onmouseover = function() { this.style.backgroundColor = '#1f60b3'; };
        a.onmouseout = function() { this.style.backgroundColor = '#2A7AE4'; };

        titleElement.insertAdjacentElement('afterend', a);
        console.log('[Alura Downloader] Botão de download criado ao lado do título!');
    }

    // Captura o link do vídeo (INALTERADA)
    function getVideoSrc() {
        const video = document.querySelector('video.vjs-tech');
        if (video && video.src) {
            if (video.src.includes('gnarus-video') || video.src.includes('video2.alura.com.br')) {
                return video.src;
            }
        }
        return null;
    }

    // Observer para detectar mudanças de página (INALTERADO)
    let lastUrl = location.href;
    new MutationObserver(() => {
        const currentUrl = location.href;
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            // Remove botões antigos se existirem
            const oldVideoBtn = document.getElementById('alura-dl-btn');
            if (oldVideoBtn) oldVideoBtn.remove();

            const oldTxtBtn = document.getElementById('alura-txt-btn');
            if (oldTxtBtn) oldTxtBtn.remove();

            // Reinicia o script para a nova aula
            initDownloader();
        }
    }).observe(document.body, { subtree: true, childList: true });

    // Inicialização inicial
    initDownloader();

})();