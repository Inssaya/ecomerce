import logging

import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings

logger = logging.getLogger(settings.service_name)


async def send_email(to: str, subject: str, html_body: str) -> bool:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user or None,
            password=settings.smtp_password or None,
            use_tls=settings.smtp_tls,
            start_tls=False,
        )
        logger.info("Email sent to %s subject=%s", to, subject)
        return True
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to, exc)
        return False


ORDER_TEMPLATES = {
    "order.placed": (
        "Order #{order_id} confirmed — {app_name}",
        """
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#0a0a0a;color:#fff;border-radius:12px;">
          <h2 style="color:#f97316;margin-bottom:16px;">Thank you for your order!</h2>
          <p>Your order <strong>#{order_id}</strong> has been received and is being processed.</p>
          <p>Total amount: <strong style="color:#f97316;">{total} MAD</strong></p>
          <p>Track your order with code: <strong style="color:#f97316;">{tracking_token}</strong></p>
          <hr style="border-color:#333;margin:24px 0;" />
          <p style="color:#666;font-size:13px;">You will receive a notification when your order ships.</p>
          <p style="color:#666;font-size:13px;">{app_name}</p>
        </div>
        """,
    ),
    "order.assigned": (
        "Your order #{order_id} is on its way — {app_name}",
        """
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#0a0a0a;color:#fff;border-radius:12px;">
          <h2 style="color:#f97316;margin-bottom:16px;">Your order is out for delivery!</h2>
          <p>Order <strong>#{order_id}</strong> has been assigned to a delivery driver and is on its way to you.</p>
          <p>Track your order with code: <strong style="color:#f97316;">{tracking_token}</strong></p>
          <hr style="border-color:#333;margin:24px 0;" />
          <p style="color:#666;font-size:13px;">{app_name}</p>
        </div>
        """,
    ),
    "order.delivered": (
        "Order #{order_id} delivered — {app_name}",
        """
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#0a0a0a;color:#fff;border-radius:12px;">
          <h2 style="color:#f97316;margin-bottom:16px;">Order delivered successfully!</h2>
          <p>Your order <strong>#{order_id}</strong> has been delivered.</p>
          <p>We hope you enjoy your purchase. Thank you for choosing <strong>{app_name}</strong>!</p>
          <hr style="border-color:#333;margin:24px 0;" />
          <p style="color:#666;font-size:13px;">{app_name}</p>
        </div>
        """,
    ),
    "kyc.approved": (
        "Identity verified — {app_name}",
        """
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#0a0a0a;color:#fff;border-radius:12px;">
          <h2 style="color:#22c55e;margin-bottom:16px;">Identity Verified!</h2>
          <p>Congratulations! Your identity verification has been approved. Your account is now fully active.</p>
          <hr style="border-color:#333;margin:24px 0;" />
          <p style="color:#666;font-size:13px;">{app_name}</p>
        </div>
        """,
    ),
    "kyc.rejected": (
        "Identity verification declined — {app_name}",
        """
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#0a0a0a;color:#fff;border-radius:12px;">
          <h2 style="color:#ef4444;margin-bottom:16px;">Verification Declined</h2>
          <p>Unfortunately, your identity verification was declined.</p>
          <p>Reason: <strong>{rejection_reason}</strong></p>
          <p>Please resubmit with valid, clear documents.</p>
          <hr style="border-color:#333;margin:24px 0;" />
          <p style="color:#666;font-size:13px;">{app_name}</p>
        </div>
        """,
    ),
}


async def send_templated_email(to: str, event_type: str, context: dict) -> bool:
    template = ORDER_TEMPLATES.get(event_type)
    if not template:
        return False
    ctx = {"app_name": settings.app_name, **context}
    subject = template[0].format_map(ctx)
    body = template[1].format_map(ctx)
    return await send_email(to, subject, body)
