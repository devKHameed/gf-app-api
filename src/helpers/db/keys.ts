import { FUSION_SESSIONS } from "../../config";

export const getFusionSessionKey = (accountSlug: string) =>
  `${accountSlug}:${FUSION_SESSIONS}`;
