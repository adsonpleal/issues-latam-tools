import { ATTACHMENT_MAX_BYTES } from "./anexos";

const LADO_MAX_INICIAL = 1600;

/**
 * Reduz a imagem no navegador até caber no teto de um documento do Firestore.
 * Print de celular chega com 3–5 MB; depois disto fica em 150–400 kB, que é
 * mais do que suficiente para enxergar um bug de interface.
 *
 * Vai apertando em passes: primeiro baixa a qualidade, depois encolhe o lado
 * maior. Sai em WebP, que rende bem melhor que JPEG nesse tipo de captura.
 */
export async function reduzirImagem(
  file: File,
): Promise<{ data: Uint8Array; name: string }> {
  const bitmap = await createImageBitmap(file);

  try {
    let lado = LADO_MAX_INICIAL;
    let qualidade = 0.82;

    for (let tentativa = 0; tentativa < 6; tentativa++) {
      const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
      const largura = Math.max(1, Math.round(bitmap.width * escala));
      const altura = Math.max(1, Math.round(bitmap.height * escala));

      const canvas = document.createElement("canvas");
      canvas.width = largura;
      canvas.height = altura;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("sem canvas 2d");
      ctx.drawImage(bitmap, 0, 0, largura, altura);

      const blob = await new Promise<Blob | null>((r) =>
        canvas.toBlob(r, "image/webp", qualidade),
      );
      if (!blob) throw new Error("falha ao converter a imagem");

      if (blob.size <= ATTACHMENT_MAX_BYTES) {
        return { data: new Uint8Array(await blob.arrayBuffer()), name: nomeWebp(file.name) };
      }

      // Duas rodadas mexendo só na qualidade; depois começa a encolher.
      if (tentativa < 2) qualidade -= 0.15;
      else lado = Math.round(lado * 0.7);
    }

    throw new Error("imagem grande demais mesmo depois de reduzir");
  } finally {
    bitmap.close();
  }
}

function nomeWebp(name: string): string {
  const base = name.replace(/\.[^.]+$/, "") || "imagem";
  return `${base.slice(0, 180)}.webp`;
}
