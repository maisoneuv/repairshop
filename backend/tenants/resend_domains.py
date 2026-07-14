"""
Thin client for the Resend Domains API, used by the tenant custom-domain wizard.

https://resend.com/docs/api-reference/domains
"""
import requests
from django.conf import settings


class ResendDomainError(Exception):
    """Raised when a Resend Domains API call fails."""

    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.status_code = status_code


def _request(method, path, json=None):
    api_key = settings.ANYMAIL.get('RESEND_API_KEY', '')
    if not api_key:
        raise ResendDomainError("RESEND_API_KEY is not configured on the server.")

    response = requests.request(
        method,
        f"https://api.resend.com{path}",
        json=json,
        headers={'Authorization': f'Bearer {api_key}'},
        timeout=15,
    )
    if not response.ok:
        try:
            detail = response.json().get('message', response.text)
        except ValueError:
            detail = response.text
        raise ResendDomainError(detail or f'Resend API error ({response.status_code})',
                                status_code=response.status_code)
    return response.json() if response.content else {}


def create_domain(name):
    """Register a domain in Resend. Returns the domain object incl. DNS records to add."""
    return _request('POST', '/domains', json={'name': name})


def get_domain(domain_id):
    """Fetch domain status and per-record verification state."""
    return _request('GET', f'/domains/{domain_id}')


def verify_domain(domain_id):
    """Trigger a DNS verification check."""
    return _request('POST', f'/domains/{domain_id}/verify')


def delete_domain(domain_id):
    """Remove a domain from Resend."""
    return _request('DELETE', f'/domains/{domain_id}')
