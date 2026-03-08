"""
Service d'envoi d'emails avec Brevo (ex-Sendinblue)
"""
import sib_api_v3_sdk
from sib_api_v3_sdk.rest import ApiException

from ..config import settings

# Configurer Brevo
configuration = sib_api_v3_sdk.Configuration()
configuration.api_key['api-key'] = settings.BREVO_API_KEY
api_instance = sib_api_v3_sdk.TransactionalEmailsApi(sib_api_v3_sdk.ApiClient(configuration))


def send_email(to_email: str, subject: str, html_content: str, text_content: str = "") -> bool:
    """
    Envoyer un email via Brevo

    Args:
        to_email: Adresse email du destinataire
        subject: Sujet de l'email
        html_content: Contenu HTML
        text_content: Contenu texte (optionnel)

    Returns:
        True si l'email a ete envoye, False sinon
    """
    try:
        print(f"[EMAIL] Envoi email a: {to_email}")
        print(f"[EMAIL] Sujet: {subject}")
        print(f"[EMAIL] Expediteur: {settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM}>")

        send_smtp_email = sib_api_v3_sdk.SendSmtpEmail(
            to=[{"email": to_email}],
            sender={"name": settings.EMAIL_FROM_NAME, "email": settings.EMAIL_FROM},
            subject=subject,
            html_content=html_content,
            text_content=text_content if text_content else None
        )
        response = api_instance.send_transac_email(send_smtp_email)
        print(f"[EMAIL] Succes! Message ID: {response.message_id}")
        return True
    except ApiException as e:
        print(f"[EMAIL] Erreur Brevo ApiException: {e}")
        return False
    except Exception as e:
        print(f"[EMAIL] Erreur inattendue: {type(e).__name__}: {e}")
        return False


def send_welcome_email(to_email: str, prenom: str, activation_link: str) -> bool:
    """
    Envoyer un email de bienvenue avec le lien d'activation
    """
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 480px; margin: 0 auto; padding: 40px 20px; }}
            .logo {{ text-align: center; margin-bottom: 30px; }}
            .logo-icon {{ width: 48px; height: 48px; background: #059669; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; }}
            .button {{ display: inline-block; background: #059669; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 24px 0; }}
            .info {{ background: #F3F4F6; border-radius: 12px; padding: 20px; margin: 24px 0; }}
            .warning {{ background: #FEF3C7; border-radius: 8px; padding: 12px 16px; margin: 16px 0; color: #92400E; font-size: 14px; }}
            .footer {{ color: #9CA3AF; font-size: 12px; text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #E5E7EB; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h2 style="text-align: center; color: #111827;">Bienvenue sur Marketym !</h2>

            <p>Bonjour {prenom},</p>

            <p>Votre compte a ete cree avec succes. Pour activer votre compte, cliquez sur le bouton ci-dessous pour definir votre mot de passe :</p>

            <div style="text-align: center;">
                <a href="{activation_link}" class="button" style="color: white;">Activer mon compte</a>
            </div>

            <div class="info">
                <p style="margin: 0; font-size: 14px; color: #6B7280;">
                    <strong>Votre email de connexion :</strong><br>
                    <span style="color: #111827; font-family: monospace;">{to_email}</span>
                </p>
            </div>

            <div class="warning">
                <strong>Important :</strong> Ce lien expire dans 48 heures.
            </div>

            <p style="font-size: 13px; color: #6B7280;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
            <a href="{activation_link}" style="color: #059669; word-break: break-all;">{activation_link}</a></p>

            <div class="footer">
                <p>Marketym - Plateforme de suivi d'enquetes</p>
            </div>
        </div>
    </body>
    </html>
    """

    text_content = f"""
Bienvenue sur Marketym !

Bonjour {prenom},

Votre compte a ete cree. Cliquez sur le lien ci-dessous pour activer votre compte :

{activation_link}

Ce lien expire dans 48 heures.

--
Marketym - Plateforme de suivi d'enquetes
"""

    return send_email(to_email, "Bienvenue sur Marketym - Activez votre compte", html_content, text_content)


def send_password_reset_email(to_email: str, prenom: str, new_password: str) -> bool:
    """
    Envoyer un email avec le nouveau mot de passe (legacy, plus utilise)
    """
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 480px; margin: 0 auto; padding: 40px 20px; }}
            .password-box {{ background: #F3F4F6; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0; }}
            .password {{ font-size: 24px; font-weight: bold; letter-spacing: 2px; color: #059669; font-family: monospace; }}
            .footer {{ color: #9CA3AF; font-size: 12px; text-align: center; margin-top: 40px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h2 style="text-align: center; color: #111827;">Reinitialisation du mot de passe</h2>
            <p>Bonjour {prenom},</p>
            <p>Votre nouveau mot de passe temporaire :</p>
            <div class="password-box">
                <div class="password">{new_password}</div>
            </div>
            <div class="footer">
                <p>Marketym - Plateforme de suivi d'enquetes</p>
            </div>
        </div>
    </body>
    </html>
    """

    return send_email(to_email, "Reinitialisation de votre mot de passe Marketym", html_content)


def send_otp_email(to_email: str, code: str, prenom: str = "") -> bool:
    """
    Envoyer un email avec le code OTP
    """
    greeting = f"Bonjour {prenom}," if prenom else "Bonjour,"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 480px; margin: 0 auto; padding: 40px 20px; }}
            .logo {{ text-align: center; margin-bottom: 30px; }}
            .code-box {{ background: #F3F4F6; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0; }}
            .code {{ font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #059669; font-family: monospace; }}
            .expire {{ color: #6B7280; font-size: 14px; margin-top: 8px; }}
            .footer {{ color: #9CA3AF; font-size: 12px; text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #E5E7EB; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h2 style="text-align: center; color: #111827;">Code de verification</h2>

            <p>{greeting}</p>

            <p>Voici votre code de verification :</p>

            <div class="code-box">
                <div class="code">{code}</div>
                <div class="expire">Ce code expire dans {settings.OTP_EXPIRE_MINUTES} minutes</div>
            </div>

            <p>Si vous n'avez pas demande ce code, vous pouvez ignorer cet email.</p>

            <div class="footer">
                <p>Marketym - Plateforme de suivi d'enquetes</p>
            </div>
        </div>
    </body>
    </html>
    """

    text_content = f"""
{greeting}

Voici votre code de verification : {code}

Ce code expire dans {settings.OTP_EXPIRE_MINUTES} minutes.

--
Marketym - Plateforme de suivi d'enquetes
"""

    return send_email(to_email, f"Votre code de verification : {code}", html_content, text_content)
