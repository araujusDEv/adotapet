# Campanhas de arrecadação por Pix

A página `doacoes.html` está disponível pelo menu **Doe por um pet**, pela chamada na página inicial e pelo link **Gerenciar campanhas de arrecadação** na administração.

## Como publicar

1. Entre com uma conta de administrador e abra **Doe por um pet**.
2. Clique em **Nova campanha** e selecione um pet com perfil público.
3. Preencha história, finalidade, meta, responsável, contato e nome do beneficiário.
4. Informe o tipo e a chave Pix; confira os dados e a autorização do responsável para divulgá-los.
5. Escolha **Publicada e aberta** e salve. **Rascunho** fica visível apenas à administração.

As campanhas começam vazias no projeto entregue: nenhum beneficiário, chave Pix ou recebimento fictício é publicado. Os exemplos usados para testar ficaram exclusivamente em um banco temporário.

## Recebimento e acompanhamento

O visitante abre a campanha, copia a chave e realiza o Pix no aplicativo do banco. Deve conferir o nome do recebedor antes da confirmação. Não há processamento de pagamentos, cobrança automática nem integração com banco.

A administração usa **Editar campanha** para informar o total recebido e uma atualização pública explicando a alteração. O total é identificado como manual. Copiar a chave ou compartilhar a campanha não registra doações. Valores são armazenados em centavos.

Ao encerrar uma campanha, o histórico continua disponível, mas a chave Pix deixa de aparecer ao público. A campanha também deixa de oferecer doações se o perfil do animal não estiver público. Para retirar uma campanha da listagem pública, use **Rascunho**.

## Arquivos

- `doacoes.html`: página pública e formulários de administração.
- `css/doacoes.css`: visual responsivo, cartões, progresso e janelas.
- `js/pages/doacoes.js`: pesquisa, filtros, detalhes, cópia da chave, compartilhamento, criação e edição.
- `server.js`: coleção persistente `campaigns`, permissões, validação de valores/chaves, histórico e controle de versões para evitar sobrescrever uma edição mais recente.
- `js/store.js`: integração com a API de campanhas.
- `js/nav.js`: entrada no menu compartilhado.
- `admin.html`: acesso ao gerenciamento.
- `index.html`: chamada para apoiar campanhas.
- `tests/campaigns.cjs`: testes de autorização, privacidade de rascunhos, validação, progresso, revisões e encerramento.

## Verificação

Executados com bancos temporários: `node tests/campaigns.cjs`, `node tests/security.cjs` e `node tests/security-regressions.cjs`. Todos passaram. O servidor iniciou após cada etapa e os arquivos JavaScript passaram na validação de sintaxe.

No navegador foram verificados criação, edição, atualização do progresso, detalhes do Pix, cópia da chave, filtros, encerramento e visualização pública. Layout conferido em desktop e celular; não houve rolagem horizontal em 390 px nem erros de JavaScript nos fluxos verificados.

Aplicado diretamente na versão local de 09/09 indicada pelo usuário. GitHub e Render não foram atualizados.
