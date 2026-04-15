let obrig = [];
let cursadas = JSON.parse(localStorage.getItem('cursadas_ufmt')) || [];
let plano = JSON.parse(localStorage.getItem('plano_ufmt')) || {};
let baseColegiado = { organizacao: "UFMT", ultima_atualizacao: "", alunos: [] };
let semestreAtivo = "";

const REGRAS_PPC = {
    "2014": { min: 10, max: 15, dil: 17.5 },
    "2020": { min: 8, max: 12, dil: 14 },
    "2025": { min: 10, max: 15, dil: 17.5 },
    "2026": { min: 10, max: 15, dil: 17.5 }
};

const REGRAS_OFERTA = {
    "2026/1": { "20261": [1], "20251": [2, 4, 6, 8, 9, 10] },
    "2026/2": { "20261": [2], "20251": [3, 5, 7, 9, 10] },
    "2027/1": { "20261": [1, 3], "20251": [4, 6, 8, 9, 10] },
    "2027/2": { "20261": [2, 4], "20251": [5, 7, 9, 10] },
    "2028/1": { "20261": [1, 3, 5], "20251": [6, 8, 9, 10] },
    "2028/2": { "20261": [2, 4, 6], "20251": [7, 9, 10] },
    "2029/1": { "20261": [1, 3, 5, 7], "20251": [8, 9, 10] },
    "2029/2": { "20261": [2, 4, 6, 8, 9, 10], "20251": [] }
};

// --- CARREGAMENTO INICIAL ---
async function carregar() {
    try {
        const res = await fetch('./data/disciplinas_obrigatorias.json');
        obrig = await res.json();
        preencherSeletores();
        carregarInfoAdicional();
        const sems = Object.keys(plano).sort();
        if (sems.length > 0) semestreAtivo = sems[0];
        renderizarTudo();
    } catch (e) { alert("Erro ao carregar banco de dados."); }
}

function getNomeDisc(codigo) { return obrig.find(d => d.codigo === codigo)?.nome || codigo; }

function preencherSeletores() {
    const ano = new Date().getFullYear();
    const ids = ['selectSemestreInicial', 'selectSemestreRelatorio'];
    ids.forEach(id => {
        const sel = document.getElementById(id); if(!sel) return;
        sel.innerHTML = "";
        for (let i = -3; i < 7; i++) {
            for (let s = 1; s <= 2; s++) { sel.add(new Option(`${ano+i}/${s}`, `${ano+i}/${s}`)); }
        }
    });
}

// --- CÁLCULOS DE PRAZOS E PROGRESSO (RESTAURADO) ---
function calcularPrazos() {
    const anoI = parseInt(document.getElementById('ingressoAno').value);
    const semI = parseInt(document.getElementById('ingressoSemestre').value);
    const ppc = document.getElementById('ppcIngresso').value;
    const tranc = parseInt(document.getElementById('trancamentos').value) || 0;
    const regra = REGRAS_PPC[ppc];

    if (!regra || isNaN(anoI)) return;

    // 1. Cálculo de Semestres Decorridos (Baseado no primeiro semestre do plano vs Ingresso)
    const semsPlan = Object.keys(plano).sort();
    let cursadosSem = 0;
    if (semsPlan.length > 0) {
        const [aP, sP] = semsPlan[0].split('/').map(Number);
        cursadosSem = (aP * 2 + (sP - 1)) - (anoI * 2 + (semI - 1)) - tranc;
    }

    // 2. Cálculo de Progresso por Carga Horária
    let chT = 0, chC = 0;
    obrig.forEach(d => {
        let v = parseInt(d.carga_horaria) || 0;
        chT += v;
        if (cursadas.includes(d.codigo)) chC += v;
    });
    const prog = chT > 0 ? ((chC / chT) * 100).toFixed(1) : 0;

    // 3. Função Auxiliar para formatar semestres futuros
    const fSem = (a, s, q) => {
        let t = (a * 2 + (s - 1)) + (q - 1);
        return `${Math.floor(t / 2)}/${(t % 2) + 1}`;
    };

    // 4. Renderização dos 4 Cards
    const painel = document.getElementById('painelPrazos');
    if (painel) {
        painel.innerHTML = `
            <div class="card-prazo"><b>Mínimo</b><span>${fSem(anoI, semI, regra.min + tranc)}</span></div>
            <div class="card-prazo"><b>Máximo Normal</b><span>${fSem(anoI, semI, regra.max + tranc)}</span></div>
            <div class="card-prazo"><b>Dilação</b><span>${fSem(anoI, semI, Math.floor(regra.dil) + tranc)}</span></div>
            <div class="card-prazo" style="border-top: 3px solid var(--success)">
                <b>Semestres / Progresso</b>
                <span>${cursadosSem < 0 ? 0 : cursadosSem} (${prog}%)</span>
            </div>
        `;
    }
}
function renderizarTudo() {
    const filterEl = document.getElementById('filtroPPC');
    const ppcKey = filterEl ? `ppc_${filterEl.value}` : "ppc_20261";
    const mapaPlano = {};

    // Mapeia o que está planejado para saber em qual semestre aparece
    Object.entries(plano).forEach(([s, c]) => c.forEach(id => mapaPlano[id] = s));

    const boxFlux = document.getElementById('checklistObrigatorias');
    if (boxFlux) {
        boxFlux.innerHTML = '';
        const semsData = {};

        // Organiza as disciplinas por semestre do PPC
        obrig.forEach(d => {
            if(d[ppcKey]) (semsData[d[ppcKey]] = semsData[d[ppcKey]] || []).push(d);
        });

        Object.keys(semsData).sort((a,b)=>a-b).forEach(s => {
            const col = document.createElement('div');
            col.className = 'coluna-semestre';
            col.innerHTML = `<h4>${s}º Semestre</h4>`;

            semsData[s].forEach(d => {
                const isC = cursadas.includes(d.codigo);
                const pS = mapaPlano[d.codigo];
                const pre = d.prerequisitos || [];
                // Verifica se o aluno já cursou os pré-requisitos
                const cumpre = pre.every(p => cursadas.includes(p));
                const preNomes = pre.map(c => getNomeDisc(c)).join(', ');

                const item = document.createElement('div');
                // Alerta se não cursou e não cumpre os requisitos
                const alertaLateral = (!isC && !cumpre) ? 'alerta-pre-lateral' : '';

                item.className = `item-check ${isC ? 'active' : (pS ? 'is-planned' : 'not-taken')} ${alertaLateral}`;

                item.innerHTML = `
                    ${isC ? '<span class="icon-ok">✓</span>' : ''}
                    <strong>${d.codigo}</strong> ${d.nome}
                    <div class="status-label">
                        ${isC ? 'Cursada' : (pS ? 'Planejada: ' + pS : 'Não cursada')}
                    </div>
                    ${pre.length && !isC ? `<div class="tag-pre">Req: ${preNomes}</div>` : ''}
                `;

                item.onclick = () => toggle(d.codigo);
                col.appendChild(item);
            });
            boxFlux.appendChild(col);
        });
    }

    renderizarPendencias();
    renderizarGrade();
    calcularPrazos();

    localStorage.setItem('cursadas_ufmt', JSON.stringify(cursadas));
    localStorage.setItem('plano_ufmt', JSON.stringify(plano));
}
function renderizarPendencias() {
    const box = document.getElementById('listaDisponiveis'); if (!box) return; box.innerHTML = '';
    const info = document.getElementById('infoFiltroOferta');
    if (!semestreAtivo) { info.innerText = "⚠️ Selecione um semestre no plano"; return; }

    info.innerText = `✅ Oferta para ${semestreAtivo}`;
    const ja = [...cursadas, ...Object.values(plano).flat()];
    const ofertaRef = REGRAS_OFERTA[semestreAtivo];

    obrig.filter(d => {
        if(ja.includes(d.codigo)) return false;
        if(!ofertaRef) return true;
        return (ofertaRef["20261"]?.includes(d.ppc_20261)) || (ofertaRef["20251"]?.includes(d.ppc_20251));
    }).forEach(d => {
        const div = document.createElement('div'); div.className = 'mini-card'; div.draggable = true;
        const preNomes = (d.prerequisitos || []).map(c => getNomeDisc(c)).join(', ');

        div.innerHTML = `<b>${d.codigo}</b> ${d.nome} ${preNomes ? `<div class="tag-pre">Req: ${preNomes}</div>` : ''}`;
        div.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', d.codigo));
        box.appendChild(div);
    });
}
function renderizarGrade() {
    const box = document.getElementById('gradeSemestres');
    if (!box) return;
    box.innerHTML = '';

    Object.entries(plano).sort().forEach(([sem, cods]) => {
        const col = document.createElement('div');
        col.className = `bloco-semestre-vertical ${sem === semestreAtivo ? 'selecionado' : ''}`;
        col.onclick = () => { semestreAtivo = sem; renderizarTudo(); };
        col.addEventListener('dragover', (e) => e.preventDefault());
        col.addEventListener('drop', (e) => { e.preventDefault(); moverParaSemestre(e.dataTransfer.getData('text/plain'), sem); });

        // Cálculo de créditos do semestre
        let cr = 0;
        cods.forEach(c => {
            const d = obrig.find(x => x.codigo === c);
            if(d) cr += (parseInt(d.carga_horaria) || 0) / 16;
        });

        col.innerHTML = `<h4><span>${sem} <small class="badge-creditos">${cr} CR</small></span> <span onclick="removerSemestre('${sem}')" style="cursor:pointer">×</span></h4>`;

        const grid = document.createElement('div');
        grid.className = 'grid-disciplinas';

        cods.forEach(c => {
            const d = obrig.find(x => x.codigo === c);
            const pre = d?.prerequisitos || [];
            // Filtra quais pré-requisitos ainda não foram marcados como cursados
            const faltam = pre.filter(p => !cursadas.includes(p));

            const card = document.createElement('div');
            // Adiciona a classe de alerta se houver pendência de pré-requisito
            card.className = `card-disciplina ${faltam.length > 0 ? 'alerta-pre-lateral' : ''}`;

            card.innerHTML = `
                <span class="btn-del-item" onclick="event.stopPropagation(); delDisc('${sem}','${c}')">×</span>
                <strong>${c}</strong> ${d?.nome || c}
                ${faltam.length ? `<div class="tag-pre">Falta: ${faltam.map(p => getNomeDisc(p)).join(', ')}</div>` : ''}
            `;
            grid.appendChild(card);
        });

        col.appendChild(grid);
        box.appendChild(col);
    });
}

// --- RELATÓRIO DE OFERTA ---
function gerarRelatorioOferta() {
    const semRef = document.getElementById('selectSemestreRelatorio').value;
    const regrasParaEsteSemestre = REGRAS_OFERTA[semRef];
    if (!baseColegiado.alunos || baseColegiado.alunos.length === 0) return alert("Carregue a Base Mestre primeiro.");

    let relatorioMaster = {};
    baseColegiado.alunos.filter(a => a.dados_atuais.status !== "inativo").forEach(aluno => {
        const p = aluno.dados_atuais.plano;
        if (p[semRef]) {
            p[semRef].forEach(cod => {
                const infoD = obrig.find(x => x.codigo === cod);
                let ppcEnc = "Extra", semCurr = "Extra";
                if (regrasParaEsteSemestre && infoD) {
                    for (const [pk, semPermitidos] of Object.entries(regrasParaEsteSemestre)) {
                        const semMatriz = infoD[`ppc_${pk}`];
                        if (semMatriz && semPermitidos.includes(semMatriz)) { ppcEnc = pk; semCurr = semMatriz; break; }
                    }
                }
                if (!relatorioMaster[ppcEnc]) relatorioMaster[ppcEnc] = {};
                if (!relatorioMaster[ppcEnc][semCurr]) relatorioMaster[ppcEnc][semCurr] = {};
                if (!relatorioMaster[ppcEnc][semCurr][cod]) relatorioMaster[ppcEnc][semCurr][cod] = { nome: (infoD ? infoD.nome : cod), alunos: [] };
                if (!relatorioMaster[ppcEnc][semCurr][cod].alunos.includes(aluno.nome)) relatorioMaster[ppcEnc][semCurr][cod].alunos.push(aluno.nome);
            });
        }
    });

    const container = document.getElementById('containerRelatorioOferta'); container.innerHTML = "";
    Object.keys(relatorioMaster).sort().forEach(ppc => {
        let div = document.createElement('div'); div.className = "relatorio-ppc-container";
        let label = ppc === "Extra" ? "Disciplinas Extras" : `OFERTA DO PPC ${ppc.slice(0,4)}/${ppc.slice(4)}`;
        let html = `<div class="ppc-header-banner">${label}</div>`;
        Object.keys(relatorioMaster[ppc]).sort((a,b)=>a-b).forEach(s => {
            html += `<div class="semestre-divider">${s}º Semestre Curricular</div><table class="tabela-oferta"><tr><th>Código</th><th>Disciplina</th><th>Qtd</th><th>Alunos</th></tr>`;
            Object.keys(relatorioMaster[ppc][s]).forEach(c => {
                const d = relatorioMaster[ppc][s][c];
                html += `<tr><td>${c}</td><td><strong>${d.nome}</strong></td><td align="center"><b>${d.alunos.length}</b></td><td>${d.alunos.sort().map(n=>`<span class="chip-aluno">${n}</span>`).join('')}</td></tr>`;
            });
            html += `</table>`;
        });
        div.innerHTML = html; container.appendChild(div);
    });
}

// --- GESTÃO E PERSISTÊNCIA ---
function exportarJSON() {
    const dados = { cursadas, plano, info: JSON.parse(localStorage.getItem('info_aluno_ufmt')) };
    const blob = new Blob([JSON.stringify(dados, null, 2)], {type : 'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `plano_${dados.info?.nome || 'aluno'}.json`; a.click();
}

function importarJSON(input) {
    const el = input.target ? input.target : input;
    if (!el.files || el.files.length === 0) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const d = JSON.parse(e.target.result);
            cursadas = d.cursadas || []; plano = d.plano || {};
            if (d.info) localStorage.setItem('info_aluno_ufmt', JSON.stringify(d.info));
            carregarInfoAdicional(); renderizarTudo(); alert("Sucesso!");
        } catch (err) { alert("Erro ao importar."); }
    };
    reader.readAsText(el.files[0]);
}

function importarBaseColegiado(e) {
    const el = e.target ? e.target : e;
    if (!el.files.length) return;
    const r = new FileReader();
    r.onload = (ev) => {
        try { baseColegiado = JSON.parse(ev.target.result); renderizarListaColegiado(); } catch (err) { alert("Erro ao carregar Base Mestre."); }
    };
    r.readAsText(el.files[0]);
}

function salvarAlunoNaBase() {
    const n = document.getElementById('alunoNome').value;
    const s = document.getElementById('alunoSEI').value;
    if(!n || !s) return alert("Preencha Nome e Processo SEI");
    const snap = { cursadas, plano, info: JSON.parse(localStorage.getItem('info_aluno_ufmt')), status: "ativo" };
    let a = baseColegiado.alunos.find(x => x.sei === s);
    if(a) { a.dados_atuais = snap; a.nome = n; } else { baseColegiado.alunos.push({ nome: n, sei: s, dados_atuais: snap }); }
    renderizarListaColegiado(); alert("Aluno salvo na Base Mestre!");
}

function renderizarListaColegiado() {
    const box = document.getElementById('listaAlunosColegiado'); if(!box) return; box.innerHTML = '';
    baseColegiado.alunos.forEach((a, i) => {
        const isAtivo = a.dados_atuais.status !== "inativo";
        box.innerHTML += `<div class="card-aluno-db ${isAtivo?'':'inativo'}"><b>${a.nome}</b><br><small>${a.sei}</small><br><div style="margin-top:5px; display:flex; gap:2px"><button onclick="carregarAlunoBase(${i})" class="btn-primary" style="font-size:9px; padding:2px">CARREGAR</button><button onclick="toggleStatusAluno(${i})" style="font-size:9px; padding:2px">${isAtivo?'DESATIVAR':'ATIVAR'}</button><button onclick="excluirAlunoBase(${i})" style="font-size:9px; padding:2px; color:red">EXCLUIR</button></div></div>`;
    });
}

function carregarAlunoBase(i) {
    const d = baseColegiado.alunos[i].dados_atuais; cursadas = d.cursadas; plano = d.plano;
    localStorage.setItem('info_aluno_ufmt', JSON.stringify(d.info)); carregarInfoAdicional(); renderizarTudo();
}

function toggleStatusAluno(i) { baseColegiado.alunos[i].dados_atuais.status = (baseColegiado.alunos[i].dados_atuais.status === "inativo") ? "ativo" : "inativo"; renderizarListaColegiado(); }
function excluirAlunoBase(i) { if(confirm("Excluir aluno?")) { baseColegiado.alunos.splice(i, 1); renderizarListaColegiado(); } }
function exportarBaseColegiado() { const b = new Blob([JSON.stringify(baseColegiado, null, 2)], {type:'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'BASE_MESTRE_UFMT.json'; a.click(); }

// --- AUXILIARES ---
function moverParaSemestre(cod, semAlvo) {
    const d = obrig.find(x => x.codigo === cod);
    const oferta = REGRAS_OFERTA[semAlvo];
    if (oferta && d) {
        const ok26 = d.ppc_20261 && oferta["20261"]?.includes(d.ppc_20261);
        const ok25 = d.ppc_20251 && oferta["20251"]?.includes(d.ppc_20251);
        if (!ok26 && !ok25) return alert(`ERRO: A disciplina ${d.nome} não é ofertada em ${semAlvo}.`);
    }
    Object.keys(plano).forEach(s => plano[s] = plano[s].filter(c => c !== cod));
    if(!plano[semAlvo]) plano[semAlvo] = [];
    plano[semAlvo].push(cod); renderizarTudo();
}

function delDisc(sem, cod) { plano[sem] = plano[sem].filter(c => c !== cod); renderizarTudo(); }
function toggle(c) { cursadas.includes(c) ? cursadas = cursadas.filter(x=>x!==c) : cursadas.push(c); renderizarTudo(); }
function definirSemestreInicial() { val = document.getElementById('selectSemestreInicial').value; plano = {}; plano[val] = []; renderizarTudo(); }
function acrescentarProximoSemestre() { const sems = Object.keys(plano).sort(); if(!sems.length) return; [a, s] = sems[sems.length-1].split('/').map(Number); nova = s === 1 ? `${a}/2` : `${a+1}/1`; plano[nova] = []; renderizarTudo(); }
function removerSemestre(s) { if(confirm("Remover?")) { delete plano[s]; renderizarTudo(); } }
function carregarInfoAdicional() { let i = JSON.parse(localStorage.getItem('info_aluno_ufmt')); if(i){ document.getElementById('alunoNome').value=i.nome; document.getElementById('alunoSEI').value=i.sei; document.getElementById('ingressoAno').value=i.anoIng; document.getElementById('ingressoSemestre').value=i.semIng; document.getElementById('ppcIngresso').value=i.ppcIng; document.getElementById('trancamentos').value=i.tranc; } }
function salvarInfoAdicional() { localStorage.setItem('info_aluno_ufmt', JSON.stringify({ nome: document.getElementById('alunoNome').value, sei: document.getElementById('alunoSEI').value, anoIng: document.getElementById('ingressoAno').value, semIng: document.getElementById('ingressoSemestre').value, ppcIng: document.getElementById('ppcIngresso').value, tranc: document.getElementById('trancamentos').value })); calcularPrazos(); }
function mudarAba(aba) { document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none'); document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active')); document.getElementById('aba-' + aba).style.display = 'block'; document.getElementById('btn-' + aba).classList.add('active'); renderizarTudo(); }
function limparDados() { if(confirm("Limpar tudo?")) { localStorage.clear(); location.reload(); } }
function exportarExcel() { let csv = "Semestre;Codigo;Disciplina\n"; Object.keys(plano).sort().forEach(s => { plano[s].forEach(c => { csv += `${s};${c};${getNomeDisc(c)}\n`; }); }); const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = 'plano_ufmt.csv'; a.click(); }

carregar();