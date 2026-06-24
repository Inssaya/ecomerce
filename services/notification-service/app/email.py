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
        "Commande #{order_id} confirmée — {app_name}",
        """
        <h2>Merci pour votre commande!</h2>
        <p>Votre commande <strong>#{order_id}</strong> a été reçue.</p>
        <p>Montant total: <strong>{total} MAD</strong></p>
        <p>Suivez votre commande avec le code: <strong>{tracking_token}</strong></p>
        """,
    ),
    "order.assigned": (
        "Votre commande #{order_id} est en cours de livraison",
        """
        <h2>Votre commande est assignée à un livreur!</h2>
        <p>Commande <strong>#{order_id}</strong> — livraison en cours.</p>
        """,
    ),
    "order.delivered": (
        "Commande #{order_id} livrée — {app_name}",
        """
        <h2>Commande livrée avec succès!</h2>
        <p>Votre commande <strong>#{order_id}</strong> a été livrée.</p>
        <p>Merci d'avoir choisi {app_name}!</p>
        """,
    ),
    "kyc.approved": (
        "Votre KYC a été approuvé — {app_name}",
        """
        <h2>Félicitations!</h2>
        <p>Votre vérification d'identité a été approuvée. Votre compte est maintenant actif.</p>
        """,
    ),
    "kyc.rejected": (
        "Votre KYC a été rejeté — {app_name}",
        """
        <h2>Vérification refusée</h2>
        <p>Votre vérification d'identité a été refusée.</p>
        <p>Raison: {rejection_reason}</p>
        <p>Veuillez soumettre à nouveau avec des documents valides.</p>
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
