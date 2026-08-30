# ADOTAPET — atualização do menu e do formulário

Versão: 30/08/2026.

Este é um pacote completo do site para o projeto existente no GitHub/Render. As correções foram testadas localmente; este pacote não publica nem altera automaticamente o site online.

## O que foi corrigido

- Menu de navegação adaptado a celular, tablet e computador, inclusive com conta conectada.
- No computador, os atalhos da conta ficam separados dos links públicos, evitando o acúmulo de itens na mesma linha.
- No celular, o botão Menu abre uma lista com rolagem própria. Favoritos, solicitações, painel, tema, avisos e Sair continuam acessíveis.
- O menu fecha ao escolher um link, ao usar Escape ou ao voltar à largura de computador. O fundo não rola enquanto ele está aberto.
- Nomes longos não empurram os botões para fora da tela.
- Incluída a correção que permite à ONG/doador consultar o questionário enviado pelo interessado.
- Atualizadas as referências de CSS/JavaScript nas 22 páginas e a política de cache do servidor, para evitar que o navegador continue usando o menu antigo.

## Como a ONG consulta o formulário

1. Entre na conta do doador/ONG responsável pelo animal.
2. Abra **Meu Painel**.
3. Selecione **Solicitações recebidas**.
4. Na solicitação desejada, abra **Ver questionário respondido**.
5. Leia as respostas e decida entre **Marcar entrevista** e **Recusar solicitação**.

O painel mostra idade, cidade, moradia, quintal, outros animais, experiência, concordância dos moradores, condições financeiras, tempo sozinho, cuidados veterinários, motivo da adoção e plano de adaptação, além dos compromissos confirmados. Respostas ausentes em solicitações antigas aparecem como “Não informado”.

Importante: **Marcar entrevista** muda a etapa para entrevista/contato. Não agenda automaticamente uma data, não envia mensagem por WhatsApp e não substitui a análise humana. O responsável deve combinar os detalhes com o interessado pelos meios disponíveis.

## Antes de atualizar

Não envie banco de dados, senhas ou arquivos `.env` ao GitHub. Este pacote não contém o banco e as contas criados nos testes.

Na configuração gratuita atual, o ADOTAPET usa SQLite no armazenamento temporário do Render. Republicar, reiniciar ou suspender o serviço por inatividade elimina as alterações nesse armazenamento. Registre as informações importantes antes de atualizar; para preservar os dados de forma permanente, será necessário armazenamento persistente ou um banco externo. Esta atualização não altera essa limitação.

Referência: [Render — arquivos locais e republicação](https://render.com/docs/free#local-files-lost-on-redeploy).

## Como atualizar o projeto existente

1. Extraia o ZIP para uma nova pasta no computador. Guarde uma cópia da versão anterior.
2. No mesmo repositório GitHub do site, substitua os arquivos pelas versões extraídas, mantendo a estrutura das pastas.
3. `server.js`, `package.json` e os arquivos `.html` devem ficar na raiz do repositório. As pastas `css`, `js`, `img` e `data` também ficam nessa raiz. Não espalhe o conteúdo delas na raiz.
4. Confirme especialmente os caminhos `css/style.css`, `js/nav.js`, `js/pages/painel-doador.js` e `data/seed.json`.
5. Salve o commit na branch conectada ao Render. Não é necessário criar outro serviço nem alterar as variáveis de ambiente existentes.
6. Aguarde a publicação automática. Se ela não iniciar, no serviço existente do Render use **Manual Deploy → Deploy latest commit**.
7. Quando o deploy terminar com sucesso, recarregue o site. Se ainda aparecer o visual antigo, feche a aba e abra o endereço novamente.

Não envie somente o ZIP ao GitHub: o Render precisa dos arquivos extraídos. Se você alterou o site depois da versão anterior deste pacote, compare essas alterações antes de substituir os arquivos.

Referência: [Render — publicação automática e manual](https://render.com/docs/deploys).

## Verificações realizadas

- Sintaxe dos 25 arquivos JavaScript e existência das referências locais nas 22 páginas HTML.
- Menu da ONG nas larguras 320, 390, 844, 1100, 1101, 1440 e 1920 pixels, sem itens ultrapassando a largura da tela.
- Navegação como visitante, adotante com nome longo, doador e administrador.
- Abertura/fechamento do menu, tecla Escape, alteração de largura, rolagem em paisagem, temas e avisos.
- Leitura de todas as respostas de uma solicitação fictícia no painel do doador e avanço para entrevista.
- Preservação das respostas “Não” e exibição de texto digitado como texto, sem execução de HTML.
- API bloqueando acesso anônimo e impedindo outro doador de ler ou alterar a solicitação de um animal que não lhe pertence.

Os testes utilizaram navegador com larguras simuladas e banco separado. Ainda é recomendável conferir o resultado no seu celular após o deploy. Não foi realizado um novo teste completo de todas as demais funcionalidades do site.
