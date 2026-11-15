const MAX_UPLOAD_DIMENSION = 1600;

export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Não foi possível ler o arquivo selecionado."));
      }
    };
    reader.onerror = () => {
      reject(new Error("Falha ao ler a imagem selecionada."));
    };
    reader.readAsDataURL(file);
  });
}

export async function compressImageForUpload(
  file: File
): Promise<{ dataUrl: string; mimeType: string }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const imageEl = new Image();
      const decodeTimer = window.setTimeout(
        () => reject(new Error("Decode timeout")),
        10000
      );
      imageEl.onload = () => {
        window.clearTimeout(decodeTimer);
        resolve(imageEl);
      };
      imageEl.onerror = () => {
        window.clearTimeout(decodeTimer);
        reject(new Error("Decode failed"));
      };
      imageEl.src = objectUrl;
    });

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) {
      throw new Error("Dimensões inválidas");
    }

    const scale = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas unavailable");
    }
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return {
      dataUrl: compressedDataUrl,
      mimeType: "image/jpeg",
    };
  } catch {
    // Fallback for formats that canvas cannot decode (e.g., some mobile HEIC files)
    const fallbackUrl = await readFileAsDataUrl(file);
    return {
      dataUrl: fallbackUrl,
      mimeType: file.type || "image/jpeg",
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
