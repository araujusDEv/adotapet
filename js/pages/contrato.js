function renderContract() {
  const user = Auth.requireAuth(); if (!user) return;
  const requestId = Number(getParam('request'));
  const el = document.getElementById('contract-content');
  try {
    const contract = Store.getContract(requestId);
    const confirmed = Boolean(contract.adopterAcknowledgedAt);
    el.innerHTML = `<article class="contract-document">
      <div class="contract-header"><div class="logo" aria-label="AdotaPet"><span class="logo-mark"><img src="img/brand-symbol.png" alt=""></span><span class="brand-word"><span class="brand-adota">Adota</span><span class="brand-pet">Pet</span></span></div><div><span>Termo de adoção responsável</span><b>${escapeHTML(contract.code)}</b></div></div>
      <h1>Compromisso de guarda responsável</h1>
      <p>Por este termo, <b>${escapeHTML(contract.ownerName)}</b> registra a entrega responsável de <b>${escapeHTML(contract.animalName)}</b> (${escapeHTML(contract.species)}${contract.breed ? `, ${escapeHTML(contract.breed)}` : ''}) para <b>${escapeHTML(contract.adopterName)}</b>.</p>
      <div class="contract-parties"><div><span>Responsável anterior</span><b>${escapeHTML(contract.ownerName)}</b><small>${escapeHTML(contract.ownerCity || '')}</small></div><div><span>Adotante</span><b>${escapeHTML(contract.adopterName)}</b><small>${escapeHTML(contract.adopterCity || '')}</small></div><div><span>Data da adoção</span><b>${new Date(contract.acceptedAt).toLocaleDateString('pt-BR')}</b></div></div>
      <h2>Compromissos</h2><ol>${contract.clauses.map(c => `<li>${escapeHTML(c)}</li>`).join('')}</ol>
      <div class="contract-signatures"><div><span>Confirmação do responsável</span><b>Registrada em ${new Date(contract.ownerAcknowledgedAt).toLocaleString('pt-BR')}</b></div><div><span>Confirmação do adotante</span><b>${confirmed ? `Registrada em ${new Date(contract.adopterAcknowledgedAt).toLocaleString('pt-BR')}` : 'Pendente'}</b></div></div>
      <p class="legal-note">Este registro documenta a concordância feita dentro da plataforma. Para necessidades jurídicas específicas, procure orientação profissional e adapte o termo à legislação local.</p>
      <div class="contract-actions no-print">${!confirmed && user.id === contract.adopterId ? '<button class="btn btn-primary" id="confirm-contract">Li e confirmo este termo</button>' : '<span class="alert alert-success">Termo confirmado pelas partes.</span>'}<button class="btn btn-outline" onclick="window.print()">Imprimir ou salvar em PDF</button></div>
    </article>`;
    document.getElementById('confirm-contract')?.addEventListener('click', () => { Store.acknowledgeContract(requestId); renderContract(); });
  } catch (err) { el.innerHTML = `<div class="empty-state"><h3>Termo indisponível</h3><p>${escapeHTML(err.message)}</p></div>`; }
}
document.addEventListener('DOMContentLoaded', renderContract);
