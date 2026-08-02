#!/usr/bin/env python3
"""Harwich zoning-case monitor.

Watches the town's 2026 case-applications page and emails when a new
zoning case NUMBER appears (ZB2026-NN). Detection keys purely on the
case number via regex, so edits to banners, footers, or page layout
never false-trigger.

Standard library only. No pip installs.

Environment variables (read at send time, never hardcoded):
  SMTP_USER  Gmail address the mail is sent from (also the SMTP login)
  SMTP_PASS  Gmail *app password* for that account (2-Step required)
  ALERT_TO   Recipient address for alerts

State is persisted in state.json next to this script:
  {"last_seen": int, "seeded": bool}
"""

import json
import os
import re
import smtplib
import ssl
import sys
import urllib.error
import urllib.request
from email.message import EmailMessage
from html import unescape
from pathlib import Path

PAGE_URL = "https://www.harwich-ma.gov/2026-case-applications"
STATE_PATH = Path(__file__).resolve().parent / "state.json"

# Detection is based ONLY on this pattern. Layout-independent by design.
CASE_RE = re.compile(r"ZB2026-(\d+)")

# A browser-like User-Agent; the town site rejects default urllib/bot agents.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 465


def fetch_page(url):
    """Return the page HTML as text, or raise on any failure."""
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        charset = resp.headers.get_content_charset() or "utf-8"
        return resp.read().decode(charset, errors="replace")


def strip_html(html):
    """Reduce HTML to readable plain text for best-effort descriptions."""
    # Drop script/style blocks entirely.
    html = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", html)
    # Turn block-level breaks into spaces so entries don't run together oddly.
    html = re.sub(r"(?is)<br\s*/?>", " ", html)
    html = re.sub(r"(?s)<[^>]+>", " ", html)
    text = unescape(html)
    return text


def parse_cases(html):
    """Return {case_number: description} for every ZB2026 case found.

    The description is best-effort and for display in the email body only;
    it is NEVER used for detection.
    """
    text = strip_html(html)
    matches = list(CASE_RE.finditer(text))
    cases = {}
    for i, m in enumerate(matches):
        num = int(m.group(1))
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        snippet = re.sub(r"\s+", " ", text[start:end]).strip()
        # Keep it short; entries read like "ZB2026-19, <type>, <address>".
        snippet = snippet[:200].strip(" ,;-")
        # Prefer the richest snippet if a number appears more than once.
        if num not in cases or len(snippet) > len(cases[num]):
            cases[num] = snippet
    return cases


def load_state():
    if not STATE_PATH.exists():
        return None
    try:
        data = json.loads(STATE_PATH.read_text())
    except (ValueError, OSError):
        return None
    if not isinstance(data, dict) or "last_seen" not in data:
        return None
    return data


def save_state(last_seen, seeded):
    STATE_PATH.write_text(
        json.dumps({"last_seen": int(last_seen), "seeded": bool(seeded)}, indent=2)
        + "\n"
    )


def send_email(subject, body):
    """Send mail via Gmail SMTP over SSL using an app password."""
    smtp_user = os.environ.get("SMTP_USER")
    smtp_pass = os.environ.get("SMTP_PASS")
    alert_to = os.environ.get("ALERT_TO")
    missing = [
        name
        for name, val in (
            ("SMTP_USER", smtp_user),
            ("SMTP_PASS", smtp_pass),
            ("ALERT_TO", alert_to),
        )
        if not val
    ]
    if missing:
        raise RuntimeError("Missing required env vars: " + ", ".join(missing))

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg["To"] = alert_to
    msg.set_content(body)

    context = ssl.create_default_context()
    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=context, timeout=60) as server:
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)


def send_failure_email():
    """Best-effort 'could not read the page' alert."""
    subject = "Harwich zoning monitor: could not read the page"
    body = (
        "The Harwich zoning monitor ran but could not parse any case "
        "numbers from the page.\n\n"
        "This usually means the page was unreachable, returned an error, "
        "or its structure changed. State was NOT updated, so no alerts "
        "were missed once the page is readable again.\n\n"
        f"Page: {PAGE_URL}\n"
    )
    send_email(subject, body)


def build_alert(new_cases, descriptions):
    """Compose the subject/body for one or more new cases."""
    labels = [f"ZB2026-{n}" for n in new_cases]
    subject = "New Harwich zoning case: " + ", ".join(labels)

    lines = [
        "New zoning case(s) posted to the Harwich case-applications page:",
        "",
    ]
    for n in new_cases:
        desc = descriptions.get(n, f"ZB2026-{n}")
        lines.append(f"  * {desc}")
    lines += ["", f"Page: {PAGE_URL}", ""]
    return subject, "\n".join(lines)


def main():
    # --- Fetch + parse, with the parse-failure guard around both. ---
    try:
        html = fetch_page(PAGE_URL)
        cases = parse_cases(html)
    except (urllib.error.URLError, OSError, ValueError) as exc:
        print(f"ERROR: could not fetch page: {exc}", file=sys.stderr)
        cases = {}
        html = None

    if not cases:
        # Zero cases parsed: do NOT touch state, warn once, exit nonzero.
        print("ERROR: zero cases parsed from page; state left unchanged.",
              file=sys.stderr)
        try:
            send_failure_email()
            print("Sent 'could not read the page' email.", file=sys.stderr)
        except Exception as exc:  # noqa: BLE001 - report but still fail
            print(f"ERROR: also failed to send failure email: {exc}",
                  file=sys.stderr)
        return 1

    current_max = max(cases.keys())
    print(f"Parsed {len(cases)} case(s); current max = ZB2026-{current_max}")

    state = load_state()

    # --- First run: seed state, send NO email. ---
    if state is None or not state.get("seeded"):
        save_state(current_max, True)
        print(f"Seeded state at last_seen={current_max}; no email sent.")
        return 0

    last_seen = int(state["last_seen"])

    # --- Later runs: alert for every case number greater than last_seen. ---
    new_cases = sorted(n for n in cases if n > last_seen)
    if not new_cases:
        print(f"No new cases (last_seen={last_seen}). Nothing to do.")
        return 0

    subject, body = build_alert(new_cases, cases)
    send_email(subject, body)
    print(f"Emailed alert for: {', '.join('ZB2026-%d' % n for n in new_cases)}")

    save_state(current_max, True)
    print(f"Updated last_seen to {current_max}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
