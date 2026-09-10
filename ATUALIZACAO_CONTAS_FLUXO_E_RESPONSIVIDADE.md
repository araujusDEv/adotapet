# Atualização de contas, solicitações e responsividade

## Arquivos principais alterados

- `server.js`: migração segura do SQLite, tipos de conta, aprovação de ONG, propriedade dos registros, novos status e rotas.
- `css/portal.css`: menu lateral, navegação mobile, autenticação, painéis, cartões e diálogos.
- `js/nav.js`: sidebar recolhível no desktop e menu acessível no celular.
- `login.html`, `registro.html`, `js/pages/login.js`, `js/pages/registro.js`: novas telas e validações.
- `painel-doador.html`, `js/pages/painel-doador.js`: animais próprios e análise completa dos interessados.
- `minhas-solicitacoes.js`: novos status, próximos passos, cancelamento, termo e acompanhamentos.
- `admin.js`: aprovação/reprovação de ONGs e indicadores atualizados.
- `configuracoes.html`, `notificacoes.html` e seus scripts: perfil e central de avisos.
- `tests/smoke-api.js`: teste de ponta a ponta da API.

## Banco de dados

A tabela `users` recebe, sem apagar registros existentes, as colunas `account_type`, `approval_status`, `approved_by`, `approved_at` e `approval_reason`. Um índice auxilia a listagem por tipo/situação. Contas antigas são migradas automaticamente: adotante vira usuário, doador vira ONG aprovada e administrador permanece administrador.

Solicitações antigas também são convertidas de forma compatível: `aceita` vira `concluida`, `recusada` vira `reprovada` e as etapas antigas são preservadas no novo fluxo.

## Endpoints adicionados ou atualizados

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/forgot-password`
- `PATCH /api/users/me`
- `POST /api/users/:id/approve`, `POST /api/users/:id/reject`
- `POST /api/requests/:id/analyze`, `/approve`, `/interview`, `/reject`, `/complete`, `/cancel`
- `POST /api/animals` e `PATCH/DELETE /api/animals/:id` com validação de propriedade.

## Permissões

- Usuário e ONG aprovada: publicar e alterar apenas animais próprios; analisar somente solicitações enviadas aos próprios animais.
- Interessado: consultar e cancelar somente as próprias solicitações.
- Administrador: aprovar ONGs/anúncios e gerenciar qualquer animal ou solicitação.
- ONG pendente ou reprovada: não consegue entrar até nova decisão administrativa.

## Validações realizadas

- Sintaxe de todos os arquivos JavaScript.
- Fluxo automatizado completo da API e do SQLite.
- Layout em 1440 × 900 e 390 × 844.
- Menu mobile fechado inicialmente, abertura com sobreposição e fechamento pela tecla Esc.
- Login, cadastro, painel de interessados e diálogo do formulário em desktop e celular.
- Ausência de rolagem horizontal no cadastro mobile.
