from django import template
from django.utils.html import format_html, conditional_escape

register = template.Library()

@register.simple_tag
def label(field, label_text, css_class="block font-medium"):
    if field.field.required:
        return format_html(
            '<label for="{}" class="{}">{} <span class="text-red-600">*</span></label>',
            field.id_for_label,
            css_class,
            label_text
        )
    return format_html(
        '<label for="{}" class="{}">{}</label>',
        field.id_for_label,
        css_class,
        label_text
    )

@register.simple_tag
def field(field, label_text, label_class="block font-medium", input_class="w-full border p-2 rounded"):
    """
    Renders a full form field block:
    - label (with optional asterisk)
    - input with Tailwind classes
    - error message if any
    """
    # Render label
    label_html = label(field, label_text, label_class)

    # Render input with classes
    widget = field.as_widget(attrs={"class": input_class})

    # Render error messages
    if field.errors:
        error_html = format_html(
            '<p class="text-red-600 text-sm mt-1">{}</p>',
            conditional_escape(field.errors[0])
        )
    else:
        error_html = ""

    return format_html('{}{}{}', label_html, widget, error_html)
