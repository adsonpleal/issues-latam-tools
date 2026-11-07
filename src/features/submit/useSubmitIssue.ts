import { useState } from "react";

import { t } from "../../i18n";
import { createIssue, type NewIssue } from "../../lib/issues";

/**
 * The stored key keeps its spelling: it is a localStorage key already set on
 * real machines.
 */
const WAIT_KEY = "issues.latamtools.ultimoEnvio";
const WAIT_MS = 60_000;

/**
 * A security rule cannot rate-limit. What the client can do is make the silly
 * case expensive: a one-minute wait between submissions and a honeypot field
 * only a robot fills in. Anybody who really wants to flood can -- the
 * documented plan B is turning App Check on with reCAPTCHA, and it is off.
 */
function waitLeft(): number {
  try {
    const last = Number(localStorage.getItem(WAIT_KEY) ?? 0);
    return Math.max(0, last + WAIT_MS - Date.now());
  } catch {
    return 0;
  }
}

function submitMark(): void {
  try {
    localStorage.setItem(WAIT_KEY, String(Date.now()));
  } catch {
    /* no persistence, no wait */
  }
}

export type SubmitState = "idle" | "sending" | "error";

export function useSubmitIssue() {
  const [state, setState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function submit(data: NewIssue & { honeypot?: string }): Promise<string | null> {
    // The attachments arrive ready from AttachmentField: shrunk, validated and
    // under the ceiling.
    if (data.honeypot) return null; // honeypot filled in: a robot, vanish quietly
    if (data.title.trim().length < 3) {
      setState("error");
      setErrorMessage(t.summaryTooShort);
      return null;
    }
    if (waitLeft() > 0) {
      setState("error");
      setErrorMessage(t.slowDown);
      return null;
    }

    setState("sending");
    setErrorMessage(null);
    try {
      const id = await createIssue(data);
      submitMark();
      setState("idle");
      return id;
    } catch {
      setState("error");
      setErrorMessage(t.submitError);
      return null;
    }
  }

  return { state, errorMessage, submit };
}
