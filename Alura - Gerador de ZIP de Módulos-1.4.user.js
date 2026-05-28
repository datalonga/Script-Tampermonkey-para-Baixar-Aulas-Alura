// ==UserScript==
// @name         Alura - Gerador de ZIP de Módulos
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Cria um arquivo ZIP com a estrutura de pastas do curso e módulos.
// @author       Você
// @match        *://cursos.alura.com.br/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=alura.com.br
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// ==/UserScript==

(function() {
    'use strict';

    // Função para sanitizar nomes (O Windows não aceita \ / : * ? " < > | em nomes de arquivos/pastas)
    function sanitizarNome(nome) {
        if (!nome) return 'Sem_Nome';
        // Substitui ":" (com espaços ao redor) por " - " para manter a formatação correta
        // Depois substitui outros caracteres inválidos por '-' e remove espaços extras
        return nome.trim()
                   .replace(/\s*:\s*/g, ' - ')
                   .replace(/[\\/*?"<>|]/g, '-')
                   .replace(/\s+/g, ' ');
    }

    // 1. Cria o botão flutuante
    const btn = document.createElement('button');
    btn.innerText = 'Baixar Curso (ZIP)';
    btn.style.position = 'fixed';
    btn.style.bottom = '20px';
    btn.style.right = '20px';
    btn.style.zIndex = '99999';
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

    // Efeito de hover
    btn.onmouseover = () => {
        btn.style.backgroundColor = '#1F68C5';
        btn.style.opacity = '0.9';
    };
    btn.onmouseout = () => {
        btn.style.backgroundColor = '#2A7AE4';
        btn.style.opacity = '1';
    };

    // 2. Ação do clique no botão
    btn.onclick = async function() {
        const textoOriginal = btn.innerText;
        btn.innerText = 'Gerando ZIP...';
        btn.disabled = true;

        try {
            // Pega o nome do curso no cabeçalho
            const elementoNomeCurso = document.querySelector('a[data-testid="task-header-course-name"]');

            if (!elementoNomeCurso) {
                alert('Elemento do nome do curso não encontrado. Verifique se você está na página correta.');
                btn.innerText = textoOriginal;
                btn.disabled = false;
                return;
            }

            // Sanitiza o nome do curso para usar como Pasta Raiz e Nome do Arquivo
            const nomeCurso = sanitizarNome(elementoNomeCurso.textContent);

            // Pega todas as seções da página
            const secoes = document.querySelectorAll('div[data-section-id]');

            if (secoes.length === 0) {
                alert('Nenhuma seção encontrada nesta página.');
                btn.innerText = textoOriginal;
                btn.disabled = false;
                return;
            }

            // Inicializa o ZIP
            const zip = new JSZip();

            // Itera sobre cada seção (Módulo)
            secoes.forEach(secao => {
                // Pega o nome da seção (ex: "Seção 01: A arquitetura do projeto ContainRs")
                const elementoNomeSecao = secao.querySelector('button div.flex.items-center.gap-1');
                const nomeSecaoOriginal = elementoNomeSecao ? elementoNomeSecao.textContent.trim() : 'Seção Desconhecida';

                // Remove APENAS a palavra "Seção " do início (mantendo o número)
                const nomeSecaoLimpo = nomeSecaoOriginal.replace(/^Seção\s*/i, '');

                // Sanitiza o nome final da seção (transforma ":" em " - ", etc)
                const nomeSecao = sanitizarNome(nomeSecaoLimpo);

                // Cria apenas a pasta da seção dentro da pasta do curso
                zip.file(`${nomeCurso}/${nomeSecao}/`, "");
            });

            // Gera o arquivo ZIP
            const conteudoZip = await zip.generateAsync({ type: "blob" });

            // Força o download com o nome do curso
            const linkDownload = document.createElement("a");
            linkDownload.href = URL.createObjectURL(conteudoZip);
            linkDownload.download = `${nomeCurso}.zip`;
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