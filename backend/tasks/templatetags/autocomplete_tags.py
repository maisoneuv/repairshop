from django import template
from django.template.loader import render_to_string

register = template.Library()

@register.simple_tag(takes_context=True)
def autocomplete_input(context, name, url, placeholder=None, create_url=None, create_target=None):
    return render_to_string("components/autocomplete.html", {
        'name': name,
        'url': url,
        'placeholder': placeholder,
        'create_url': create_url,
        'create_target': create_target,
    }, request=context.get('request'))
