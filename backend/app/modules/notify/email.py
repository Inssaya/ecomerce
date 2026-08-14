"""Transactional email, in English and Arabic.

Two things were wrong with the ported templates and are fixed here.

* Each one carried its own full copy of the same HTML wrapper, so a change to
  the shell meant editing it in five places. There is one `_layout` now and the
  templates are just their content.
* They were English-only and styled black-on-orange. The palette is the warm
  one from REBUILD-PLAN §8, and Arabic mail renders right-to-left with its own
  copy — not a translation of the English sentence order (BRAND.md §9).
"""
from __future__ import annotations

import html as html_module
import logging
import re
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

from app.config import settings

logger = logging.getLogger(__name__)

CREAM = "#FAF6F0"
SURFACE = "#FFFFFF"
INK = "#2E2A26"
MUTED = "#7A7069"
CLAY = "#B4785A"
SAND = "#E8DFD4"


def _layout(*, lang: str, heading: str, blocks: list[str], action: tuple[str, str] | None = None) -> str:
    rtl = lang == "ar"
    direction = "rtl" if rtl else "ltr"
    align = "right" if rtl else "left"
    family = (
        "'Noto Naskh Arabic','Segoe UI',Tahoma,sans-serif"
        if rtl
        else "'Inter','Segoe UI',Helvetica,Arial,sans-serif"
    )
    body = "".join(
        f'<p style="margin:0 0 14px;font-size:16px;line-height:1.75;color:{INK};">{block}</p>'
        for block in blocks
    )
    button = ""
    if action is not None:
        label, href = action
        button = (
            f'<p style="margin:28px 0 0;"><a href="{href}" '
            f'style="display:inline-block;padding:14px 30px;background:{CLAY};color:#fff;'
            f'border-radius:14px;text-decoration:none;font-size:16px;font-weight:600;">{label}</a></p>'
        )
    signature = "ورشة " + settings.app_name if rtl else f"The {settings.app_name} workshop"
    return f"""<!doctype html>
<html lang="{lang}" dir="{direction}">
  <body style="margin:0;padding:28px 16px;background:{CREAM};font-family:{family};direction:{direction};text-align:{align};">
    <div style="max-width:560px;margin:0 auto;background:{SURFACE};border-radius:24px;padding:36px 30px;">
      <h1 style="margin:0 0 20px;font-size:23px;line-height:1.45;font-weight:600;color:{INK};">{heading}</h1>
      {body}
      {button}
      <hr style="border:0;border-top:1px solid {SAND};margin:32px 0 18px;" />
      <p style="margin:0;font-size:13px;line-height:1.7;color:{MUTED};">{signature}</p>
    </div>
  </body>
</html>"""


#: The port that means implicit TLS. Everything else that encrypts does it by
#: upgrading a plain connection with STARTTLS.
IMPLICIT_TLS_PORT = 465


def _plain_text(html: str) -> str:
    """A readable text version of the message.

    Deliberately crude — these templates are a handful of paragraphs and one
    button, not arbitrary HTML — but it has to exist. A `multipart/alternative`
    carrying only an HTML part is one of the oldest and most reliable spam
    signals there is, and in a cash-on-delivery shop an order update in the
    junk folder is a package refused at the door by someone who never knew it
    was coming.
    """
    text = re.sub(r"<br\s*/?>", "\n", html)
    text = re.sub(r"</(p|h1|h2|div|tr)>", "\n\n", text)
    # Keep the link's address, since the button is the whole point of most of
    # these messages.
    text = re.sub(r'<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>', r"\2: \1", text, flags=re.S)
    text = re.sub(r"<[^>]+>", "", text)
    text = html_module.unescape(text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


async def send_email(to: str, subject: str, html: str) -> bool:
    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = f"{settings.app_name} <{settings.smtp_from}>"
    message["To"] = to
    # Order matters in `alternative`: least preferred first, so a client that
    # can render HTML still picks the HTML.
    message.attach(MIMEText(_plain_text(html), "plain", "utf-8"))
    message.attach(MIMEText(html, "html", "utf-8"))

    # Implicit TLS on 465, STARTTLS everywhere else.
    #
    # This used to pass `use_tls=SMTP_TLS, start_tls=False`, which is implicit
    # TLS — correct only on 465. Every common provider (Resend, Brevo,
    # Postmark, Gmail) listens on 587 and expects the connection to be upgraded
    # with STARTTLS, so setting SMTP_TLS=true with the port they give you made
    # every message fail. Silently, because sending is deliberately
    # non-fatal — which is exactly how a shop discovers it three weeks in.
    implicit = settings.smtp_tls and settings.smtp_port == IMPLICIT_TLS_PORT
    upgrade = settings.smtp_tls and not implicit

    try:
        await aiosmtplib.send(
            message,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user or None,
            password=settings.smtp_password or None,
            use_tls=implicit,
            start_tls=upgrade,
        )
        return True
    except Exception as exc:
        # A failed email must never fail the order it was reporting on.
        logger.error("Email to %s failed (%s): %s", to, subject, exc)
        return False


async def send_password_reset(*, to: str, lang: str, reset_url: str) -> bool:
    if lang == "ar":
        subject = f"إعادة تعيين كلمة السر — {settings.app_name}"
        html = _layout(
            lang="ar",
            heading="إعادة تعيين كلمة السر",
            blocks=[
                "طلبت إعادة تعيين كلمة السر لحسابك.",
                "الرابط صالح لمدة ساعة واحدة. إن لم تطلب هذا، تجاهل الرسالة ولن يتغير شيء.",
            ],
            action=("اختر كلمة سر جديدة", reset_url),
        )
    else:
        subject = f"Reset your password — {settings.app_name}"
        html = _layout(
            lang="en",
            heading="Reset your password",
            blocks=[
                "You asked to reset the password on your account.",
                "This link works for one hour. If you didn't ask for it, ignore "
                "this email — nothing changes.",
            ],
            action=("Choose a new password", reset_url),
        )
    return await send_email(to, subject, html)


async def send_order_update(
    *,
    to: str,
    lang: str,
    reference: str,
    heading_en: str,
    heading_ar: str,
    lines_en: list[str],
    lines_ar: list[str],
    track_url: str,
) -> bool:
    if lang == "ar":
        return await send_email(
            to,
            f"طلبك {reference} — {settings.app_name}",
            _layout(
                lang="ar",
                heading=heading_ar,
                blocks=lines_ar,
                action=("تتبّع الطلب", track_url),
            ),
        )
    return await send_email(
        to,
        f"Order {reference} — {settings.app_name}",
        _layout(
            lang="en",
            heading=heading_en,
            blocks=lines_en,
            action=("Track your order", track_url),
        ),
    )
