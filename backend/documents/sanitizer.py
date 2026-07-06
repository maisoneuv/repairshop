"""
HTML sanitization for form templates (security audit 2026-07, M-2).

Templates are authored as full HTML pages (CKEditor fullPage) and rendered
back to staff browsers as text/html and to a server-side Chromium for PDF
generation — both are script-execution contexts, so everything that goes in
must come out script-free.

The allowlist keeps document structure, tables, images and CSS (<style> and
style attributes) so print layouts keep working; nh3 strips script tags,
event handlers and javascript: URLs. CSS itself cannot execute script in
modern browsers, so raw CSS passthrough is acceptable here.
"""
import nh3

ALLOWED_TAGS = {
    # document structure (nh3 unwraps html/head/body but keeps their content)
    'html', 'head', 'body', 'title', 'style',
    # sectioning / layout
    'div', 'span', 'section', 'article', 'header', 'footer', 'main', 'nav',
    'figure', 'figcaption', 'address',
    # text
    'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 's', 'small', 'sub', 'sup',
    'blockquote', 'pre', 'code', 'abbr', 'cite', 'q', 'mark', 'time', 'label',
    # lists
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    # tables
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'caption', 'colgroup', 'col',
    # media / links
    'img', 'a',
}

ALLOWED_ATTRIBUTES = {
    '*': {
        'class', 'id', 'style', 'dir', 'lang', 'title',
        'align', 'valign', 'width', 'height', 'border',
        'cellpadding', 'cellspacing', 'colspan', 'rowspan',
    },
    'img': {'src', 'alt'},
    'a': {'href'},
    'col': {'span'},
    'time': {'datetime'},
}

# data: is needed for inline logo images; nh3 still strips javascript: etc.
ALLOWED_URL_SCHEMES = {'http', 'https', 'mailto', 'data'}


def sanitize_template_html(html):
    """Return html with scripts, event handlers and js-URLs removed."""
    if not html:
        return html
    return nh3.clean(
        html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        url_schemes=ALLOWED_URL_SCHEMES,
        clean_content_tags={'script'},
    )
