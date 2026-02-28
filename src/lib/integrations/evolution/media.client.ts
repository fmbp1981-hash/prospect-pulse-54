/**
 * FLUXO 3 - EVOLUTION API MEDIA CLIENT
 * Equivalente nativo aos nodes "getAudio", "getImage", "getImage1" do n8n.
 * Baixa mídias da Evolution API em base64.
 */

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL!;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY!;

interface MediaDownloadResult {
  base64: string;
  mimetype: string;
  buffer: Buffer;
}

async function downloadMedia(
  instanceName: string,
  messageId: string
): Promise<MediaDownloadResult> {
  const url = `${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${instanceName}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_API_KEY,
    },
    body: JSON.stringify({ message: { key: { id: messageId } } }),
  });

  if (!response.ok) {
    throw new Error(
      `Evolution API media download failed: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as {
    base64: string;
    mimetype: string;
  };

  return {
    base64: data.base64,
    mimetype: data.mimetype,
    buffer: Buffer.from(data.base64, 'base64'),
  };
}

export const evolutionMediaClient = {
  downloadAudio: (instanceName: string, messageId: string) =>
    downloadMedia(instanceName, messageId),

  downloadImage: (instanceName: string, messageId: string) =>
    downloadMedia(instanceName, messageId),

  downloadDocument: (instanceName: string, messageId: string) =>
    downloadMedia(instanceName, messageId),
};
