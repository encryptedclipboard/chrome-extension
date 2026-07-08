export function getErrMsg(err: any): string {
  const meta = getErrMeta(err);
  return meta.message;
}

export function getErrMeta(err: any): {
  message: string;
  code?: string;
  status?: number;
} {
  const responseData =
    err?.response?.data ||
    err?.response ||
    (err?.response?.data as any) ||
    null;
  const message =
    responseData?.message ||
    responseData?.error ||
    err?.message ||
    "An unexpected error occurred";
  const code = responseData?.code || err?.code || err?.response?.code;
  const status = err?.response?.status || responseData?.status || undefined;
  return { message, code, status };
}
