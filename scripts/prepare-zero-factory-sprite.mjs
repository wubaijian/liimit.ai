import process from 'node:process';
import sharp from 'sharp';

const [inputPath, outputPath, mode = 'preserve'] = process.argv.slice(2);

if (
  !inputPath ||
  !outputPath ||
  !['preserve', 'checker', 'magenta'].includes(mode)
) {
  throw new Error(
    'Usage: node scripts/prepare-zero-factory-sprite.mjs <input> <output> <preserve|checker|magenta>',
  );
}

const source = sharp(inputPath);
const metadata = await source.metadata();
if (!metadata.width || !metadata.height) {
  throw new Error(`Unable to read image size: ${inputPath}`);
}

// Phaser slices these sheets into three equal columns, so keep the width
// divisible by three even when the image generator returns an odd size.
const width = Math.floor(metadata.width / 3) * 3;
const height = metadata.height;
const { data } = await source
  .extract({ left: 0, top: 0, width, height })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

if (mode === 'checker') {
  const pixels = width * height;
  const visited = new Uint8Array(pixels);
  const queue = new Int32Array(pixels);
  let head = 0;
  let tail = 0;

  const isBackground = (index) => {
    const offset = index * 4;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const minimum = Math.min(red, green, blue);
    const maximum = Math.max(red, green, blue);
    return minimum >= 205 && maximum - minimum <= 30;
  };

  const enqueue = (index) => {
    if (!visited[index] && isBackground(index)) {
      visited[index] = 1;
      queue[tail++] = index;
    }
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    data[index * 4 + 3] = 0;
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }
}

if (mode === 'magenta') {
  const backgroundRed = data[0];
  const backgroundGreen = data[1];
  const backgroundBlue = data[2];
  for (let offset = 0; offset < data.length; offset += 4) {
    const redDistance = data[offset] - backgroundRed;
    const greenDistance = data[offset + 1] - backgroundGreen;
    const blueDistance = data[offset + 2] - backgroundBlue;
    const distance = Math.sqrt(
      redDistance * redDistance +
        greenDistance * greenDistance +
        blueDistance * blueDistance,
    );
    if (distance <= 55) {
      data[offset + 3] = 0;
    } else if (distance < 115) {
      data[offset + 3] = Math.round(((distance - 55) / 60) * data[offset + 3]);
    }
  }
}

await sharp(data, { raw: { width, height, channels: 4 } })
  .png()
  .toFile(outputPath);
