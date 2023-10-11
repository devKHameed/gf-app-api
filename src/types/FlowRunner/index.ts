import { Fusion } from "../Fusion";
import { ImportChunk } from "../UploadDesign";

export type SessionInitializerEvent = {
  accountSlug: string;
  userSlug: string;
  sessionInitVars?: SessionInitVars;
} & (
  | { fusion: Fusion; fusionSlug?: never }
  | { fusionSlug: string; fusion?: never }
);

export type SessionInitVars = {
  import_chunk?: ImportChunk;
  chunk_index?: number;
  skill_session_variables?: Record<string, unknown>;
  skill_user_variables?: Record<string, unknown>;
  [key: string]: unknown;
};

export type SessionExecutorEvent = {
  sessionSlug: string;
  accountSlug: string;
  initialInput: Record<string, unknown>;
};
