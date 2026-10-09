export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_JPEG_BYTES = 12 * 1024;
const allowed = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function validatePhotoFile(file) {
  if (!file || !allowed.has(file.type)) throw new Error('Choose a PNG, JPEG or WebP image.');
  if (!file.size || file.size > MAX_PHOTO_BYTES) throw new Error('Choose an image no larger than 5 MiB.');
}

export function imageFormat(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if ([137,80,78,71,13,10,26,10].every((byte,index) => bytes[index] === byte)) return 'image/png';
  if ([82,73,70,70].every((byte,index) => bytes[index] === byte) && [87,69,66,80].every((byte,index) => bytes[index + 8] === byte)) return 'image/webp';
  return null;
}

export function jpegSize(dataUrl) {
  if (typeof dataUrl !== 'string' || !/^data:image\/jpeg;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(dataUrl)) return Infinity;
  const base64 = dataUrl.slice('data:image/jpeg;base64,'.length);
  return base64.length / 4 * 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
}

export async function preparePhoto(file) {
  validatePhotoFile(file);
  if (imageFormat(new Uint8Array(await file.slice(0,16).arrayBuffer())) !== file.type) throw new Error('This file is not a valid PNG, JPEG or WebP image.');
  let image;
  try { image = await createImageBitmap(file); }
  catch { throw new Error('This image cannot be opened. Choose another PNG, JPEG or WebP image.'); }
  try {
    if (!image.width || !image.height) throw new Error('This image has no visible pixels.');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is unavailable in this browser.');
    const side = Math.min(image.width, image.height);
    context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 128, 128);
    for (const quality of [.82, .68, .52, .36, .22, .12]) {
      const photo = canvas.toDataURL('image/jpeg', quality);
      if (jpegSize(photo) <= MAX_JPEG_BYTES && photo.length - 'data:image/jpeg;base64,'.length <= 16384) return photo;
    }
    throw new Error('This image cannot fit the 12 KiB photo limit. Choose a simpler image.');
  } finally { image.close(); }
}
