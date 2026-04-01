import { Router } from "express";
import type { Request, Response } from "express";
import { authenticate } from "../middleware/authenticate";
import * as mailcow from "../services/mailcow";
import * as aliasService from "../services/aliases";
import { generateLocalPart } from "../utils/crypto";
import { toAliasResponse } from "../utils/format";
import { config } from "../config";

const router = Router();

router.use(authenticate);

router.get("/", async (req: Request, res: Response) => {
  const aliases = await aliasService.listForUser(req.user!.email);
  res.json({ data: aliases.map(toAliasResponse) });
});

router.post("/", async (req: Request, res: Response) => {
  const customLocalPart = (req.body.local_part as string)?.trim();
  const localPart = customLocalPart || generateLocalPart();
  const address = `${localPart}@${config.relay.domain}`;

  try {
    const created = await mailcow.createAlias(address, req.user!.email);
    const alias = await aliasService.getById(created.id, req.user!.email);
    if (!alias) return res.status(502).json({ message: "Alias created but could not be retrieved" });

    res.status(201).json({ data: toAliasResponse(alias) });
  } catch (err) {
    console.error("Alias creation failed:", (err as Error).message);
    res.status(502).json({ message: "Failed to provision alias in mail server" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  const alias = await aliasService.getById(
    Number(req.params.id),
    req.user!.email
  );
  if (!alias) return res.status(404).json({ message: "Alias not found" });
  res.json({ data: toAliasResponse(alias) });
});

router.patch("/:id", async (req: Request, res: Response) => {
  const alias = await aliasService.getById(
    Number(req.params.id),
    req.user!.email
  );
  if (!alias) return res.status(404).json({ message: "Alias not found" });

  const active = req.body.active ?? alias.active === 1;

  try {
    await mailcow.setAliasActive(alias.id, active);
  } catch (err) {
    console.error("Alias update failed:", (err as Error).message);
    return res.status(502).json({ message: "Failed to update alias in mail server" });
  }

  const updated = await aliasService.getById(alias.id, req.user!.email);
  res.json({ data: toAliasResponse(updated!) });
});

router.delete("/:id", async (req: Request, res: Response) => {
  const alias = await aliasService.getById(
    Number(req.params.id),
    req.user!.email
  );
  if (!alias) return res.status(404).json({ message: "Alias not found" });

  try {
    await mailcow.deleteAlias(alias.id);
  } catch (err) {
    console.error("Alias deletion failed:", (err as Error).message);
    return res.status(502).json({ message: "Failed to remove alias from mail server" });
  }

  res.status(204).send();
});

export default router;
