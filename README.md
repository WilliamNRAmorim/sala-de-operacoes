# Sala de Operações

Sala pixel-art que mostra, em tempo real, os agentes do Claude Code trabalhando: quem está numa mesa, quem terminou e foi para o sofá, quem sumiu.

Esta é a versão **publicada** (somente leitura): recebe só o status dos agentes (tipo, horário, nome do projeto e nome da ferramenta). Nenhum arquivo, prompt ou resposta passa por aqui.

## Como funciona
- Hooks do Claude Code, na máquina de quem usa, enviam cada evento a um Firebase Realtime Database.
- A página recebe os eventos por stream (SSE) e anima os personagens.
- Tudo é editável em `config.json`: textos, temas, personagens (sprites em pixels), layout da sala e fonte de dados.

## Personalizar
Edite `config.json` (ou use a engrenagem ⚙ na página; **Exportar** gera um `config.json` novo).
