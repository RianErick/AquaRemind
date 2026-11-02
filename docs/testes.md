# Roteiro de demonstração

O projeto vem configurado com `DEMO_MODE=1`: cada segundo representa um minuto. O controle deslizante amarelo seleciona o intervalo de 30, 40 ou 60 minutos simulados. Para usar os tempos reais, altere para `DEMO_MODE=0` em `platformio.ini`.

## T01 - Funcionamento normal

Inicie a simulação. O OLED deve mostrar volume, temperatura, meta e tempo sem gole. O LED e o indicador de vibração ficam desligados.

## T02 - Gole

Pressione o botão azul **Beber 200 ml**. O nível mostrado no OLED cai, o sistema mostra `GOLE`, reinicia o contador e soma 200 ml à meta diária.

## T03 - Reabastecimento

Pressione o botão ciano **Reabastecer +200 ml**. O volume sobe e a meta diária não é alterada.

## T04 - Lembrete

Escolha 30 minutos no controle deslizante amarelo e aguarde 30 segundos no modo de demonstração. O LED e o indicador do motor vibratório pulsam três vezes, e o Monitor Serial registra a notificação.

## T05 - Líquido quente

Clique no DS18B20 e ajuste a temperatura acima de 50 °C. O OLED exibe `!` e o Monitor Serial registra o aviso.

## T06 - Soneca e confirmação

Durante o lembrete, dê um clique curto no botão para uma soneca de 15 segundos. Segure o botão por pelo menos 1,2 segundo para confirmar manualmente que bebeu e reiniciar o temporizador.

## Observação para hardware físico

O ECHO do HC-SR04 opera em 5 V. Em uma montagem física, use um divisor resistivo ou conversor de nível antes do GPIO18 do ESP32. Essa proteção não é necessária no simulador.
