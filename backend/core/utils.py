from django.db import models
from .models import Note
from django.contrib.contenttypes.models import ContentType


def get_nested_attr(obj, field_path):
    """Allows dot notation like 'foreignkey.some_property'."""
    parts = field_path.split(".")
    for part in parts:
        if obj is None:
            return None
        obj = getattr(obj, part, None)
    return obj


def build_table_data(queryset, columns):
    """
    Transforms a queryset into a structured format of rows & columns for use in templates.

    :param queryset: A Django queryset (list of model instances)
    :param columns: A list of dictionaries defining the columns (same format used in ListView)
    :return: A list of row dictionaries, each containing cell values ready for the table template
    """
    all_rows = []
    for obj in queryset:
        row_data = []
        for col in columns:
            # 1) Field value
            field_value = None
            if col.get("field"):
                field_value = get_nested_attr(obj, col["field"])

            # 2) URL parameter (if it's a link)
            url_param = None
            if col.get("is_link"):
                param_name = col.get("url_field", "pk")
                url_param = get_nested_attr(obj, param_name)

            # 3) Display text
            display_text = field_value
            if col.get("display_field"):
                display_text = get_nested_attr(obj, col["display_field"])
            elif col.get("constant_text"):
                display_text = col["constant_text"]

            row_data.append({
                "column": col,
                "object": obj,
                "value": field_value,
                "url_param": url_param,
                "display_text": display_text,
            })
        all_rows.append(row_data)

    return all_rows

def get_model_schema(model_class):
    schema = {}

    for field in model_class._meta.get_fields():
        if not isinstance(field, models.Field):
            continue  # Skip reverse/many-to-many relations for now

        # Skip auto fields (like ID) and auto-created timestamps
        if isinstance(field, models.AutoField):
            continue

        field_info = {
            "type": get_field_type(field),
            "required": not field.blank,
            "default": field.default if field.default is not models.NOT_PROVIDED else None,
        }

        if field.choices:
            field_info["choices"] = list(field.choices)

        if isinstance(field, (models.ForeignKey, models.OneToOneField)):
            field_info["related_model"] = field.related_model.__name__
            field_info["related_app"] = field.related_model._meta.app_label
            field_info["type"] = "foreignkey"

        schema[field.name] = field_info

    return schema


def get_field_type(field):
    if isinstance(field, models.CharField):
        return "string"
    if isinstance(field, models.TextField):
        return "text"
    if isinstance(field, models.BooleanField):
        return "boolean"
    if isinstance(field, models.DateField):
        return "date"
    if isinstance(field, models.DateTimeField):
        return "datetime"
    if isinstance(field, models.DecimalField):
        return "decimal"
    if isinstance(field, models.IntegerField):
        return "integer"
    return "string"  # fallback

def create_system_note(obj, message):
    Note.objects.create(
        content=message,
        content_type=ContentType.objects.get_for_model(obj.__class__),
        object_id=obj.pk,
        author=None  # System note
    )