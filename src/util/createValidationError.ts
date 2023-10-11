import createError from "http-errors";
import { INVALID_INPUT } from "../config/customErrorStatus";
const createValidationError = (
  { key, message }: { key: string; message: string },
  status = INVALID_INPUT
) => {
  const error = createError(status, "Event object failed validation");
  error.cause = {
    message: "Event object failed validation",
    statusCode: status,
    errors: [{ detail: message, meta: { property: key } }],
  };
  throw error;
};

export default createValidationError;
