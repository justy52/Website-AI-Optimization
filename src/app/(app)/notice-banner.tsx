"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { checkNoticeAction } from "./notice-actions";

/** Shows the explanation a form action sent back, once the server confirms it wrote it. */
export function NoticeBanner() {
  const params = useSearchParams();
  const problem = params.get("problem") ?? "";
  const signature = params.get("sig") ?? "";
  const [shown, setShown] = useState("");

  useEffect(() => {
    let current = true;
    if (!problem || !signature) return;
    checkNoticeAction(problem, signature).then((valid) => {
      if (current) setShown(valid ? problem : "");
    }).catch(() => undefined);
    return () => { current = false; };
  }, [problem, signature]);

  if (!problem || shown !== problem) return null;
  return <p className="mx-notice-problem" role="alert">{shown}</p>;
}
