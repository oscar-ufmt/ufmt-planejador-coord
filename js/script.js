let obrig = [];
let cursadas = JSON.parse(localStorage.getItem('cursadas_ufmt')) || [];
let plano = JSON.parse(localStorage.getItem('plano_ufmt')) || {};
let semestreAtivo = "";
let baseColegiado = { organizacao: "UFMT", ultima_atualizacao: "", alunos: [] };

const REGRAS_PPC = {
    "2014": { min: 10, max: 15, dil: 17.5 }, "2020": { min: 8, max: 12, dil: 14 },
    "2025": { min: 10, max: 15, dil: 17.5 }, "2026": { min: 10, max: 15, dil: 17.5 }
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

async function carregar() {
    try {
        const res = await fetch('./data/disciplinas_obrigatorias.json');
        obrig = await res.json();
        const sems = Object.keys(plano).sort();
        if (sems.length > 0) semestreAtivo = sems[sems.length - 1];
        carregarInfoAdicional();
        renderizarTudo();
    } catch (e) { alert("Erro ao carregar banco de dados JSON."); }
}

function mudarAba(aba) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('aba-' + aba).style.display = 'block';
    document.getElementById('btn-' + aba).classList.add('active');
}

function renderizarTudo() {
    const ppcVal = document.getElementById('filtroPPC').value;
    const ppcKey = `ppc_${ppcVal}`;

    // Mapeia onde cada disciplina está no planejamento
    const mapaPlano = {};
    Object.entries(plano).forEach(([s, c]) => c.forEach(id => mapaPlano[id] = s));

    const boxHist = document.getElementById('checklistObrigatorias');
    boxHist.innerHTML = '';

    const semestresData = {};
    obrig.forEach(d => { if(d[ppcKey]) { (semestresData[d[ppcKey]] = semestresData[d[ppcKey]] || []).push(d); } });

    Object.keys(semestresData).sort((a,b)=>a-b).forEach(s => {
        const col = document.createElement('div');
        col.className = 'coluna-semestre';
        col.innerHTML = `<h4>${s}º Semestre</h4>`;
        const lista = document.createElement('div');
        lista.className = 'lista-disciplinas-vertical';

        semestresData[s].forEach(d => {
            const isChecked = cursadas.includes(d.codigo);
            const isPlanned = !!mapaPlano[d.codigo]; // Verifica se está no planejamento
            const semestreDestino = mapaPlano[d.codigo]; // Pega o nome do semestre (ex: 2026/1)

            const preReqCodes = d.prerequisitos || [];
            const cumpre = preReqCodes.every(p => cursadas.includes(p));
            const preReqNomes = preReqCodes.map(c => obrig.find(o => o.codigo === c)?.nome || c).join(', ');

            // Lógica de cores:
            // 1. Verde (active) se cursada
            // 2. Azul (is-planned) se no planejamento
            // 3. Vermelho (not-planned) se não cursada E não planejada
            let statusClass = "";
            if (isChecked) statusClass = "active";
            else if (isPlanned) statusClass = "is-planned";
            else statusClass = "not-planned";

            const item = document.createElement('div');
            item.className = `item-check ${statusClass} ${!cumpre && !isChecked && !isPlanned ? 'alerta-pre' : ''}`;

            item.innerHTML = `
                <div>
                    <strong>${d.codigo}</strong><br>${d.nome}
                    ${preReqNomes ? `<div class="tag-pre">Req: ${preReqNomes}</div>` : ''}
                    ${isPlanned ? `<div class="tag-planejado">📅 Planejada p/: ${semestreDestino}</div>` : ''}
                </div>`;

            item.onclick = () => toggle(d.codigo);
            lista.appendChild(item);
        });
        col.appendChild(lista);
        boxHist.appendChild(col);
    });

    renderizarPendencias();
    renderizarGrade();
    calcularPrazos();

    localStorage.setItem('cursadas_ufmt', JSON.stringify(cursadas));
    localStorage.setItem('plano_ufmt', JSON.stringify(plano));
}

function renderizarGrade() {
    const box = document.getElementById('gradeSemestres'); box.innerHTML = '';
    Object.entries(plano).sort().forEach(([sem, cods]) => {
        const col = document.createElement('div');
        col.className = `coluna-semestre ${sem===semestreAtivo?'semestre-selecionado':''}`;
        col.onclick = () => { semestreAtivo = sem; renderizarTudo(); };
        let crTotal = 0;
        const lista = document.createElement('div');
        cods.forEach(c => {
            const d = obrig.find(x=>x.codigo===c);
            if(d) {
                crTotal += (parseInt(d.carga_horaria) || 0) / 16;
                const item = document.createElement('div'); item.className = 'card-disciplina';
                item.innerHTML = `<span style="flex:1"><b>${c}</b><br><small>${d.nome}</small></span><b onclick="event.stopPropagation(); delDisc('${sem}','${c}')" style="color:red; cursor:pointer">×</b>`;
                lista.appendChild(item);
            }
        });
        col.innerHTML = `<h4>${sem} <span class="badge-creditos">${crTotal} CR</span> <span onclick="event.stopPropagation(); removerSemestre('${sem}')">🗑️</span></h4>`;
        col.appendChild(lista); box.appendChild(col);
    });
}

function gerarRelatorioOferta() {
    const semRef = document.getElementById('inputSemestreRelatorio').value.trim();
    if(!semRef) return alert("Digite o semestre.");
    if (!baseColegiado.alunos.length) return alert("Carregue a Base Mestre primeiro.");
    const regrasParaEsteSemestre = REGRAS_OFERTA[semRef];
    let relatorioMaster = {};

    baseColegiado.alunos.forEach(aluno => {
        const p = aluno.dados_atuais.plano;
        if(p[semRef]) p[semRef].forEach(cod => {
            const infoD = obrig.find(x => x.codigo === cod);
            let ppcEnc = "Extra", semCurr = "Extra";
            if (regrasParaEsteSemestre && infoD) {
                for (const [pk, semPerm] of Object.entries(regrasParaEsteSemestre)) {
                    if (infoD[`ppc_${pk}`] && semPerm.includes(infoD[`ppc_${pk}`])) { ppcEnc = pk; semCurr = infoD[`ppc_${pk}`]; break; }
                }
            }
            if(!relatorioMaster[ppcEnc]) relatorioMaster[ppcEnc] = {};
            if(!relatorioMaster[ppcEnc][semCurr]) relatorioMaster[ppcEnc][semCurr] = {};
            if(!relatorioMaster[ppcEnc][semCurr][cod]) relatorioMaster[ppcEnc][semCurr][cod] = { nome: (infoD?infoD.nome:cod), alunos: [] };
            if(!relatorioMaster[ppcEnc][semCurr][cod].alunos.includes(aluno.nome)) relatorioMaster[ppcEnc][semCurr][cod].alunos.push(aluno.nome);
        });
    });

    const container = document.getElementById('containerRelatorioOferta');
    container.innerHTML = "";
    Object.keys(relatorioMaster).sort().forEach(ppc => {
        let labelPPC = ppc === "Extra" ? "Disciplinas Extras" : `Oferta do PPC ${ppc.slice(0,4)}/${ppc.slice(4)}`;
        let divPPC = document.createElement('div'); divPPC.className = 'relatorio-ppc-container';
        let htmlPPC = `<div class="ppc-header-banner">${labelPPC}</div>`;
        Object.keys(relatorioMaster[ppc]).sort((a,b)=>a-b).forEach(s => {
            htmlPPC += `<div class="semestre-divider">${s === "Extra" ? "Semestre Extra" : s + "º Semestre Curricular"}</div>
                <table class="tabela-oferta"><thead><tr><th width="120">Código</th><th>Disciplina</th><th width="80" style="text-align:center">Qtd</th><th>Alunos</th></tr></thead><tbody>`;
            Object.keys(relatorioMaster[ppc][s]).sort().forEach(c => {
                const d = relatorioMaster[ppc][s][c];
                htmlPPC += `<tr><td><b style="color:var(--primary)">${c}</b></td><td>${d.nome}</td><td style="text-align:center"><b>${d.alunos.length}</b></td><td>${d.alunos.map(n=>`<span class="chip-aluno">${n}</span>`).join('')}</td></tr>`;
            });
            htmlPPC += `</tbody></table>`;
        });
        divPPC.innerHTML = htmlPPC; container.appendChild(divPPC);
    });
}

function calcularPrazos() {
    const anoIng = parseInt(document.getElementById('ingressoAno').value);
    const semIng = parseInt(document.getElementById('ingressoSemestre').value);
    const ppcIng = document.getElementById('ppcIngresso').value;
    const tranc = parseInt(document.getElementById('trancamentos').value) || 0;
    const regra = REGRAS_PPC[ppcIng];
    if (!regra || isNaN(anoIng)) return;

    const pMin = somarSemestres(anoIng, semIng, regra.min + tranc);
    const pMaxSem = somarSemestres(anoIng, semIng, regra.max + tranc);
    const pMaxCom = somarSemestres(anoIng, semIng, Math.floor(regra.dil) + tranc);
    const semsPlan = Object.keys(plano).sort();
    let cursadosSemestres = 0;
    if (semsPlan.length > 0) {
        const [aP, sP] = semsPlan[0].split('/').map(Number);
        cursadosSemestres = (aP * 2 + (sP - 1)) - (anoIng * 2 + (semIng - 1)) - tranc;
    }
    let restantesSemestres = regra.max - (cursadosSemestres < 0 ? 0 : cursadosSemestres);

    let chTotal = 0, chCursada = 0;
    obrig.forEach(d => {
        const val = parseInt(d.carga_horaria) || 0;
        chTotal += val; if (cursadas.includes(d.codigo)) chCursada += val;
    });
    const progresso = chTotal > 0 ? ((chCursada / chTotal) * 100).toFixed(1) : 0;

    const painel = document.getElementById('painelPrazos');
    painel.innerHTML = `
        <div class="card-prazo"><b>Mínimo Formatura</b>${pMin.formatado}</div>
        <div class="card-prazo"><b>Máximo (Normal)</b>${pMaxSem.formatado}</div>
        <div class="card-prazo"><b>Máximo (Dilação)</b>${pMaxCom.formatado}</div>
        <div class="card-prazo"><b>Semestres Cursados</b>${cursadosSemestres < 0 ? 0 : cursadosSemestres}</div>
        <div class="card-prazo"><b>Restantes p/ Limite</b>${restantesSemestres < 0 ? 0 : restantesSemestres}</div>
        <div class="card-prazo" style="border-top-color: var(--success)"><b>Carga Cursada</b>${chCursada}h / ${chTotal}h</div>
        <div class="card-prazo" style="border-top-color: var(--success)"><b>Progresso</b>${progresso}%</div>
    `;
}

function somarSemestres(ano, sem, qtd) {
    let total = (ano * 2 + (sem - 1)) + (qtd - 1);
    return { total: total, formatado: `${Math.floor(total / 2)}/${(total % 2) + 1}` };
}
function toggle(c) {
    if(cursadas.includes(c)) cursadas = cursadas.filter(x=>x!==c);
    else { cursadas.push(c); Object.keys(plano).forEach(s => plano[s] = plano[s].filter(id => id !== c)); }
    renderizarTudo();
}
function addAoPlano(c) { if(semestreAtivo) { plano[semestreAtivo].push(c); renderizarTudo(); } }
function delDisc(s, c) { plano[s] = plano[s].filter(x=>x!==c); renderizarTudo(); }
function removerSemestre(s) { if(confirm(`Remover semestre ${s}?`)) { delete plano[s]; if(semestreAtivo===s) semestreAtivo = ""; renderizarTudo(); } }
function addSemestre() {
    let sems = Object.keys(plano).sort();
    let n = sems.length ? somarSemestres(parseInt(sems[sems.length-1].split('/')[0]), parseInt(sems[sems.length-1].split('/')[1]), 2).formatado : prompt("Início (Ex: 2026/1)");
    if(n && !plano[n]) { plano[n] = []; semestreAtivo = n; renderizarTudo(); }
}
function renderizarPendencias() {
    const box = document.getElementById('listaDisponiveis'); box.innerHTML = semestreAtivo ? '' : '<p>Selecione um semestre.</p>';
    if (!semestreAtivo) return;
    const jaMap = [...cursadas, ...Object.values(plano).flat()];
    const oferta = REGRAS_OFERTA[semestreAtivo];
    obrig.filter(d => {
        if (jaMap.includes(d.codigo)) return false;
        if (oferta) {
            if (d.ppc_20261 && oferta["20261"].includes(d.ppc_20261)) return true;
            if (d.ppc_20251 && oferta["20251"].includes(d.ppc_20251)) return true;
            return false;
        }
        return true;
    }).forEach(d => {
        const div = document.createElement('div'); div.className = 'mini-card';
        div.innerHTML = `<div style="flex:1"><b>${d.codigo}</b><br>${d.nome}</div><button onclick="addAoPlano('${d.codigo}')">ADD</button>`;
        box.appendChild(div);
    });
}
function salvarInfoAdicional() {
    const info = { nome: document.getElementById('alunoNome').value, sei: document.getElementById('alunoSEI').value, anoIng: document.getElementById('ingressoAno').value, semIng: document.getElementById('ingressoSemestre').value, ppcIng: document.getElementById('ppcIngresso').value, tranc: document.getElementById('trancamentos').value };
    localStorage.setItem('info_aluno_ufmt', JSON.stringify(info)); calcularPrazos();
}
function carregarInfoAdicional() {
    const info = JSON.parse(localStorage.getItem('info_aluno_ufmt'));
    if (info) {
        document.getElementById('alunoNome').value = info.nome || ""; document.getElementById('alunoSEI').value = info.sei || "";
        document.getElementById('ingressoAno').value = info.anoIng || "2022"; document.getElementById('ingressoSemestre').value = info.semIng || "1";
        document.getElementById('ppcIngresso').value = info.ppcIng || "2026"; document.getElementById('trancamentos').value = info.tranc || "0";
    }
}
function importarJSON(e) {
    const reader = new FileReader();
    reader.onload = (ev) => {
        const d = JSON.parse(ev.target.result);
        localStorage.setItem('cursadas_ufmt', JSON.stringify(d.cursadas || []));
        localStorage.setItem('plano_ufmt', JSON.stringify(d.plano || {}));
        localStorage.setItem('info_aluno_ufmt', JSON.stringify(d.info || {}));
        location.reload();
    };
    reader.readAsText(e.target.files[0]);
}
function exportarJSON() {
    const d = { cursadas, plano, info: JSON.parse(localStorage.getItem('info_aluno_ufmt')) };
    const blob = new Blob([JSON.stringify(d, null, 2)], {type:'application/json'});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `plano_${document.getElementById('alunoNome').value}.json`; a.click();
}
function exportarExcel() {
    const nomeRaw = document.getElementById('alunoNome').value || "aluno";
    let csv = `CÓDIGO;CARGA HORÁRIA;NOME;Ano;Semestre\n`;
    Object.keys(plano).sort().forEach(s => {
        const [ano, sem] = s.split('/');
        plano[s].forEach((c, i) => {
            const d = obrig.find(x => x.codigo === c);
            if(d) csv += `${c};${d.carga_horaria};${d.nome};${i===0?ano:""};${i===0?sem:""}\n`;
        });
        csv += `;;;;\n`;
    });
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `plano_${nomeRaw}.csv`; a.click();
}
function gerarPDF() {
    const nomeRaw = document.getElementById('alunoNome').value || "aluno";
    const oldTitle = document.title; document.title = `plano_${nomeRaw}`;
    window.print(); document.title = oldTitle;
}
function importarBaseColegiado(e) {
    const reader = new FileReader();
    reader.onload = (ev) => { baseColegiado = JSON.parse(ev.target.result); renderizarListaColegiado(); document.getElementById('statusBase').innerText = `Base: ${baseColegiado.alunos.length} alunos.`; };
    reader.readAsText(e.target.files[0]);
}
function salvarAlunoNaBase() {
    const nome = document.getElementById('alunoNome').value; const sei = document.getElementById('alunoSEI').value;
    if(!nome || !sei) return alert("Preencha Nome/SEI");
    const snapshot = { cursadas: [...cursadas], plano: JSON.parse(JSON.stringify(plano)), info: JSON.parse(localStorage.getItem('info_aluno_ufmt')) };
    let a = baseColegiado.alunos.find(x => x.sei === sei);
    if(a) { a.historico.push({ data: new Date().toLocaleString(), plano: a.dados_atuais }); a.dados_atuais = snapshot; a.nome = nome; }
    else { baseColegiado.alunos.push({ nome, sei, historico: [], dados_atuais: snapshot }); }
    renderizarListaColegiado(); alert("Salvo!");
}
function renderizarListaColegiado() {
    const cont = document.getElementById('listaAlunosColegiado'); cont.innerHTML = "";
    baseColegiado.alunos.forEach((a, i) => {
        const d = document.createElement('div'); d.className = 'card-aluno-db';
        d.innerHTML = `<h4>${a.nome}</h4><p>SEI: ${a.sei}</p><button onclick="carregarAlunoDaBase(${i})" class="btn-primary" style="font-size:10px">CARREGAR</button>
            <button onclick="excluirAlunoBase(${i})" class="btn-danger-outline" style="font-size:10px; color:red; border-color:red; background:white">EXCLUIR</button>`;
        cont.appendChild(d);
    });
}
function carregarAlunoDaBase(i) {
    const d = baseColegiado.alunos[i].dados_atuais;
    localStorage.setItem('cursadas_ufmt', JSON.stringify(d.cursadas)); localStorage.setItem('plano_ufmt', JSON.stringify(d.plano));
    localStorage.setItem('info_aluno_ufmt', JSON.stringify(d.info)); location.reload();
}
function excluirAlunoBase(idx) { if(confirm("Excluir?")) { baseColegiado.alunos.splice(idx,1); renderizarListaColegiado(); } }
function exportarBaseColegiado() {
    const blob = new Blob([JSON.stringify(baseColegiado, null, 2)], {type:'application/json'});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "BASE_MESTRE_COLEGIADO.json"; a.click();
}
function limparDados() { localStorage.clear(); location.reload(); }

carregar();