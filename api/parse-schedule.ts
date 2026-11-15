import {
  handleParseSchedule,
  readRequestJsonBody,
  type NodeLikeRequest,
  type NodeLikeResponse,
} from "../lib/apiHandlers.ts";

export default async function handler(req: NodeLikeRequest, res: NodeLikeResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido." });
  }
  const body = await readRequestJsonBody(req);
  const result = await handleParseSchedule(body);
  return res.status(result.status).json(result.body);
}
