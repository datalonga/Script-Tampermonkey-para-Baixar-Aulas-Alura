// ==UserScript==
// @name         Alura - Gerador de ZIP de Módulos
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Cria um arquivo ZIP com as pastas dos módulos da página do curso.
// @author       Você
// @match        *://cursos.alura.com.br/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=alura.com.br
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// ==/UserScript==

(function() {
    'use strict';

    // 1. Cria o botão flutuante
    const btn = document.createElement('button');
    btn.innerText = 'Baixar Módulos (ZIP)';
    btn.style.position = 'fixed';
    btn.style.bottom = '20px';
    btn.style.right = '20px';
    btn.style.zIndex = '99999'; // Garante que fique por cima de tudo na página
    btn.style.backgroundColor = '#2A7AE4';
    btn.style.color = '#ffffff';
    btn.style.border = 'none';
    btn.style.padding = '12px 20px';
    btn.style.borderRadius = '8px';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '14px';
    btn.style.fontWeight = 'bold';
    btn.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
    btn.style.transition = 'opacity 0.2s, background-color 0.2s';

    // Efeito de hover (mouse por cima)
    btn.onmouseover = () => {
        btn.style.backgroundColor = '#1F68C5'; // Um azul um pouco mais escuro
        btn.style.opacity = '0.9';
    };
    btn.onmouseout = () => {
        btn.style.backgroundColor = '#2A7AE4';
        btn.style.opacity = '1';
    };

    // 2. Ação do clique no botão
    btn.onclick = async function() {
        // Muda o texto enquanto gera
        const textoOriginal = btn.innerText;
        btn.innerText = 'Gerando ZIP...';
        btn.disabled = true;

        try {
            // Encontra o select na página
            const select = document.querySelector('select.task-menu-sections-select');

            if (!select) {
                alert('Elemento de módulos não encontrado nesta página. Você está na página de um curso?');
                btn.innerText = textoOriginal;
                btn.disabled = false;
                return;
            }

            // Extrai os nomes EXATOS das opções (mantendo espaços e caracteres originais)
            const modulos = Array.from(select.options).map(option => option.textContent.trim());

            if (modulos.length === 0) {
                alert('Nenhum módulo encontrado no select.');
                btn.innerText = textoOriginal;
                btn.disabled = false;
                return;
            }

            // Inicializa o ZIP (JSZip já foi carregado pelo @require)
            const zip = new JSZip();

            // Cria uma pasta para cada módulo
            modulos.forEach(modulo => {
                zip.file(`${modulo}/`, "");
            });

            // Gera o arquivo
            const conteudoZip = await zip.generateAsync({ type: "blob" });

            // Força o download
            const linkDownload = document.createElement("a");
            linkDownload.href = URL.createObjectURL(conteudoZip);
            linkDownload.download = "Modulos_Curso.zip";
            document.body.appendChild(linkDownload);
            linkDownload.click();
            document.body.removeChild(linkDownload);
            URL.revokeObjectURL(linkDownload.href);

            // Feedback de sucesso
            btn.innerText = 'Download Iniciado!';
            setTimeout(() => {
                btn.innerText = textoOriginal;
                btn.disabled = false;
            }, 2000);

        } catch (erro) {
            console.error('Erro no Userscript:', erro);
            alert('Ocorreu um erro ao gerar o ZIP. Veja o console (F12) para detalhes.');
            btn.innerText = textoOriginal;
            btn.disabled = false;
        }
    };

    // 3. Adiciona o botão na página
    document.body.appendChild(btn);

})();