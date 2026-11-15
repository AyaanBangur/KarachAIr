/** Turn a chosen picture file into a small square JPEG (256 x 256) data URL, cropped from the centre. */
export function imageFileToSquare(file: File, out = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Please choose a picture file (JPG, PNG or WebP).'));
    if (file.size > 15 * 1024 * 1024) return reject(new Error('That picture is too large. Please choose one under 15 MB.'));
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement('canvas');
      c.width = c.height = out;
      const g = c.getContext('2d');
      if (!g) { URL.revokeObjectURL(url); return reject(new Error('Could not process that picture.')); }
      g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as a picture.')); };
    img.src = url;
  });
}
