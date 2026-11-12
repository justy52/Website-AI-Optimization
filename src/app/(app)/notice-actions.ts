"use server";

import { isSignedNotice } from "@/server/notice";

export async function checkNoticeAction(message: string, signature: string) {
  return typeof message === "string" && typeof signature === "string" && isSignedNotice(message, signature);
}
