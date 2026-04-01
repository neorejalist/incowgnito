import { Router } from "express";
import type { Request, Response } from "express";
import { authenticate } from "../middleware/authenticate";
import * as aliasService from "../services/aliases";
import { config } from "../config";

const router = Router();

router.get("/account-details", authenticate, async (req: Request, res: Response) => {
  const aliases = await aliasService.listForUser(req.user!.email);

  res.json({
    data: {
      id: req.user!.id,
      email: req.user!.email,
      default_alias_domain: config.relay.domain,
      alias_count: aliases.length,
    },
  });
});

export default router;
