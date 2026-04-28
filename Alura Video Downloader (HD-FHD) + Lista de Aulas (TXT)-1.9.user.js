// ==UserScript==
// @name         Alura Video Downloader (HD/FHD) + Lista de Aulas (TXT)
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  Detecta a melhor qualidade (FullHD/HD), captura links (gnarus/video2), baixa vídeos e gera lista de aulas (apenas vídeos) em TXT sem cabeçalho. Inclui número do módulo no nome do arquivo e detecção AJAX aprimorada.
// @author       Você
// @match        https://cursos.alura.com.br/*
// @grant        none
// @run-at       document-end
// ==/UserScript==
(function() {
'use strict';

// 🔹 VARIÁVEIS GLOBAIS PARA DETECÇÃO DE MUDANÇA DE AULA 🔹
let lastLessonIdentifier = '';
let ajaxDetectionTimeout = null;

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

// 🔹 NOVA FUNÇÃO: Gerar identificador único da aula atual 🔹
function getLessonIdentifier() {
    const titleElement = document.querySelector('.task-body-header-title-text');
    const numberElement = document.querySelector('.task-body-header-title small');
    const selectElement = document.querySelector('.task-menu-sections-select');
    const selectedOption = selectElement?.querySelector('option[selected]');

    // Combina título + número da aula + módulo para criar um identificador único
    const title = titleElement ? titleElement.innerText.trim() : '';
    const number = numberElement ? numberElement.innerText.trim() : '';
    const module = selectedOption ? selectedOption.innerText.trim() : '';

    return `${module}|${number}|${title}`;
}

// 🔹 NOVA FUNÇÃO: Verificar se a aula mudou e reinicializar se necessário 🔹
function checkLessonChange() {
    const currentIdentifier = getLessonIdentifier();

    // Se o identificador mudou e não está vazio, é uma nova aula
    if (currentIdentifier && currentIdentifier !== lastLessonIdentifier) {
        console.log('[Alura Downloader] Nova aula detectada via AJAX: ' + currentIdentifier);
        lastLessonIdentifier = currentIdentifier;

        // Remove botões antigos
        const oldVideoBtn = document.getElementById('alura-dl-btn');
        if (oldVideoBtn) oldVideoBtn.remove();

        const oldTxtBtn = document.getElementById('alura-txt-btn');
        if (oldTxtBtn) oldTxtBtn.remove();

        // Reinicia o downloader para a nova aula
        initDownloader();
    }
}

// 🔹 NOVA FUNÇÃO: Debounce para evitar execuções repetidas durante transição AJAX 🔹
function debouncedCheckLessonChange() {
    if (ajaxDetectionTimeout) {
        clearTimeout(ajaxDetectionTimeout);
    }
    ajaxDetectionTimeout = setTimeout(() => {
        checkLessonChange();
    }, 800); // Aguarda 800ms após a última mudança para confirmar que a aula carregou
}

// 🔹 NOVA FUNÇÃO: Extrair número do módulo atual 🔹
function getCurrentModuleNumber() {
    const selectElement = document.querySelector('.task-menu-sections-select');
    if (!selectElement) return '';

    const selectedOption = selectElement.querySelector('option[selected]');
    if (!selectedOption) return '';

    const optionText = selectedOption.innerText.trim();
    const moduleMatch = optionText.match(/^(\d+)/);
    return moduleMatch ? moduleMatch[1] : '';
}

// Função principal de lógica
function initDownloader() {
    console.log('[Alura Downloader] Iniciando...');

    // Atualiza o identificador da aula atual
    lastLessonIdentifier = getLessonIdentifier();

    // --- Lógica do Vídeo ---
    waitForElement('.vjs-quality-selector', (qualityBtn) => {
        console.log('[Alura Downloader] Botão de qualidade encontrado.');
        setTimeout(() => {
            changeToBestQuality(qualityBtn);
        }, 1000);
    }, 1000);

    // --- Lógica da Lista de Aulas (TXT) ---
    waitForElement('.task-menu-nav-title', (menuTitle) => {
        createTxtButton(menuTitle);
    }, 1000);
}

// Lógica para trocar a qualidade
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
        setTimeout(createDownloadButton, 1500);

    }, 500);
}

// Criar Botão de TXT
function createTxtButton(menuTitleElement) {
    const btnId = 'alura-txt-btn';
    if (document.getElementById(btnId)) return;

    const btn = document.createElement('button');
    btn.id = btnId;
    btn.innerText = '📋 Lista Aulas (TXT)';

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
    btn.onclick = generateAndDownloadTxt;

    menuTitleElement.insertAdjacentElement('afterend', btn);
    console.log('[Alura Downloader] Botão de TXT criado no menu lateral.');
}

// Gerar e Baixar TXT (Apenas Vídeos, Sem Cabeçalho)
function generateAndDownloadTxt() {
    console.log('[Alura Downloader] Gerando lista de aulas...');

    const listItems = document.querySelectorAll('.task-menu-nav-item');
    let textContent = "";

    listItems.forEach(item => {
        const durationSpan = item.querySelector('.task-menu-nav-item-videoDuration');

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

// 🔹 FUNÇÃO MODIFICADA: Cria o botão de download com módulo + número + título 🔹
// 🔹 FUNÇÃO MODIFICADA: Cria o botão de download com módulo + número + título 🔹
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

    const moduleNumber = getCurrentModuleNumber();
    const numberElement = document.querySelector('.task-body-header-title small');

    // 🔹 ALTERAÇÃO AQUI: garante 2 dígitos no número da aula 🔹
    const lessonNumber = numberElement ? numberElement.innerText.trim().replace(/^0+/, '').padStart(2, '0') : '';

    const lessonTitle = titleElement.innerText.trim();

    let fileName = 'video.mp4';

    if (moduleNumber && lessonNumber && lessonTitle) {
        fileName = `${moduleNumber}-${lessonNumber} - ${lessonTitle}.mp4`;
    } else if (lessonNumber && lessonTitle) {
        fileName = `${lessonNumber} - ${lessonTitle}.mp4`;
    } else if (lessonTitle) {
        fileName = `${lessonTitle}.mp4`;
    }

    const a = document.createElement('a');
    a.id = 'alura-dl-btn';
    a.href = videoSrc;
    a.download = fileName;
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
    console.log('[Alura Downloader] Botão de download criado com nome: ' + fileName);
}

// Captura o link do vídeo
function getVideoSrc() {
    const video = document.querySelector('video.vjs-tech');
    if (video && video.src) {
        if (video.src.includes('gnarus-video') || video.src.includes('video2.alura.com.br')) {
            return video.src;
        }
    }
    return null;
}

// 🔹 DETECÇÃO APRIMORADA DE NAVEGAÇÃO AJAX 🔹
function setupAjaxDetection() {
    // 1. Observer para mudanças no DOM que indicam nova aula
    new MutationObserver(() => {
        // Verifica se elementos-chave da aula existem antes de checar mudança
        if (document.querySelector('.task-body-header-title-text') ||
            document.querySelector('.task-menu-sections-select')) {
            debouncedCheckLessonChange();
        }
    }).observe(document.body, { subtree: true, childList: true });

    // 2. Listener para navegação com botões Voltar/Avançar do navegador
    window.addEventListener('popstate', () => {
        setTimeout(() => {
            checkLessonChange();
        }, 500);
    });

    // 3. Intercepta mudanças de URL via history API (navegação SPA)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(...args) {
        originalPushState.apply(this, args);
        setTimeout(debouncedCheckLessonChange, 300);
    };

    history.replaceState = function(...args) {
        originalReplaceState.apply(this, args);
        setTimeout(debouncedCheckLessonChange, 300);
    };
}

// Inicialização
initDownloader();
setupAjaxDetection();

})();