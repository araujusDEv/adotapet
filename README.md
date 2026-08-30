# AdotaPet — versão com Back-end + SQLite

Esta versão do projeto usa **HTML, CSS e JavaScript no front-end** e um **servidor Node.js com banco de dados SQLite** no back-end.

Diferente da versão anterior, os cadastros não ficam mais presos ao `localStorage` de um navegador. Usuários, animais, solicitações, desaparecidos, avistamentos, favoritos, denúncias, histórias e notificações são persistidos no arquivo `data/adotapet.db`.

## Requisito

- **Node.js 22.5 ou superior** (recomendado Node.js 22 LTS ou mais recente).
- Não é necessário instalar nenhuma biblioteca com `npm install`: o projeto usa apenas módulos nativos do Node.js.

## Como iniciar no Windows

### Opção 1 — mais fácil

Dê dois cliques em:

`INICIAR.bat`

Depois abra no navegador:

`http://127.0.0.1:3000`

### Opção 2 — pelo VS Code / terminal

Abra a pasta do projeto e execute:

```bash
node server.js
```

ou:

```bash
npm start
```

Depois abra:

`http://127.0.0.1:3000`

> Não abra mais o `index.html` com duplo clique. Esta versão depende do servidor para acessar o banco de dados e autenticar usuários.

## Acessar em outro notebook/celular na mesma rede

Ao iniciar o servidor, o terminal mostra também um endereço parecido com:

`http://192.168.0.10:3000`

Com os dispositivos conectados à mesma rede Wi-Fi, abra esse endereço no outro aparelho. Todos estarão usando o **mesmo banco SQLite** do computador que está executando `server.js`.

O Windows pode pedir autorização do Firewall na primeira execução. Para uso em rede local, permita acesso em **redes privadas**.

## Banco de dados

O banco é criado automaticamente em:

`data/adotapet.db`

Ele guarda os dados de forma centralizada. Para levar os dados já cadastrados para outro computador, feche o servidor e copie a pasta do projeto inteira, incluindo `data/adotapet.db`.

Para voltar ao estado inicial de demonstração:

1. Feche o servidor.
2. Apague `data/adotapet.db` e os arquivos auxiliares `adotapet.db-wal` / `adotapet.db-shm`, se existirem.
3. Execute `node server.js` novamente.

O servidor recriará o banco usando `data/seed.json`.

## Primeiro acesso

Em um banco novo, o servidor cria as contas iniciais e mostra as senhas aleatórias **uma única vez no terminal**. Guarde esses dados antes de fechar a janela.

Para definir as credenciais antes da primeira inicialização, configure as variáveis `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DONOR_EMAIL` e `DONOR_PASSWORD`. Em uma publicação com HTTPS, configure também `COOKIE_SECURE=1`.

As senhas não são armazenadas em texto puro: o servidor usa **scrypt + salt** para gerar o hash. A sessão é mantida por um **cookie HttpOnly**, que não fica acessível ao JavaScript da página.

Para uma demonstração local com as contas antigas, use `SEED_DEMO_ACCOUNTS=1` antes da primeira execução. Não use essa opção na internet.

## Diferenciais desta versão

- Termo de adoção responsável gerado automaticamente após a aprovação.
- Confirmação do termo pelo adotante e impressão/salvamento em PDF.
- Acompanhamento pós-adoção em 7, 30 e 90 dias, com foto e pedido de apoio.
- Painel do doador para consultar atualizações das famílias.
- Rede de apoio local publicada somente pelo administrador.
- Alertas para usuários da mesma cidade quando um animal desaparece.
- Casos prioritários e filtro específico para animais que precisam de mais atenção.
- Página pública de transparência com indicadores calculados pelo sistema.
- Senhas iniciais aleatórias, limitação de tentativas e cookies seguros configuráveis.

## Principais correções desta versão

- Banco de dados SQLite real e centralizado.
- Senhas armazenadas com hash e salt.
- Sessão autenticada no servidor com cookie HttpOnly.
- Permissões de administrador e doador verificadas também no back-end.
- Animais de demonstração associados corretamente ao perfil doador.
- Bloqueio de solicitações duplicadas para o mesmo animal.
- Status **Em processo de adoção** utilizado ao avançar para entrevista.
- Data real de conclusão (`acceptedAt`) gravada ao aceitar uma adoção.
- Estatística de tempo médio de adoção corrigida.
- Outras solicitações são encerradas automaticamente após uma adoção ser aceita.
- Galeria de múltiplas fotos corrigida.
- Favoritos na página de detalhes corrigidos.
- Edição de histórias de adoção corrigida.
- Avistamentos de desaparecidos agora podem ser visualizados pelo responsável.
- Responsável pode marcar o animal desaparecido como encontrado ou reabrir o registro.
- Upload de imagens limitado a formatos e tamanhos seguros para o protótipo.
- Conteúdo inserido por usuários é escapado antes de ser colocado no HTML, reduzindo risco de XSS.
- Mensagens do formulário de contato ficam disponíveis no painel administrativo.
- Arquivo do banco e arquivos internos do servidor não podem ser baixados pelo servidor web.

## Estrutura

```text
petadopt-estatico/
├── server.js                  Servidor HTTP + API + regras de negócio
├── package.json               Comando npm start
├── INICIAR.bat                Inicialização rápida no Windows
├── data/
│   ├── seed.json              Dados iniciais de demonstração
│   └── adotapet.db            Criado automaticamente ao executar o servidor
├── index.html
├── adotar.html
├── animal.html
├── cadastrar-animal.html
├── painel-doador.html
├── minhas-solicitacoes.html
├── desaparecidos.html
├── desaparecido.html
├── cadastrar-desaparecido.html
├── admin.html
├── css/
├── img/
└── js/
    ├── store.js               Cliente da API
    ├── auth.js                Autenticação/sessão
    ├── nav.js
    ├── cards.js
    └── pages/
```

## Publicação na internet

Este projeto precisa de uma hospedagem que execute **Node.js 22.5+** e ofereça armazenamento persistente e gravável para `data/adotapet.db`. Hospedagem exclusivamente estática não funciona.

Antes de publicar:

1. Configure `ADMIN_PASSWORD` e `DONOR_PASSWORD` com senhas fortes.
2. Ative HTTPS no provedor e configure `COOKIE_SECURE=1`.
3. Configure `DATA_DIR` para um disco persistente (por exemplo, `/var/data`).
4. Crie uma rotina de backup do arquivo `data/adotapet.db`.
5. Não envie um banco de testes dentro do pacote.

A aplicação inclui controles adequados para um MVP local, mas uma operação pública de longo prazo ainda deve acrescentar recuperação de senha por e-mail, política de privacidade/termos revisados, monitoramento, backups automatizados e revisão jurídica do termo de adoção.

O arquivo `render.yaml` permite criar o serviço no Render usando um Blueprint. Consulte `GUIA_PUBLICACAO.md`.

### Demonstração gratuita

O `render.yaml` incluído está configurado para uma apresentação no plano gratuito do Render, sem disco persistente. Os recursos funcionam, mas os cadastros podem ser reiniciados quando o serviço reiniciar ou for publicado novamente. Isso é suficiente para mostrar o projeto, mas não para operação permanente.
