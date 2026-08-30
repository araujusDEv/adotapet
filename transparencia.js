document.addEventListener('DOMContentLoaded', () => {
  const stats = Store.getPublicStats();
  const items = [
    ['Animais disponíveis', stats.available], ['Adoções concluídas', stats.completedAdoptions],
    ['Casos urgentes', stats.urgent], ['Desaparecidos ativos', stats.missing],
    ['Animais encontrados', stats.found], ['Atualizações pós-adoção', stats.postAdoptionUpdates],
    ['Pontos na rede de apoio', stats.supportPoints]
  ];
  document.getElementById('impact-grid').innerHTML = items.map(([label, value]) => `<div class="impact-card"><b>${Number(value) || 0}</b><span>${escapeHTML(label)}</span></div>`).join('');
  document.getElementById('data-update').textContent = `Dados consultados em ${new Date().toLocaleString('pt-BR')}.`;
});
