// ==UserScript==
// @name         Alura Video Downloader + Lista de Aulas (TXT) [Nova UI]
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Adaptado para a nova interface da Alura. Baixa vídeos e gera lista de aulas em TXT.
// @author       Você
// @match        https://cursos.alura.com.br/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
'use strict';

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

// 🔹 FUNÇÃO: Extrai informações da aula atual baseada na URL e Sidebar
function getCurrentLessonInfo() {
    const currentPath = window.location.pathname;
    const sections = document.querySelectorAll('div[data-section-id]');
    let moduleNumber = '';
    let lessonNumber = '';
    let lessonTitle = '';

    for (const section of sections) {
        const sectionTitleEl = section.querySelector('button div.text-sm.font-semibold div.flex.items-center');
        const sectionText = sectionTitleEl ? sectionTitleEl.innerText.trim() : '';
        const moduleMatch = sectionText.match(/Seção\s+(\d+)/i);
        const currentModuleNum = moduleMatch ? moduleMatch[1] : '';

        const lessons = section.querySelectorAll('ul li a');
        for (const lesson of lessons) {
            if (lesson.getAttribute('href') === currentPath) {
                moduleNumber = currentModuleNum;
                const titleSpan = lesson.querySelector('span.text-sm.text-balance');
                if (titleSpan) {
                    const fullText = titleSpan.innerText.trim();
                    const lessonMatch = fullText.match(/^(\d+)\.\s*(.*)$/);
                    if (lessonMatch) {
                        lessonNumber = lessonMatch[1].padStart(2, '0');
                        lessonTitle = lessonMatch[2];
                    } else {
                        lessonTitle = fullText;
                    }
                }
                return { moduleNumber, lessonNumber, lessonTitle };
            }
        }
    }

    const fallbackTitle = document.querySelector('h2.text-text-title');
    return {
        moduleNumber: '',
        lessonNumber: '',
        lessonTitle: fallbackTitle ? fallbackTitle.innerText.trim() : 'video'
    };
}

function getLessonIdentifier() {
    const info = getCurrentLessonInfo();
    return `${info.moduleNumber}|${info.lessonNumber}|${info.lessonTitle}|${window.location.pathname}`;
}

function checkLessonChange() {
    const currentIdentifier = getLessonIdentifier();

    if (currentIdentifier && currentIdentifier !== lastLessonIdentifier) {
        console.log('[Alura Downloader] Nova aula detectada: ' + currentIdentifier);
        lastLessonIdentifier = currentIdentifier;

        const oldVideoBtn = document.getElementById('alura-dl-btn');
        if (oldVideoBtn) oldVideoBtn.remove();

        const oldTxtBtn = document.getElementById('alura-txt-btn');
        if (oldTxtBtn) oldTxtBtn.remove();

        initDownloader();
    }
}

function debouncedCheckLessonChange() {
    if (ajaxDetectionTimeout) clearTimeout(ajaxDetectionTimeout);
    ajaxDetectionTimeout = setTimeout(() => {
        checkLessonChange();
    }, 800);
}

function initDownloader() {
    console.log('[Alura Downloader] Iniciando...');
    lastLessonIdentifier = getLessonIdentifier();

    // Lógica do Vídeo - Apenas aguarda o player carregar para criar o botão (sem mudar qualidade)
    waitForElement('video.vjs-tech', () => {
        setTimeout(createDownloadButton, 1500);
    }, 1000);

    // Lógica da Lista de Aulas (TXT) - Injetando no header da sidebar
    waitForElement('div.sticky.top-0.z-10.bg-surface-tertiary', (header) => {
        createTxtButton(header);
    }, 1000);
}

function createTxtButton(headerElement) {
    const btnId = 'alura-txt-btn';
    if (document.getElementById(btnId)) return;

    const btn = document.createElement('button');
    btn.id = btnId;
    btn.innerText = '📋 Lista Aulas (TXT)';

    btn.style.marginLeft = '10px';
    btn.style.backgroundColor = '#2A7AE4';
    btn.style.color = '#fff';
    btn.style.padding = '6px 12px';
    btn.style.border = 'none';
    btn.style.borderRadius = '6px';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '13px';
    btn.style.fontWeight = 'bold';
    btn.style.whiteSpace = 'nowrap';
    btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    btn.style.transition = 'background 0.3s';

    btn.onmouseover = function() { this.style.backgroundColor = '#1f60b3'; };
    btn.onmouseout = function() { this.style.backgroundColor = '#2A7AE4'; };
    btn.onclick = generateAndDownloadTxt;

    headerElement.appendChild(btn);
}

function generateAndDownloadTxt() {
    const sections = document.querySelectorAll('div[data-section-id]');
    let textContent = "";

    sections.forEach(section => {
        const sectionTitleEl = section.querySelector('button div.text-sm.font-semibold div.flex.items-center');
        const sectionTitle = sectionTitleEl ? sectionTitleEl.innerText.trim() : 'Módulo';

        textContent += `\n=== ${sectionTitle} ===\n`;

        const lessons = section.querySelectorAll('ul li');
        lessons.forEach(li => {
            const durationSpan = li.querySelector('span.text-xs.font-jetbrains-mono');
            if (durationSpan && durationSpan.innerText.includes('min')) {
                const titleSpan = li.querySelector('span.text-sm.text-balance');
                if (titleSpan) {
                    textContent += `${titleSpan.innerText.trim()}\n`;
                }
            }
        });
    });

    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const courseName = window.location.pathname.split('/')[2] || 'alura_curso';
    a.download = `${courseName}_lista_aulas.txt`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function createDownloadButton() {
    let existingBtn = document.getElementById('alura-dl-btn');
    const videoSrc = getVideoSrc();

    if (!videoSrc) {
        console.log('[Alura Downloader] Vídeo source não encontrado ainda. Tentando novamente...');
        setTimeout(createDownloadButton, 1000);
        return;
    }

    if (existingBtn) {
        existingBtn.href = videoSrc;
        return;
    }

    // 🔹 ALTERAÇÃO: Injeta ao lado do nome do curso
    const courseNameElement = document.querySelector('a[data-testid="task-header-course-name"]');
    if (!courseNameElement) {
        console.log('[Alura Downloader] Elemento do nome do curso não encontrado.');
        return;
    }

    const info = getCurrentLessonInfo();
    let fileName = 'video.mp4';

    if (info.moduleNumber && info.lessonNumber && info.lessonTitle) {
        fileName = `${info.moduleNumber}-${info.lessonNumber} - ${info.lessonTitle}.mp4`;
    } else if (info.lessonNumber && info.lessonTitle) {
        fileName = `${info.lessonNumber} - ${info.lessonTitle}.mp4`;
    } else if (info.lessonTitle) {
        fileName = `${info.lessonTitle}.mp4`;
    }

    // Sanitiza o nome do arquivo
    fileName = fileName.replace(/[<>:"/\\|?*]/g, '');

    const a = document.createElement('a');
    a.id = 'alura-dl-btn';
    a.href = videoSrc;
    a.download = fileName;
    a.innerText = '⬇ Baixar Vídeo';

    a.style.display = 'inline-block';
    a.style.marginLeft = '15px';
    a.style.backgroundColor = '#2A7AE4';
    a.style.color = '#fff';
    a.style.padding = '6px 14px';
    a.style.borderRadius = '6px';
    a.style.textDecoration = 'none';
    a.style.fontFamily = 'sans-serif';
    a.style.fontSize = '14px';
    a.style.fontWeight = 'bold';
    a.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    a.style.transition = 'background 0.3s';
    a.style.cursor = 'pointer';
    a.style.whiteSpace = 'nowrap';
    a.style.verticalAlign = 'middle';

    a.onmouseover = function() { this.style.backgroundColor = '#1f60b3'; };
    a.onmouseout = function() { this.style.backgroundColor = '#2A7AE4'; };

    courseNameElement.insertAdjacentElement('afterend', a);
    console.log('[Alura Downloader] Botão de download criado com nome: ' + fileName);
}

function getVideoSrc() {
    const video = document.querySelector('video.vjs-tech');
    if (video && video.src) {
        if (video.src.includes('gnarus-video') || video.src.includes('video2.alura.com.br') || video.src.includes('.mp4')) {
            return video.src;
        }
    }
    // Fallback para tag source dentro do video
    const source = document.querySelector('video.vjs-tech source');
    if (source && source.src) {
        return source.src;
    }
    return null;
}

function setupAjaxDetection() {
    new MutationObserver(() => {
        if (document.querySelector('a[data-testid="task-header-course-name"]') || document.querySelector('div[data-section-id]')) {
            debouncedCheckLessonChange();
        }
    }).observe(document.body, { subtree: true, childList: true });

    window.addEventListener('popstate', () => {
        setTimeout(checkLessonChange, 500);
    });

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