# Guia rápido de publicação

O AdotaPet não é um site estático: ele precisa executar `node server.js` e gravar o banco SQLite em `data/adotapet.db`.

## Configuração mínima

- Runtime: Node.js 22.5 ou superior
- Comando de início: `npm start`
- Porta: use a variável `PORT` fornecida pela hospedagem
- Disco persistente: a pasta `data` precisa continuar existindo após reinícios e novas publicações
- HTTPS: obrigatório para uso público

## Variáveis recomendadas

```text
ADMIN_EMAIL=seu-email-administrativo
ADMIN_PASSWORD=uma-senha-forte-e-unica
DONOR_EMAIL=email-do-perfil-inicial
DONOR_PASSWORD=outra-senha-forte-e-unica
COOKIE_SECURE=1
TRUST_PROXY=1
DATA_DIR=/var/data
```

Configure essas variáveis no painel da hospedagem antes da primeira execução. Não coloque senhas dentro dos arquivos do projeto.

Use `TRUST_PROXY=1` somente quando a hospedagem colocar a aplicação atrás de um proxy reverso confiável e preencher `X-Forwarded-For` corretamente.

`DATA_DIR` deve apontar para o diretório persistente montado pela hospedagem. O banco será criado dentro dele; o arquivo de dados iniciais continuará dentro do código da aplicação.

## Publicação gratuita para demonstração no Render

O pacote inclui `render.yaml`. Depois de colocar a pasta em um repositório GitHub:

1. No Render, escolha **New → Blueprint**.
2. Conecte o repositório.
3. Confirme a criação do serviço gratuito.
4. Preencha as variáveis marcadas como secretas: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DONOR_EMAIL` e `DONOR_PASSWORD`.
5. Aguarde a verificação de `/api/health` e abra o endereço `onrender.com` fornecido.

O modo gratuito é indicado somente para apresentação: o sistema funciona normalmente, mas o banco fica no armazenamento temporário do serviço e pode voltar ao estado inicial depois de uma reinicialização ou nova publicação. Para uso real, altere o plano, anexe um disco persistente e configure `DATA_DIR=/var/data`.

## Banco e backup

O banco é criado automaticamente. Faça cópias periódicas de `data/adotapet.db` com o servidor parado ou usando o mecanismo de snapshot/backup fornecido pela hospedagem. Nunca publique os arquivos `adotapet.db`, `adotapet.db-wal` ou `adotapet.db-shm` como arquivos estáticos.

## Primeira conferência

Depois da publicação, abra `/api/health`. A resposta deve conter `"ok": true`. Em seguida:

1. Entre com a conta administrativa.
2. Troque dados de demonstração e confira os contatos exibidos.
3. Cadastre somente pontos de apoio cujos dados tenham sido confirmados.
4. Teste uma solicitação completa antes de divulgar o endereço do site.

O termo gerado pelo sistema registra a concordância dentro da plataforma, mas não substitui uma revisão jurídica adequada ao município e à finalidade da organização.
