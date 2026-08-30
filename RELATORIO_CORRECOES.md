# AdotaPet — Relatório de correções

## Resultado

O projeto foi convertido de uma aplicação puramente estática baseada em `localStorage` para uma aplicação web com servidor Node.js e persistência central em SQLite. A interface existente foi preservada, mas os fluxos críticos passaram a ser validados no servidor.

## Correções principais

- Persistência real em SQLite, compartilhada entre navegadores/dispositivos que acessam o mesmo servidor.
- Autenticação no servidor com senhas protegidas por `scrypt` + salt.
- Sessão por cookie `HttpOnly` e `SameSite=Strict`; senha e token não ficam no `localStorage`.
- Controle de permissões no servidor para admin, doador e adotante.
- Animais e desaparecidos de demonstração associados ao doador padrão, fechando o fluxo de adoção.
- Bloqueio de solicitação duplicada para o mesmo animal.
- Fluxo de entrevista usa o estado `em_processo`.
- Aceitação de adoção grava `acceptedAt`/`adoptedAt`, conclui a solicitação e encerra solicitações concorrentes.
- Estatística de tempo médio corrigida para usar solicitação → adoção efetiva.
- Galeria de fotos corrigida (erro de variável fora do escopo).
- Carregamento do manipulador de favoritos corrigido na página de detalhes.
- Edição de história de adoção corrigida.
- Avistamentos agora podem ser vistos pelo responsável pelo animal desaparecido.
- Animal desaparecido pode ser marcado como encontrado e reaberto.
- Fotos validadas no front-end: formatos de imagem permitidos e limite de tamanho/quantidade.
- Dados inseridos em HTML passaram a ser escapados para reduzir risco de XSS.
- A API também limita/normaliza campos editáveis e rejeita alterações não autorizadas.
- Mensagens do formulário de contato agora são centralizadas no painel administrativo.
- Dados internos (`data/`, banco, `server.js`, launchers e `package.json`) não são servidos publicamente.
- Usuário responsável pelos dados de demonstração é protegido contra remoção.
- Links de rodapé para cadastro de animal foram corrigidos.
- README atualizado com instruções de execução e arquitetura.

## Testes realizados

- Checagem de sintaxe em `server.js`, `js/*.js` e `js/pages/*.js`.
- 19 páginas HTML verificadas sem referências locais ausentes.
- Nenhum ID HTML duplicado encontrado.
- Cadastro e sessão de adotante testados.
- Solicitação de adoção testada.
- Doador confirmou recebimento da solicitação de um animal de demonstração.
- Etapa de entrevista testada (`em_processo`).
- Aceitação testada com `acceptedAt` e conclusão da solicitação.
- Bloqueio de solicitação duplicada testado.
- Bloqueio de edição de animal por usuário sem permissão testado.
- Avistamentos e marcação de animal encontrado testados.
- Proteção do doador de demonstração contra exclusão testada.
- Acesso web ao arquivo do banco testado e bloqueado.
- Cookie de sessão confirmado como `HttpOnly`.
- Entrada HTML maliciosa permanece como texto quando renderizada pelo front-end.

## Como executar

Requer Node.js 22.5 ou superior.

No Windows, execute `INICIAR.bat` ou, no terminal da pasta do projeto:

```bash
node server.js
```

Depois abra:

```text
http://localhost:3000
```

O banco `data/adotapet.db` é criado automaticamente na primeira execução.

## Observação para produção

A versão corrigida é adequada para demonstração, TCC e uso local/em rede controlada. Para publicação pública real, ainda seria recomendado adicionar HTTPS por proxy, política de backup, recuperação de senha, verificação de e-mail, rate limiting e armazenamento dedicado de imagens em vez de mantê-las dentro do estado SQLite.
