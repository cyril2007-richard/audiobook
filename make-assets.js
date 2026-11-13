const fs = require('fs');
const sharp = require('sharp');

const SRC = 'logo.svg';
const OUT = 'assets/images';
const VB = { x: 20, y: 470, w: 2008, h: 1108 };

const raw = fs.readFileSync(SRC, 'utf8');
const noBg = raw.replace(/<path[^>]*fill="rgb\(0,0,0\)"[^>]*\/>/, '');

function logoSvg(widthPx, color) {
  const heightPx = Math.round((widthPx * VB.h) / VB.w);
  return {
    heightPx,
    svg: noBg
      .replace(/viewBox="[^"]*"/, `viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}"`)
      .replace(/width="\d+"/, `width="${widthPx}"`)
      .replace(/height="\d+"/, `height="${heightPx}"`)
      .replace(/preserveAspectRatio="none"/, 'preserveAspectRatio="xMidYMid meet"')
      .replace(/fill="rgb\(254,254,254\)"/g, `fill="${color}"`),
  };
}

async function makeIcon(file, canvas, background, logoWidth, color) {
  const { svg } = logoSvg(logoWidth, color);
  await sharp({ create: { width: canvas, height: canvas, channels: 4, background } })
    .composite([{ input: Buffer.from(svg), gravity: 'center' }])
    .png()
    .toFile(`${OUT}/${file}`);
  console.log('created', file);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await makeIcon('icon.png', 1024, '#000000', 800, '#FEFEFE');
  await makeIcon('android-icon-foreground.png', 1024, { r: 0, g: 0, b: 0, alpha: 0 }, 620, '#FEFEFE');
  await makeIcon('android-icon-monochrome.png', 1024, { r: 0, g: 0, b: 0, alpha: 0 }, 620, '#FFFFFF');
  await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .png()
    .toFile(`${OUT}/splash-transparent.png`);
  console.log('created splash-transparent.png');
})();
