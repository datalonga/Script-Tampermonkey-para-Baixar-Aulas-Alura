// ==UserScript==
// @name         Alura Privacy Curtain (Cortina de Privacidade)
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Adiciona uma cortina preta sobre o player de vídeo da Alura (Video.js) para privacidade.
// @author       You
// @match        *://cursos.alura.com.br/*
// @match        *://app.alura.com.br/*
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // Injeta o CSS na página
    GM_addStyle(`
        /* Cortina Preta */
        #alura-privacy-curtain {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: #000000;
            z-index: 9998;
            display: none; /* Controlado via JS */
            pointer-events: none; /* Permite clicar nos controles do vídeo por baixo, se necessário */
        }

        /* Botão de Toggle */
        #alura-privacy-btn {
            position: absolute;
            top: 15px;
            right: 15px;
            z-index: 10000; /* Fica por cima da cortina */
            background-color: rgba(20, 20, 20, 0.85);
            color: #ffffff;
            border: 1px solid rgba(255, 255, 255, 0.2);
            padding: 8px 14px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
            transition: all 0.2s ease-in-out;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        #alura-privacy-btn:hover {
            background-color: rgba(40, 40, 40, 0.95);
            transform: scale(1.05);
        }

        #alura-privacy-btn.active {
            background-color: rgba(42, 122, 228, 0.9); /* Cor azul da Alura quando ativo */
            border-color: rgba(255, 255, 255, 0.4);
        }
    `);

    // Função para inicializar a cortina quando o player carregar
    function initPrivacyCurtain() {
        // O novo player da Alura usa Video.js. Encontramos o container principal através do atributo 'data-vjs-player'
        const playerContainer = document.querySelector('[data-vjs-player]');

        // Verifica se o player existe e se já não foi inicializado
        if (!playerContainer || document.getElementById('alura-privacy-curtain')) {
            return;
        }

        // Garante que o container tem position relative para a cortina (que é absolute) funcionar corretamente e não vazar pela tela
        playerContainer.style.position = 'relative';

        // Cria a Cortina
        const curtain = document.createElement('div');
        curtain.id = 'alura-privacy-curtain';

        // Cria o Botão
        const btn = document.createElement('button');
        btn.id = 'alura-privacy-btn';
        btn.innerHTML = '🔓 Privacidade OFF';

        // Adiciona os elementos ao player
        playerContainer.appendChild(curtain);
        playerContainer.appendChild(btn);

        // Chave do LocalStorage
        const storageKey = 'alura_privacy_curtain_state';

        // Carrega o estado salvo (padrão: false)
        let isActive = localStorage.getItem(storageKey) === 'true';

        // Função para atualizar a interface
        function updateUI() {
            if (isActive) {
                curtain.style.display = 'block';
                btn.innerHTML = '🔒 Privacidade ON';
                btn.classList.add('active');
            } else {
                curtain.style.display = 'none';
                btn.innerHTML = '🔓 Privacidade OFF';
                btn.classList.remove('active');
            }
        }

        // Evento de clique no botão
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            isActive = !isActive;
            localStorage.setItem(storageKey, isActive);
            updateUI();
        });

        // Aplica o estado inicial
        updateUI();
    }

    // Usa MutationObserver para esperar o player carregar (já que a Alura usa carregamento dinâmico/SPA)
    const observer = new MutationObserver((mutations, obs) => {
        if (document.querySelector('[data-vjs-player]')) {
            initPrivacyCurtain();
            // Não desconectamos o observer completamente para o caso de navegação SPA entre vídeos
        }
    });

    // Inicia a observação do DOM
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Tenta rodar imediatamente caso o DOM já esteja pronto
    initPrivacyCurtain();

})();