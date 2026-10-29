// Reduce fotografías en el dispositivo. Solo se envía la imagen reducida.
export async function productPhoto(file) {
  if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type))
    throw new Error("Elige una foto JPEG, PNG o WebP.");
  if (file.size > 15 * 1024 * 1024)
    throw new Error("La foto debe pesar menos de 15 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    let size = 480;
    for (let attempt = 0; attempt < 7; attempt++) {
      const ratio = Math.min(
        1,
        size / Math.max(image.naturalWidth, image.naturalHeight),
      );
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.65, 0.48, 0.32]) {
        const data = canvas.toDataURL("image/jpeg", quality);
        if (data.length <= 45000) return data;
      }
      size = Math.floor(size * 0.8);
    }
    throw new Error("No se pudo reducir esta foto. Prueba otra imagen.");
  } catch (error) {
    throw new Error(
      error.message?.startsWith("No se pudo reducir")
        ? error.message
        : "No se pudo leer la foto. Elige una imagen JPEG, PNG o WebP.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function importPhoto(value) {
  if (!value) return "";
  if (typeof value !== "string")
    throw new Error("Hay una foto con un formato no válido.");
  if (value.length <= 45000) {
    if (
      /^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(
        value,
      ) ||
      (value.length <= 3000 &&
        /^https:\/\/[^\s/@?#]+(?:[/?#][^\s]*)?$/.test(value))
    )
      return value;
    throw new Error(
      "Hay una foto no compatible en el archivo. Usa imágenes JPEG, PNG o WebP.",
    );
  }
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/.test(value))
    throw new Error("Una foto es demasiado grande o no es compatible.");
  const response = await fetch(value);
  return productPhoto(await response.blob());
}
