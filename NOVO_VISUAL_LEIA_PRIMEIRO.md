# ADOTAPET — novo front-end com SVG

Atualização de 30/08/2026. Pacote completo, preparado para substituir a versão anterior do mesmo projeto. A publicação online não foi realizada nesta atualização.

## Identidade visual

- Página inicial baseada nas referências de computador e celular fornecidas: cabeçalho verde-escuro, chamada principal, fotografia, botões e indicadores de impacto.
- Símbolo original enviado pelo responsável pelo projeto, preservado sem redesenho em `img/brand-symbol.png`.
- Nome em texto: **Adota #FFFFFF** e **Pet #3FCBC2** no cabeçalho e rodapé.
- Ícones de patinha, coração, usuário, escudo, menu, avisos e demais controles feitos em **SVG**, sem emojis ou fontes de ícones.
- Fonte Inter e fotografia principal incluídas no próprio projeto. Os créditos e a licença da fonte acompanham o pacote.
- Cabeçalho, rodapé, cartões, formulários e painéis com a mesma identidade nas 22 páginas existentes.

Os indicadores são calculados pelo sistema: não foram fixados nos números das imagens de referência. Os links existentes, inclusive Compatibilidade, foram preservados. Não foi criada uma página vazia chamada “Adotei” apenas para imitar a referência.

## Navegação responsiva

- Em monitores grandes, os links e os atalhos da conta ficam na mesma linha.
- Em larguras intermediárias, o cabeçalho usa duas linhas para acomodar todos os recursos.
- Até 1100 pixels, aparecem os ícones de favoritos, conta e menu. O menu tem rolagem própria para telas baixas.
- O ícone de usuário abre solicitações, painel da ONG ou administrador, tema, avisos e saída da conta. Os atalhos são adaptados ao perfil conectado.
- Nomes longos não empurram os demais controles para fora da tela.

## Formulário recebido pela ONG

A correção anterior foi mantida e conferida com o novo visual:

1. Entre na conta do responsável pelo animal.
2. Abra o ícone de usuário e selecione **Meu Painel**.
3. Escolha **Solicitações recebidas**.
4. Abra **Ver questionário respondido** no pedido desejado.
5. Leia as respostas antes de usar **Marcar entrevista** ou **Recusar solicitação**.

Marcar entrevista altera a etapa para entrevista/contato; não agenda uma data automaticamente nem envia uma mensagem externa.

## Como testar no seu computador

1. Extraia o ZIP inteiro para uma nova pasta.
2. Com Node.js 22.5 ou superior instalado, execute `INICIAR.bat` ou rode `npm start` nessa pasta.
3. Abra `http://127.0.0.1:3000` no navegador.

Não abra o HTML diretamente: login, dados e solicitações dependem do servidor. O banco será criado no primeiro início. As credenciais iniciais seguem a configuração descrita no README; não há banco nem contas dos testes neste ZIP.

## Arquivos para atualizar o site existente

Faça uma cópia da versão anterior e mantenha esta estrutura na raiz do repositório:

```text
server.js
package.json
render.yaml
index.html e demais páginas HTML
css/      (inclui style.css e visual.css)
js/       (inclui icons.js, nav.js e pages/)
img/      (inclui brand-symbol.png, hero-adocao.jpg e social-preview.png)
fonts/    (inclui inter-latin.woff2 e sua licença)
data/     (inclui seed.json)
```

Envie os arquivos extraídos, mantendo as pastas. Não envie apenas o ZIP e não espalhe o conteúdo de `data`, `js`, `css`, `fonts` e `img` na raiz. O pacote não exige criar outro serviço nem trocar o banco.

Se houve alterações no seu repositório depois da versão usada como base, compare-as antes de substituir arquivos. Não envie `.env`, senhas ou arquivos de banco de dados ao GitHub.

O arquivo `ATUALIZACAO_NAV_E_FORMULARIO.md` registra a atualização anterior; para a aparência e organização atual do menu, siga este guia.

## Verificações desta atualização

- Sintaxe de 26 arquivos JavaScript e referências locais das 22 páginas HTML.
- Resposta HTTP das 22 páginas, fonte local e política de cache dos estilos.
- Igualdade do arquivo da logo com o original enviado e cores exatas do nome.
- Verificação de ausência de emojis/pictogramas de texto no HTML e JavaScript da interface.
- Página inicial e navegação em larguras simuladas de 320, 390, 768, 1100, 1440, 1600 e 1920 pixels, sem transbordamento horizontal nos elementos inspecionados.
- Menu com rolagem em 844 × 390 pixels.
- Login de adotante e ONG, troca de tema, favoritos, busca por animal e envio de solicitação pelo navegador.
- Leitura do questionário enviado pelo adotante e avanço para entrevista no painel da ONG, em banco separado de testes.
- API impedindo acesso anônimo e acesso de outro doador às solicitações de animais que não são seus.

As verificações não equivalem a uma auditoria completa de todos os fluxos do sistema. Ainda é recomendável conferir o resultado no seu aparelho real e no endereço publicado. O back-end foi preservado, com ajuste apenas dos tipos de conteúdo servidos para fontes.

## Limitação da hospedagem gratuita

Esta atualização é visual e não muda a persistência dos dados. O SQLite no armazenamento temporário do Render gratuito pode perder cadastros em republicações e reinícios. Guarde informações importantes antes de atualizar. Para uso permanente, é necessário armazenamento persistente ou banco externo. Consulte também `GUIA_PUBLICACAO.md` e o README.

Referência: [Render — arquivos locais no plano gratuito](https://render.com/docs/free#local-files-lost-on-redeploy).
