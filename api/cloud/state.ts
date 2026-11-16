import {
  handleCloudStateGet,
  handleCloudStatePost,
  handleCloudStatePut,
  readRequestJsonBody,
  type NodeLikeRequest,
  type NodeLikeResponse,
} from "../../lib/apiHandlers.ts";

export default async function handler(req: NodeLikeRequest, res: NodeLikeResponse) {
  if (req.method === "GET") {
    const result = await handleCloudStateGet();
    return res.status(result.status).json(result.body);
  }

  if (req.method === "POST") {
    const body = await readRequestJsonBody(req);
    const result = await handleCloudStatePost(body);
    return res.status(result.status).json(result.body);
  }

  if (req.method === "PUT") {
    const body = await readRequestJsonBody(req);
    const result = await handleCloudStatePut(body);
    return res.status(result.status).json(result.body);
  }

  return res.status(405).json({ error: "Método não permitido." });
}
