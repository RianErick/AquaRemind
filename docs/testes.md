# Testes

## Testes automáticos no Wokwi

Os cenários ficam em `tests/` e rodam com:

```bash
./scripts/test-wokwi.sh        # todos
./scripts/test-wokwi.sh ct06   # só um
```

O script precisa de um token de CI do Wokwi, gerado em <https://wokwi.com/dashboard/ci>, na variável `WOKWI_CLI_TOKEN` ou no arquivo `.env.wokwi` (fora do git). Cada execução consome minutos de CI do plano. Logs e imagens do OLED ficam em `tests/evidencias/`.

| Cenário | Caso de uso | O que verifica |
|---|---|---|
| CT01 | UC01, UC04 | Inicia em `MONITORANDO`, com leituras na Serial e alertas desligados |
| CT02 | UC02 | Queda de nível no sensor conta como gole e soma à meta |
| CT03 | UC02 | Variação abaixo de 30 ml não conta como gole |
| CT04 | UC02 | Subida de nível conta como reabastecimento e não altera a meta |
| CT05 | UC02, UC04 | Botões Beber e Reabastecer alteram volume e meta |
| CT06 | UC03, UC06 | Lembrete com notificação na Serial e pulsos no LED e na vibração |
| CT07 | UC03 | Controle deslizante muda o intervalo para 40 min |
| CT08 | UC05 | Aviso acima de 50 °C, que só repete depois de esfriar |
| CT09 | UC07 | Clique curto no lembrete ativa a soneca, que termina em novo lembrete |
| CT10 | UC07 | Segurar o botão confirma o consumo e encerra o lembrete |
| CT11 | UC04 | Meta diária para em 2000 ml |
| CT12 | UC02, UC03 | Gole pelo sensor não dispara lembrete |

## Roteiro de demonstração manual

O projeto vem configurado com `DEMO_MODE=1`: cada segundo representa um minuto. O controle deslizante amarelo seleciona o intervalo de 30, 40 ou 60 minutos simulados. Para usar os tempos reais, altere para `DEMO_MODE=0` em `platformio.ini`.

### T01 - Funcionamento normal

Inicie a simulação. O OLED deve mostrar volume, temperatura, meta e tempo sem gole. O LED e o indicador de vibração ficam desligados.

### T02 - Gole

Pressione o botão azul **Beber 200 ml**. O nível mostrado no OLED cai, o sistema mostra `GOLE`, reinicia o contador e soma 200 ml à meta diária.

### T03 - Reabastecimento

Pressione o botão ciano **Reabastecer +200 ml**. O volume sobe e a meta diária não é alterada.

### T04 - Lembrete

Escolha 30 minutos no controle deslizante amarelo e aguarde 30 segundos no modo de demonstração. O LED e o indicador do motor vibratório pulsam três vezes, e o Monitor Serial registra a notificação.

### T05 - Líquido quente

Clique no DS18B20 e ajuste a temperatura acima de 50 °C. O OLED exibe `!` e o Monitor Serial registra o aviso.

### T06 - Soneca e confirmação

Durante o lembrete, dê um clique curto no botão para uma soneca de 15 segundos. Segure o botão por pelo menos 1,2 segundo para confirmar manualmente que bebeu e reiniciar o temporizador.

## Observação para hardware físico

O ECHO do HC-SR04 opera em 5 V. Em uma montagem física, use um divisor resistivo ou conversor de nível antes do GPIO18 do ESP32. Essa proteção não é necessária no simulador.
