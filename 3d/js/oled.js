// Display SSD1306 128x64 desenhado pixel a pixel com a fonte 5x7 clássica da Adafruit GFX.
import { oledLines } from './firmware.js';

// Colunas de cada caractere ASCII de 0x20 a 0x7E; bit 0 é a linha de cima.
const FONT = (
  '0000000000 00005F0000 0007000700 147F147F14 242A7F2A12 2313086462 3649552250 0005030000 '
  + '001C224100 0041221C00 14083E0814 08083E0808 0050300000 0808080808 0060600000 2010080402 '
  + '3E5149453E 00427F4000 4261514946 2141454B31 1814127F10 2745454539 3C4A494930 0171090503 '
  + '3649494936 064949291E 0036360000 0056360000 0814224100 1414141414 0041221408 0201510906 '
  + '324979413E 7E1111117E 7F49494936 3E41414122 7F4141221C 7F49494941 7F09090901 3E4149497A '
  + '7F0808087F 00417F4100 2040413F01 7F08142241 7F40404040 7F020C027F 7F0408107F 3E4141413E '
  + '7F09090906 3E4151215E 7F09192946 4649494931 01017F0101 3F4040403F 1F2040201F 3F4038403F '
  + '6314081463 0708700807 6151494543 007F414100 0204081020 0041417F00 0402010204 4040404040 '
  + '0001020400 2054545478 7F48444438 3844444420 384444487F 3854545418 087E090102 0C5252523E '
  + '7F08040478 00447D4000 2040443D00 7F10284400 00417F4000 7C04180478 7C08040478 3844444438 '
  + '7C14141408 081414187C 7C08040408 4854545420 043F444020 3C4040207C 1C2040201C 3C4030403C '
  + '4428102844 0C5050503C 4464544C44 0008364100 00007F0000 0041360800 0804081008'
).split(' ').map((hex) => hex.match(/../g).map((b) => parseInt(b, 16)));

export const OLED_W = 128;
export const OLED_H = 64;

export class Oled {
  constructor() {
    this.pixels = new Uint8Array(OLED_W * OLED_H);
    this.targets = [];
  }

  // Cada alvo é um canvas; `scale` define quantos pixels de tela cada ponto do OLED ocupa.
  attach(canvas, scale) {
    canvas.width = OLED_W * scale;
    canvas.height = OLED_H * scale;
    this.targets.push({ canvas, ctx: canvas.getContext('2d'), scale });
  }

  set(x, y) { if (x >= 0 && x < OLED_W && y >= 0 && y < OLED_H) this.pixels[y * OLED_W + x] = 1; }

  text(x, y, str) {
    for (const ch of str) {
      const glyph = FONT[ch.charCodeAt(0) - 32] ?? FONT[0];
      for (let col = 0; col < 5; col++) for (let row = 0; row < 7; row++) if (glyph[col] >> row & 1) this.set(x + col, y + row);
      x += 6;
    }
  }

  render(frame) {
    this.pixels.fill(0);
    for (const line of oledLines(frame)) this.text(0, line.y, line.text);
    for (let x = 0; x < OLED_W; x++) this.set(x, 10);
    this.flush();
  }

  flush() {
    for (const { canvas, ctx, scale } of this.targets) {
      ctx.fillStyle = '#020608';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#8fe9ff';
      const dot = scale > 3 ? scale - 1 : scale;
      for (let y = 0; y < OLED_H; y++) for (let x = 0; x < OLED_W; x++) {
        if (this.pixels[y * OLED_W + x]) ctx.fillRect(x * scale, y * scale, dot, dot);
      }
    }
  }
}
