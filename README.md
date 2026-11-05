# AquaRemind

Protótipo acadêmico de uma garrafa inteligente baseado em ESP32. O repositório reúne firmware, circuito Wokwi e um modelo 3D conceitual paramétrico.

## Simulador visual

Para abrir a demonstração interativa da garrafa, execute:

```bash
./simular.sh
```

O painel permite simular goles de 200 ml, reabastecimento, intervalos de 30/40/60 minutos, avanço do tempo, soneca, temperatura e a meta diária de 2 litros. O modo apresentação acelera o relógio para que cada segundo represente um minuto.

## O que já está implementado

- leitura do HC-SR04 com mediana de cinco amostras;
- conversão de distância em volume para uma garrafa cilíndrica;
- leitura do DS18B20;
- OLED com volume, temperatura, meta e temporizador;
- detecção de gole e reabastecimento por delta de 30 ml;
- lembrete com LED e três pulsos de vibração;
- clique curto para soneca e clique longo para confirmação;
- função `notify()` representada no Monitor Serial;
- modelo 3D conceitual com tampa do sensor, caixa lateral e tampa traseira.

## Preparação automática

Para compilar e abrir tudo com um único comando:

```bash
cd AquaRemind
./iniciar.sh
```

O script verifica o ambiente, compila o firmware, instala as extensões necessárias quando estiverem ausentes e abre o projeto no VS Code.

Para apenas preparar o ambiente sem abrir o editor:

No terminal:

```bash
cd AquaRemind
./scripts/setup.sh
```

O script cria uma instalação isolada do PlatformIO em `.venv`, baixa as bibliotecas e compila o firmware.

## Executar no Wokwi pelo VS Code

1. Abra a pasta do projeto com `code .`.
2. Aceite instalar as extensões recomendadas PlatformIO IDE e Wokwi.
3. Na primeira utilização, pressione `F1` e execute `Wokwi: Request a new License`.
4. Compile com `Ctrl+Shift+B`.
5. Pressione `F1` e execute `Wokwi: Start Simulator`.

O `diagram.json` contém todos os componentes e conexões. O `wokwi.toml` aponta para o firmware gerado pelo PlatformIO.

## Organização do firmware

O código foi separado por responsabilidade para facilitar manutenção e apresentação:

```text
include/
├── Config.h           # pinagem, dimensões e tempos
├── AppState.h         # estados e medições da aplicação
├── Hardware.h         # interface dos sensores e atuadores
└── AquaRemindApp.h    # controle principal
src/
├── main.cpp           # entrada mínima do Arduino
├── AppState.cpp       # nomes dos estados
├── Hardware.cpp       # OLED, sensores, LED e motor vibratório
└── AquaRemindApp.cpp  # regras, botões e máquina de estados
```

No Wokwi, o ESP32 fica no centro, com display e sensores à direita, alertas ao lado esquerdo e controles de demonstração na extrema esquerda. Nenhum fio passa por cima dos componentes, e os fios do OLED chegam por cima, onde ficam os pinos, sem cobrir a tela.

## Comandos úteis

```bash
./scripts/build.sh       # compila
./scripts/upload.sh      # grava em um ESP32 conectado por USB
./scripts/test-wokwi.sh  # roda os cenários de teste no Wokwi
./scripts/export-3d.sh   # exporta os STLs com OpenSCAD local ou Docker
```

## Modelo 3D

Abra `3d/aquaremind.scad` no OpenSCAD. A variável `part` permite visualizar `assembly`, `cap`, `enclosure` ou `cover`. As dimensões no início do arquivo podem ser ajustadas quando a equipe escolher a garrafa real.

O modelo é deliberadamente conceitual: serve para apresentação e para demonstrar a distribuição dos componentes, sem exigir rosca ou vedação industrial.

## Pinagem

| Componente | ESP32 |
|---|---:|
| HC-SR04 TRIG | GPIO5 |
| HC-SR04 ECHO | GPIO18 |
| DS18B20 DQ | GPIO4 |
| OLED SDA | GPIO21 |
| OLED SCL | GPIO22 |
| Motor vibratório | GPIO27 |
| LED | GPIO26 |
| Botão | GPIO14 |

## Apresentação

Consulte `docs/testes.md`. Em modo de demonstração, os tempos foram reduzidos para permitir executar todos os testes durante a apresentação.
