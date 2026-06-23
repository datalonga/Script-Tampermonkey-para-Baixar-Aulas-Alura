// ==UserScript==
// @name         Captura Automática de Aulas HTML - Alura (Multi-Curso)
// @namespace    http://tampermonkey.net/
// @version      2.5
// @description  Captura automaticamente todas as aulas de texto de múltiplos cursos em sequência com relatório detalhado
// @match        *://cursos.alura.com.br/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    if (!window.location.hostname.includes('cursos.alura.com.br')) {
        return;
    }

    const STORAGE_KEY = 'alura_auto_capture_state_v6';
    const DELAY_ENTRE_AULAS = 3000;
    const DELAY_APOS_SALVAR = 2500;
    const DELAY_ENTRE_CURSOS = 4000;
    const MAX_TENTATIVAS = 3;
    const TIMEOUT_CONTEUDO = 15000;
    const TIMEOUT_ELEMENTO = 30000;

    // Fases do processo
    const FASES = {
        NAVEGANDO_CURSO: 'navegando_curso',
        AGUARDANDO_CARREGAR_CURSO: 'aguardando_carregar_curso',
        CLICANDO_BOTAO_AULAS: 'clicando_botao_aulas',
        AGUARDANDO_CARREGAR_AULAS: 'aguardando_carregar_aulas',
        COLETANDO_URLS: 'coletando_urls',
        PROCESSANDO_AULA: 'processando_aula',
        FINALIZADO: 'finalizado'
    };

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

    function ehPaginaInicialCurso() {
        const url = window.location.href;
        return url.includes('/course/') &&
               !url.includes('/task/') &&
               !url.includes('/classpage/');
    }

    // ========== FUNÇÕES DE ESPERA ROBUSTAS ==========
    function aguardarElemento(selector, timeout = TIMEOUT_ELEMENTO) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();

            const verificar = () => {
                const elemento = document.querySelector(selector);
                if (elemento) {
                    resolve(elemento);
                    return;
                }

                if (Date.now() - startTime >= timeout) {
                    reject(new Error(`Timeout aguardando elemento: ${selector}`));
                    return;
                }

                setTimeout(verificar, 500);
            };

            verificar();
        });
    }

    function aguardarPaginaCarregada() {
        return new Promise((resolve) => {
            const verificar = () => {
                if (document.readyState === 'complete') {
                    setTimeout(resolve, 2000);
                } else {
                    setTimeout(verificar, 500);
                }
            };
            verificar();
        });
    }

    function aguardarMenuLateralCarregado() {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();

            const verificar = () => {
                const menuLateral = document.querySelector('div[data-section-id]');
                const temAulas = document.querySelectorAll('a[href*="/task/"]').length > 0;

                if (menuLateral && temAulas) {
                    console.log('[Auto-Capture] ✅ Menu lateral carregado');
                    resolve(true);
                    return;
                }

                if (Date.now() - startTime >= TIMEOUT_ELEMENTO) {
                    reject(new Error('Timeout aguardando menu lateral'));
                    return;
                }

                setTimeout(verificar, 500);
            };

            verificar();
        });
    }

    // ========== EXTRAÇÃO DE NOME DO CURSO ==========
    function extrairNomeCurso(url) {
        const match = url.match(/\/course\/([^\/\?#]+)/);
        return match ? match[1] : 'curso_desconhecido';
    }

    function obterCursoAtual() {
        const url = window.location.href;
        const match = url.match(/\/course\/([^\/\?#]+)/);
        if (match) {
            return {
                url: `https://cursos.alura.com.br/course/${match[1]}`,
                nome: match[1]
            };
        }
        return null;
    }

    function obterCursoAtualClasspage() {
        const url = window.location.href;
        const match = url.match(/\/classpage\/([^\/\?#]+)/);
        if (match) {
            return {
                url: url,
                nome: match[1]
            };
        }
        return null;
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
            const maxTentativas = TIMEOUT_CONTEUDO / 500;

            const verificar = () => {
                tentativas++;

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

                setTimeout(verificar, 500);
            };

            verificar();
        });
    }

    // ========== ENCONTRAR BOTÃO DE AULAS (MÚLTIPLAS ESTRATÉGIAS) ==========
    function encontrarBotaoAulas() {
        console.log('[Auto-Capture] 🔍 Procurando botão para página de aulas...');

        const todosLinks = Array.from(document.querySelectorAll('a'));

        // Estratégia 1: Link com texto "Ver primeiro vídeo" ou "Ver primeira aula"
        for (const link of todosLinks) {
            const texto = link.innerText.toLowerCase().trim();
            if (texto.includes('ver primeiro vídeo') || texto.includes('ver primeira aula')) {
                console.log('[Auto-Capture] ✅ Estratégia 1: Encontrado link "Ver primeiro vídeo"');
                return link;
            }
        }

        // Estratégia 2: Primeiro link que contém /task/ na URL (mas não é section)
        for (const link of todosLinks) {
            const href = link.getAttribute('href') || '';
            if (href.includes('/task/') && !href.includes('/section/')) {
                console.log('[Auto-Capture] ✅ Estratégia 2: Encontrado primeiro link /task/');
                return link;
            }
        }

        // Estratégia 3: Link dentro de seção com /section/ e /tasks
        for (const link of todosLinks) {
            const href = link.getAttribute('href') || '';
            if (href.includes('/section/') && href.includes('/tasks')) {
                console.log('[Auto-Capture] ✅ Estratégia 3: Encontrado link de seção');
                return link;
            }
        }

        // Estratégia 4: Qualquer link com texto genérico relacionado
        for (const link of todosLinks) {
            const texto = link.innerText.toLowerCase().trim();
            const href = link.getAttribute('href') || '';

            if ((texto.includes('ver aula') || texto.includes('ver conteúdo') ||
                 texto.includes('começar') || texto.includes('ir para') ||
                 texto.includes('iniciar')) &&
                (href.includes('/course/') || href.includes('/task/') || href.includes('/classpage/'))) {
                console.log(`[Auto-Capture] ✅ Estratégia 4: Encontrado link "${texto}"`);
                return link;
            }
        }

        return null;
    }

    // ========== BAIXAR AULA ATUAL ==========
    async function baixarAulaAtual() {
        console.log('[Auto-Capture] 📥 Iniciando download da aula atual...');

        const cursoInfo = obterCursoAtualClasspage();
        if (!cursoInfo) {
            alert('❌ Não foi possível identificar o curso atual.');
            return;
        }

        const nomeCurso = cursoInfo.nome;
        console.log(`[Auto-Capture] 📚 Curso: ${nomeCurso}`);

        try {
            await aguardarConteudo();
            await new Promise(resolve => setTimeout(resolve, 1000));

            if (verificarVideo()) {
                alert('⏭️ Esta aula contém vídeo e não pode ser capturada como texto.');
                return;
            }

            let tentativas = 0;
            let salvou = false;

            while (!salvou && tentativas < MAX_TENTATIVAS) {
                tentativas++;
                console.log(`[Auto-Capture] Tentativa ${tentativas}/${MAX_TENTATIVAS} de salvar...`);

                try {
                    const nomeArquivo = extrairNomeArquivo(nomeCurso);
                    const conteudoLimpo = obterConteudoLimpo();

                    if (!conteudoLimpo) {
                        throw new Error('Não foi possível extrair conteúdo');
                    }

                    const htmlCompleto = gerarHTMLCompleto(conteudoLimpo, nomeArquivo);
                    baixarHTML(htmlCompleto, nomeArquivo);

                    console.log(`[Auto-Capture] ✅ Aula salva: ${nomeArquivo}`);
                    salvou = true;

                    alert(`✅ Aula salva com sucesso!\n\nArquivo: ${nomeArquivo}`);

                } catch (e) {
                    console.error(`[Auto-Capture] ❌ Erro na tentativa ${tentativas}:`, e);

                    if (tentativas < MAX_TENTATIVAS) {
                        console.log(`[Auto-Capture] 🔄 Aguardando 2s antes de tentar novamente...`);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    } else {
                        alert(`❌ Falha ao salvar aula após ${MAX_TENTATIVAS} tentativas.\n\nErro: ${e.message}`);
                    }
                }
            }

        } catch (e) {
            console.error('[Auto-Capture] ❌ Erro ao processar aula:', e);
            alert(`❌ Erro ao processar aula:\n\n${e.message}`);
        }
    }

    // ========== FLUXO PRINCIPAL DE NAVEGAÇÃO ==========
    async function executarFluxoCurso() {
        const estado = getEstado();
        if (!estado || !estado.ativo) return;

        const cursoAtual = estado.cursos[estado.indiceCursoAtual];
        if (!cursoAtual) {
            finalizarCaptura();
            return;
        }

        console.log(`[Auto-Capture] 🚀 Executando fluxo para curso: ${cursoAtual.nome}`);
        console.log(`[Auto-Capture] 📍 Fase atual: ${estado.fase}`);

        try {
            switch (estado.fase) {
                case FASES.NAVEGANDO_CURSO:
                case FASES.AGUARDANDO_CARREGAR_CURSO:
                    await faseAguardarCursoCarregar(estado, cursoAtual);
                    break;

                case FASES.CLICANDO_BOTAO_AULAS:
                    await faseClicarBotaoAulas(estado, cursoAtual);
                    break;

                case FASES.AGUARDANDO_CARREGAR_AULAS:
                case FASES.COLETANDO_URLS:
                    await faseColetarURLs(estado, cursoAtual);
                    break;

                case FASES.PROCESSANDO_AULA:
                    await processarAulaAutomatica();
                    break;

                default:
                    console.error('[Auto-Capture] Fase desconhecida:', estado.fase);
                    avancarParaProximoCurso();
            }
        } catch (e) {
            console.error('[Auto-Capture] ❌ Erro crítico no fluxo:', e);
            alert(`❌ Erro inesperado ao processar curso ${cursoAtual.nome}:\n${e.message}\n\nPulando para o próximo curso.`);
            cursoAtual.estatisticas.erro++;
            salvarEstado(estado);
            avancarParaProximoCurso();
        }
    }

    async function faseAguardarCursoCarregar(estado, cursoAtual) {
        console.log('[Auto-Capture] ⏳ Aguardando página do curso carregar completamente...');

        await aguardarPaginaCarregada();
        console.log('[Auto-Capture] ✅ Página carregada (document.readyState = complete)');

        await new Promise(resolve => setTimeout(resolve, 3000));
        console.log('[Auto-Capture] ✅ Aguardando 3s extras para estabilizar');

        estado.fase = FASES.CLICANDO_BOTAO_AULAS;
        salvarEstado(estado);

        await faseClicarBotaoAulas(estado, cursoAtual);
    }

    async function faseClicarBotaoAulas(estado, cursoAtual) {
        console.log('[Auto-Capture] 🔍 Procurando botão para página de aulas...');

        let tentativas = 0;
        const maxTentativas = 20;
        let elemento = null;

        while (!elemento && tentativas < maxTentativas) {
            tentativas++;
            elemento = encontrarBotaoAulas();

            if (!elemento) {
                console.log(`[Auto-Capture] ⏳ Tentativa ${tentativas}/${maxTentativas} - aguardando...`);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        if (!elemento) {
            console.warn(`[Auto-Capture] ⚠️ Curso "${cursoAtual.nome}" parece estar em desenvolvimento ou sem aulas disponíveis. Ignorando e pulando para o próximo...`);

            cursoAtual.estatisticas.ignorado++;
            cursoAtual.aulasIgnoradas.push({
                motivo: 'Curso sem aulas disponíveis ou em desenvolvimento',
                timestamp: new Date().toISOString()
            });
            salvarEstado(estado);

            avancarParaProximoCurso();
            return;
        }

        console.log('[Auto-Capture] ✅ Botão encontrado! Aguardando 1s antes de clicar...');
        await new Promise(resolve => setTimeout(resolve, 1000));

        elemento.click();
        console.log('[Auto-Capture] ✅ Clique realizado!');

        estado.fase = FASES.AGUARDANDO_CARREGAR_AULAS;
        salvarEstado(estado);

        await aguardarPaginaCarregada();
        await new Promise(resolve => setTimeout(resolve, 2000));

        await faseColetarURLs(estado, cursoAtual);
    }

    async function faseColetarURLs(estado, cursoAtual) {
        console.log('[Auto-Capture] 📋 Coletando URLs das aulas...');

        try {
            await aguardarMenuLateralCarregado();
        } catch (e) {
            console.error('[Auto-Capture] ❌ Menu lateral não carregou');
            throw new Error('Menu lateral das aulas não foi encontrado');
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        const urls = coletarURLsAulasTexto();

        if (urls.length === 0) {
            console.error('[Auto-Capture] ❌ Nenhuma aula de texto encontrada');
            throw new Error('Nenhuma aula de texto encontrada neste curso');
        }

        cursoAtual.urls = urls;
        cursoAtual.indiceAtual = 0;
        estado.fase = FASES.PROCESSANDO_AULA;
        salvarEstado(estado);

        console.log(`[Auto-Capture] 📚 ${urls.length} aulas encontradas!`);

        setTimeout(() => {
            window.location.href = urls[0].url;
        }, 2000);
    }

    // ========== PROCESSAMENTO DE AULA ==========
    async function processarAulaAutomatica() {
        const estado = getEstado();
        if (!estado || !estado.ativo) return;

        const cursoAtual = estado.cursos[estado.indiceCursoAtual];
        if (!cursoAtual) {
            finalizarCaptura();
            return;
        }

        const aulaAtual = cursoAtual.indiceAtual + 1;
        const totalAulas = cursoAtual.urls.length;
        const nomeCurso = cursoAtual.nome;
        const aulaInfo = cursoAtual.urls[cursoAtual.indiceAtual];

        console.log(`[Auto-Capture] 📖 Curso: ${nomeCurso} | Aula ${aulaAtual}/${totalAulas}`);

        try {
            await aguardarConteudo();
            await new Promise(resolve => setTimeout(resolve, 1000));

            if (verificarVideo()) {
                console.log('[Auto-Capture] ⏭️ Aula com vídeo, pulando...');
                cursoAtual.estatisticas.ignorado++;
                cursoAtual.aulasIgnoradas.push({
                    nome: aulaInfo.nome,
                    url: aulaInfo.url,
                    motivo: 'Aula contém vídeo',
                    timestamp: new Date().toISOString()
                });
                salvarEstado(estado);
                avancarParaProxima();
                return;
            }

            let salvou = false;
            let tentativas = 0;

            while (!salvou && tentativas < MAX_TENTATIVAS) {
                tentativas++;
                console.log(`[Auto-Capture] Tentativa ${tentativas}/${MAX_TENTATIVAS} de salvar...`);

                try {
                    const nomeArquivo = extrairNomeArquivo(nomeCurso);
                    const conteudoLimpo = obterConteudoLimpo();

                    if (!conteudoLimpo) {
                        throw new Error('Não foi possível extrair conteúdo');
                    }

                    const htmlCompleto = gerarHTMLCompleto(conteudoLimpo, nomeArquivo);
                    baixarHTML(htmlCompleto, nomeArquivo);

                    cursoAtual.estatisticas.sucesso++;
                    cursoAtual.aulasSalvas.push({
                        nome: aulaInfo.nome,
                        url: aulaInfo.url,
                        arquivo: nomeArquivo,
                        timestamp: new Date().toISOString()
                    });
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
                cursoAtual.estatisticas.erro++;
                cursoAtual.aulasComErro.push({
                    nome: aulaInfo.nome,
                    url: aulaInfo.url,
                    motivo: `Falha após ${MAX_TENTATIVAS} tentativas`,
                    timestamp: new Date().toISOString()
                });
                salvarEstado(estado);
            }

            setTimeout(() => {
                avancarParaProxima();
            }, DELAY_APOS_SALVAR);

        } catch (e) {
            console.error('[Auto-Capture] ❌ Erro ao processar aula:', e);
            cursoAtual.estatisticas.erro++;
            cursoAtual.aulasComErro.push({
                nome: aulaInfo.nome,
                url: aulaInfo.url,
                motivo: e.message,
                timestamp: new Date().toISOString()
            });
            salvarEstado(estado);
            avancarParaProxima();
        }
    }

    function avancarParaProxima() {
        const estado = getEstado();
        if (!estado) return;

        const cursoAtual = estado.cursos[estado.indiceCursoAtual];
        cursoAtual.indiceAtual++;
        salvarEstado(estado);

        if (cursoAtual.indiceAtual >= cursoAtual.urls.length) {
            console.log(`[Auto-Capture] 🎉 Curso "${cursoAtual.nome}" concluído!`);
            avancarParaProximoCurso();
            return;
        }

        const proximaURL = cursoAtual.urls[cursoAtual.indiceAtual].url;
        console.log(`[Auto-Capture] ➡️ Navegando para próxima aula...`);

        setTimeout(() => {
            window.location.href = proximaURL;
        }, DELAY_ENTRE_AULAS);
    }

    function avancarParaProximoCurso() {
        const estado = getEstado();
        if (!estado) return;

        estado.indiceCursoAtual++;
        salvarEstado(estado);

        if (estado.indiceCursoAtual >= estado.cursos.length) {
            finalizarCaptura();
            return;
        }

        const proximoCurso = estado.cursos[estado.indiceCursoAtual];
        console.log(`[Auto-Capture] 🔄 Iniciando próximo curso: ${proximoCurso.nome}`);

        estado.fase = FASES.NAVEGANDO_CURSO;
        salvarEstado(estado);

        setTimeout(() => {
            window.location.href = proximoCurso.url;
        }, DELAY_ENTRE_CURSOS);
    }

    function finalizarCaptura() {
        const estado = getEstado();
        if (!estado) return;

        estado.ativo = false;
        estado.fase = FASES.FINALIZADO;
        salvarEstado(estado);

        setTimeout(() => {
            let totalSucesso = 0, totalIgnorado = 0, totalErro = 0;
            let resumoCursos = '';

            estado.cursos.forEach((curso, i) => {
                totalSucesso += curso.estatisticas.sucesso;
                totalIgnorado += curso.estatisticas.ignorado;
                totalErro += curso.estatisticas.erro;

                let status = '✅ OK';
                if (curso.estatisticas.erro > 0) status = '⚠️ Com erros';
                if (curso.estatisticas.sucesso === 0 && curso.estatisticas.ignorado > 0) status = '⏭️ Vazio/Desenvolvimento';

                resumoCursos += `\n${i+1}. ${curso.nome}: ${status} (${curso.estatisticas.sucesso} ok / ${curso.estatisticas.ignorado} ign / ${curso.estatisticas.erro} err)`;
            });

            const mensagem = `
✅ Captura Concluída!

📚 Cursos processados: ${estado.cursos.length}
${resumoCursos}

📊 Total Geral:
• Aulas salvas com sucesso: ${totalSucesso}
• Cursos/Aulas ignorados (vídeo ou em desenvolvimento): ${totalIgnorado}
• Aulas com erro: ${totalErro}

📄 Um relatório detalhado foi gerado e baixado.

O estado da automação foi limpo.
            `.trim();

            alert(mensagem);
            console.log('[Auto-Capture]', mensagem);

            // Gerar e baixar relatório detalhado
            const relatorio = gerarRelatorioDetalhado(estado);
            baixarRelatorio(relatorio);

            setTimeout(() => {
                limparEstado();
                atualizarPainel();
            }, 5000);
        }, 1000);
    }

    // ========== GERAÇÃO DE RELATÓRIO ==========
    function gerarRelatorioDetalhado(estado) {
        const dataInicio = new Date(estado.dataInicio);
        const dataFim = new Date();
        const duracao = Math.round((dataFim - dataInicio) / 1000 / 60);

        let relatorio = `
================================================================================
                    RELATÓRIO DE CAPTURA AUTOMÁTICA - ALURA
================================================================================

Data de Início: ${dataInicio.toLocaleString('pt-BR')}
Data de Término: ${dataFim.toLocaleString('pt-BR')}
Duração Total: ${duracao} minuto(s)

================================================================================
                              RESUMO GERAL
================================================================================

Total de Cursos Processados: ${estado.cursos.length}

`;

        let totalSucesso = 0, totalIgnorado = 0, totalErro = 0;

        estado.cursos.forEach(curso => {
            totalSucesso += curso.estatisticas.sucesso;
            totalIgnorado += curso.estatisticas.ignorado;
            totalErro += curso.estatisticas.erro;
        });

        relatorio += `Aulas Salvas com Sucesso: ${totalSucesso}
Aulas Ignoradas: ${totalIgnorado}
Aulas com Erro: ${totalErro}

`;

        if (totalErro > 0) {
            relatorio += `⚠️  ATENÇÃO: ${totalErro} aula(s) não foram capturadas devido a erros.
   Verifique a seção "AULAS COM ERRO" abaixo para mais detalhes.

`;
        }

        relatorio += `
================================================================================
                         DETALHES POR CURSO
================================================================================
`;

        estado.cursos.forEach((curso, index) => {
            relatorio += `
--------------------------------------------------------------------------------
CURSO ${index + 1}: ${curso.nome}
--------------------------------------------------------------------------------
URL: ${curso.url}

Status: `;

            if (curso.estatisticas.sucesso > 0 && curso.estatisticas.erro === 0) {
                relatorio += `✅ SUCESSO COMPLETO`;
            } else if (curso.estatisticas.erro > 0) {
                relatorio += `⚠️  COM ERROS`;
            } else if (curso.estatisticas.sucesso === 0 && curso.estatisticas.ignorado > 0) {
                relatorio += `⏭️  VAZIO/DESENVOLVIMENTO`;
            } else {
                relatorio += `❌ FALHA`;
            }

            relatorio += `

Estatísticas:
  • Aulas salvas: ${curso.estatisticas.sucesso}
  • Aulas ignoradas: ${curso.estatisticas.ignorado}
  • Aulas com erro: ${curso.estatisticas.erro}
`;

            // Aulas salvas com sucesso
            if (curso.aulasSalvas && curso.aulasSalvas.length > 0) {
                relatorio += `
  📚 AULAS SALVAS COM SUCESSO (${curso.aulasSalvas.length}):
`;
                curso.aulasSalvas.forEach((aula, i) => {
                    relatorio += `     ${i + 1}. ${aula.nome}
        Arquivo: ${aula.arquivo}
        URL: ${aula.url}
        Capturado em: ${new Date(aula.timestamp).toLocaleString('pt-BR')}

`;
                });
            }

            // Aulas ignoradas
            if (curso.aulasIgnoradas && curso.aulasIgnoradas.length > 0) {
                relatorio += `
  ⏭️  AULAS/CURSOS IGNORADOS (${curso.aulasIgnoradas.length}):
`;
                curso.aulasIgnoradas.forEach((aula, i) => {
                    relatorio += `     ${i + 1}. ${aula.nome || 'Curso inteiro'}
        Motivo: ${aula.motivo}
        URL: ${aula.url || curso.url}
        Registrado em: ${new Date(aula.timestamp).toLocaleString('pt-BR')}

`;
                });
            }

            // Aulas com erro
            if (curso.aulasComErro && curso.aulasComErro.length > 0) {
                relatorio += `
  ❌ AULAS COM ERRO (${curso.aulasComErro.length}):
`;
                curso.aulasComErro.forEach((aula, i) => {
                    relatorio += `     ${i + 1}. ${aula.nome}
        Motivo do Erro: ${aula.motivo}
        URL: ${aula.url}
        Erro registrado em: ${new Date(aula.timestamp).toLocaleString('pt-BR')}

`;
                });
            }
        });

        relatorio += `
================================================================================
                              CONCLUSÃO
================================================================================

A captura automática foi concluída em ${dataFim.toLocaleString('pt-BR')}.

`;

        if (totalErro > 0) {
            relatorio += `⚠️  RECOMENDAÇÃO:
   ${totalErro} aula(s) não foram capturadas. Você pode:
   1. Verificar manualmente essas aulas no site da Alura
   2. Tentar capturá-las novamente executando o script
   3. Verificar se há problemas de conexão ou permissões

`;
        }

        if (totalIgnorado > 0) {
            relatorio += `ℹ️  NOTA:
   ${totalIgnorado} aula(s) foram ignoradas por serem vídeos ou por estarem
   em desenvolvimento. Isso é normal e esperado.

`;
        }

        relatorio += `================================================================================
                           FIM DO RELATÓRIO
================================================================================
`;

        return relatorio;
    }

    function baixarRelatorio(conteudo) {
        const data = new Date();
        const timestamp = data.toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const nomeArquivo = `relatorio_captura_alura_${timestamp}.txt`;

        const blob = new Blob([conteudo], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(`[Auto-Capture] 📄 Relatório baixado: ${nomeArquivo}`);
    }

    // ========== FUNÇÕES DE SALVAMENTO ==========
    function verificarVideo() {
        return document.querySelector('video') ||
               document.querySelector('.video-js') ||
               document.querySelector('[class*="video-player"]');
    }

    function extrairNomeArquivo(prefixoCurso) {
        try {
            const pathAtual = window.location.pathname;
            const linkAulaAtual = document.querySelector(`a[href="${pathAtual}"]`);

            if (linkAulaAtual) {
                const secaoAtual = linkAulaAtual.closest('div[data-section-id]');

                if (secaoAtual) {
                    const textoSecao = secaoAtual.querySelector('button div.flex.items-center.gap-1')?.innerText.trim();

                    const matchSecao = textoSecao?.match(/(?:Se[cç][aã]o|Aula)\s*(\d+)/i);
                    const numeroSecao = matchSecao ? matchSecao[1].padStart(2, '0') : '00';

                    const textoAula = linkAulaAtual.querySelector('span.text-sm.text-balance')?.innerText.trim();
                    let nomeAulaFormatado = textoAula || 'Aula';

                    const matchAula = nomeAulaFormatado.match(/^(\d+)\.(.*)$/);
                    if (matchAula) {
                        nomeAulaFormatado = `${matchAula[1].padStart(2, '0')} - ${matchAula[2]}`;
                    }

                    const nomeArquivo = `${prefixoCurso} - ${numeroSecao}-${nomeAulaFormatado}`;
                    return nomeArquivo.replace(/[\\/:"*?<>|]+/g, '_').trim() + '.html';
                }
            }
        } catch (e) {
            console.error('[Gerar HTML] Erro ao extrair nome do arquivo:', e);
        }

        const tituloOriginal = document.title;
        const match = tituloOriginal.match(/>\s*(.*?)\s*\|/);
        if (match && match[1]) {
            return `${prefixoCurso} - ${match[1].trim()}`.replace(/[\\/:"*?<>|]+/g, '_') + '.html';
        }
        return `${prefixoCurso} - Atividade_Alura.html`;
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

    // ========== MODAL DE LINKS ==========
    function criarModalLinks(callback) {
        const existente = document.getElementById('modal-links-cursos');
        if (existente) existente.remove();

        const overlay = document.createElement('div');
        overlay.id = 'modal-links-cursos';
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.6);
            z-index: 9999999;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Google Sans', 'Roboto', sans-serif;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 28px;
            width: 90%;
            max-width: 600px;
            max-height: 85vh;
            overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        `;

        modal.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="margin: 0; color: #2A7AE4; font-size: 22px;">📚 Cursos para Captura</h2>
                <button id="fechar-modal" style="
                    background: none; border: none; font-size: 28px;
                    cursor: pointer; color: #666; padding: 0;
                    width: 32px; height: 32px; line-height: 1;
                ">×</button>
            </div>

            <p style="color: #666; font-size: 14px; margin-bottom: 16px;">
                Informe os links dos cursos (um por linha). Exemplo:<br>
                <code style="background: #f6f8fa; padding: 2px 6px; border-radius: 4px; font-size: 12px;">
                    https://cursos.alura.com.br/course/nome-do-curso
                </code>
            </p>

            <textarea id="lista-links" placeholder="Cole aqui os links dos cursos, um por linha..." style="
                width: 100%;
                min-height: 250px;
                padding: 12px;
                border: 2px solid #d0d7de;
                border-radius: 8px;
                font-family: 'JetBrains Mono', monospace;
                font-size: 13px;
                resize: vertical;
                margin-bottom: 16px;
                line-height: 1.5;
            "></textarea>

            <div id="preview-links" style="
                background: #f0f9ff;
                border: 1px solid #bae6fd;
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 16px;
                font-size: 13px;
                color: #0369a1;
                display: none;
            "></div>

            <div style="display: flex; gap: 10px;">
                <button id="btn-preview" style="
                    flex: 1;
                    background: #f6f8fa;
                    color: #24292f;
                    border: 1px solid #d0d7de;
                    padding: 12px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: bold;
                ">🔍 Verificar Links</button>

                <button id="btn-iniciar-modal" style="
                    flex: 2;
                    background: #2A7AE4;
                    color: white;
                    border: none;
                    padding: 12px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: bold;
                ">🚀 Iniciar Captura</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        document.getElementById('fechar-modal').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        document.getElementById('btn-preview').onclick = () => {
            const texto = document.getElementById('lista-links').value;
            const links = parseLinks(texto);
            const preview = document.getElementById('preview-links');

            if (links.length === 0) {
                preview.style.display = 'block';
                preview.innerHTML = '⚠️ Nenhum link válido encontrado.';
                return;
            }

            preview.style.display = 'block';
            preview.innerHTML = `
                <strong>✅ ${links.length} curso(s) encontrado(s):</strong><br>
                ${links.map((l, i) => `${i+1}. <strong>${l.nome}</strong>`).join('<br>')}
            `;
        };

        document.getElementById('btn-iniciar-modal').onclick = () => {
            const texto = document.getElementById('lista-links').value;
            const links = parseLinks(texto);

            if (links.length === 0) {
                alert('❌ Nenhum link válido encontrado!\n\nInforme pelo menos um link de curso.');
                return;
            }

            const confirmar = confirm(
                `📚 Iniciar Captura Multi-Curso\n\n` +
                `${links.length} curso(s) encontrado(s):\n` +
                links.map((l, i) => `${i+1}. ${l.nome}`).join('\n') +
                `\n\nDeseja iniciar?`
            );

            if (confirmar) {
                overlay.remove();
                callback(links);
            }
        };
    }

    function parseLinks(texto) {
        const linhas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const links = [];
        const vistos = new Set();

        for (const linha of linhas) {
            const match = linha.match(/cursos\.alura\.com\.br\/course\/([^\/\?#\s]+)/);
            if (match) {
                const nome = match[1];
                const url = `https://cursos.alura.com.br/course/${nome}`;
                if (!vistos.has(url)) {
                    vistos.add(url);
                    links.push({ url, nome });
                }
            }
        }

        return links;
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
            min-width: 340px;
            max-width: 420px;
        `;

        painel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; color: #2A7AE4; font-size: 18px; font-weight: bold;">
                    📥 Captura Multi-Curso
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
            const cursoAtual = estado.cursos[estado.indiceCursoAtual];
            const progressoCurso = cursoAtual && cursoAtual.urls.length > 0
                ? ((cursoAtual.indiceAtual) / cursoAtual.urls.length * 100).toFixed(1)
                : 0;
            const progressoGeral = ((estado.indiceCursoAtual) / estado.cursos.length * 100).toFixed(1);

            let totalSucesso = 0, totalIgnorado = 0, totalErro = 0;
            estado.cursos.forEach(c => {
                totalSucesso += c.estatisticas.sucesso || 0;
                totalIgnorado += c.estatisticas.ignorado || 0;
                totalErro += c.estatisticas.erro || 0;
            });

            const faseTexto = {
                [FASES.NAVEGANDO_CURSO]: '🚀 Navegando para curso...',
                [FASES.AGUARDANDO_CARREGAR_CURSO]: '⏳ Aguardando página carregar...',
                [FASES.CLICANDO_BOTAO_AULAS]: '🔍 Procurando botão de aulas...',
                [FASES.AGUARDANDO_CARREGAR_AULAS]: '⏳ Aguardando página de aulas...',
                [FASES.COLETANDO_URLS]: '📋 Coletando URLs das aulas...',
                [FASES.PROCESSANDO_AULA]: '📖 Processando aula...',
                [FASES.FINALIZADO]: '✅ Finalizado'
            };

            conteudo.innerHTML = `
                <div style="margin-bottom: 12px; padding: 10px; background: #fef3c7; border-radius: 6px; border-left: 4px solid #f59e0b; font-size: 13px; color: #92400e;">
                    <strong>Fase:</strong> ${faseTexto[estado.fase] || estado.fase}
                </div>

                <div style="margin-bottom: 12px; padding: 10px; background: #f0f9ff; border-radius: 6px; border-left: 4px solid #2A7AE4;">
                    <div style="font-size: 12px; color: #0369a1; margin-bottom: 4px;">
                        📚 Curso ${estado.indiceCursoAtual + 1}/${estado.cursos.length}
                    </div>
                    <div style="font-size: 14px; font-weight: bold; color: #0c4a6e; word-break: break-all;">
                        ${cursoAtual?.nome || '...'}
                    </div>
                </div>

                <div style="margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span style="font-size: 13px; color: #666;">Aulas do curso:</span>
                        <span style="font-size: 13px; font-weight: bold; color: #2A7AE4;">
                            ${cursoAtual?.indiceAtual || 0}/${cursoAtual?.urls.length || 0}
                        </span>
                    </div>
                    <div style="background: #f6f8fa; border-radius: 4px; overflow: hidden; height: 16px;">
                        <div style="background: #2A7AE4; height: 100%; width: ${progressoCurso}%; transition: width 0.3s;"></div>
                    </div>
                </div>

                <div style="margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span style="font-size: 13px; color: #666;">Progresso geral:</span>
                        <span style="font-size: 13px; font-weight: bold; color: #16a34a;">
                            ${progressoGeral}%
                        </span>
                    </div>
                    <div style="background: #f6f8fa; border-radius: 4px; overflow: hidden; height: 10px;">
                        <div style="background: #16a34a; height: 100%; width: ${progressoGeral}%; transition: width 0.3s;"></div>
                    </div>
                </div>

                <div style="background: #f0fdf4; padding: 10px; border-radius: 6px; margin-bottom: 14px; font-size: 12px;">
                    <div style="color: #166534; margin-bottom: 2px;">✅ Sucesso: ${totalSucesso}</div>
                    <div style="color: #166534; margin-bottom: 2px;">⏭️ Ignorados: ${totalIgnorado}</div>
                    <div style="color: #166534;">❌ Erros: ${totalErro}</div>
                </div>

                <button id="parar-captura" style="
                    width: 100%;
                    background: #EE0F0F;
                    color: white;
                    border: none;
                    padding: 10px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: bold;
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
            const cursoAtual = obterCursoAtual();
            const cursoClasspage = obterCursoAtualClasspage();
            const estaEmCurso = ehPaginaInicialCurso() && cursoAtual;
            const estaEmAula = ehPaginaDeAula() && cursoClasspage;

            let botoesHTML = `
                <p style="color: #666; font-size: 13px; margin-bottom: 14px;">
                    Escolha como deseja iniciar a captura:
                </p>
            `;

            if (estaEmAula) {
                botoesHTML += `
                    <button id="baixar-aula-atual" style="
                        width: 100%;
                        background: #f59e0b;
                        color: white;
                        border: none;
                        padding: 12px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 15px;
                        font-weight: bold;
                        margin-bottom: 8px;
                    ">📥 Baixar Esta Aula</button>
                `;
            }

            if (estaEmCurso) {
                botoesHTML += `
                    <button id="capturar-curso-atual" style="
                        width: 100%;
                        background: #16a34a;
                        color: white;
                        border: none;
                        padding: 12px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 15px;
                        font-weight: bold;
                        margin-bottom: 8px;
                    ">🎯 Capturar Este Curso (${cursoAtual.nome})</button>
                `;
            }

            botoesHTML += `
                <button id="informar-cursos" style="
                    width: 100%;
                    background: #2A7AE4;
                    color: white;
                    border: none;
                    padding: 12px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 15px;
                    font-weight: bold;
                    margin-bottom: 8px;
                ">📋 Informar Lista de Cursos</button>

                <button id="limpar-estado" style="
                    width: 100%;
                    background: #f6f8fa;
                    color: #666;
                    border: 1px solid #d0d7de;
                    padding: 8px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 13px;
                ">🗑️ Limpar Estado (se travou)</button>
            `;

            conteudo.innerHTML = botoesHTML;

            if (estaEmAula) {
                document.getElementById('baixar-aula-atual').onclick = () => {
                    baixarAulaAtual();
                };
            }

            if (estaEmCurso) {
                document.getElementById('capturar-curso-atual').onclick = () => {
                    const confirmar = confirm(
                        `🎯 Capturar Curso Atual\n\n` +
                        `Curso: ${cursoAtual.nome}\n\n` +
                        `Deseja iniciar a captura das aulas deste curso?`
                    );

                    if (confirmar) {
                        iniciarCapturaMultiCurso([cursoAtual]);
                    }
                };
            }

            document.getElementById('informar-cursos').onclick = () => {
                criarModalLinks((links) => {
                    iniciarCapturaMultiCurso(links);
                });
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

    function iniciarCapturaMultiCurso(links) {
        const estado = {
            cursos: links.map(link => ({
                url: link.url,
                nome: link.nome,
                urls: [],
                indiceAtual: 0,
                estatisticas: { sucesso: 0, erro: 0, ignorado: 0 },
                aulasSalvas: [],
                aulasComErro: [],
                aulasIgnoradas: []
            })),
            indiceCursoAtual: 0,
            fase: FASES.NAVEGANDO_CURSO,
            ativo: true,
            dataInicio: new Date().toISOString()
        };

        salvarEstado(estado);

        alert(
            `✅ Captura iniciada!\n\n` +
            `A automação começará em 3 segundos.\n\n` +
            `⚠️ IMPORTANTE:\n` +
            `• Não feche esta aba\n` +
            `• Os arquivos serão salvos na pasta de downloads\n` +
            `• Cada arquivo terá o prefixo do nome do curso\n` +
            `• Cursos sem aulas disponíveis serão ignorados automaticamente\n` +
            `• Ao final, um relatório TXT detalhado será gerado\n\n` +
            `Total de cursos: ${links.length}`
        );

        setTimeout(() => {
            window.location.href = links[0].url;
        }, 3000);
    }

    // ========== INICIALIZAÇÃO ==========
    function inicializar() {
        if (!isAutoMode()) {
            setTimeout(() => {
                criarPainel();
                atualizarPainel();
            }, 2000);
            return;
        }

        const estado = getEstado();
        if (!estado) return;

        criarPainel();
        atualizarPainel();

        setTimeout(() => {
            executarFluxoCurso();
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
            console.log('[Auto-Capture] 🔄 URL mudou, reinicializando...');
            setTimeout(inicializar, 2000);
        }
    }).observe(document, { subtree: true, childList: true });

})();