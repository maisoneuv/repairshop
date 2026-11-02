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

# Fields whose options come from the tenant's own PicklistValue rows rather
# than from Django choices, mapped to their PicklistValue category. Shared with
# the checkpoint-field serializer so both describe a field the same way.
PICKLIST_FIELDS = {
    'WorkItem': {
        'status': 'workitem_status',
        'type': 'workitem_type',
        'priority': 'workitem_priority',
        'intake_method': 'intake_method',
        'dropoff_method': 'dropoff_method',
        'payment_method': 'payment_method',
        'currency': 'currency',
    },
    'Task': {
        'status': 'task_status',
    },
}


def get_model_schema(model_class, tenant=None):
    """
    Generate schema information for a Django model.

    Args:
        model_class: The Django model class to introspect
        tenant: Optional tenant instance for fetching tenant-specific picklist values

    Returns:
        Dictionary containing field information including types, defaults, and choices
    """
    schema = {}

    model_name = model_class.__name__

    for field in model_class._meta.get_fields():
        if not isinstance(field, models.Field):
            continue  # Skip reverse/many-to-many relations for now

        # Skip auto fields (like ID) and auto-created timestamps
        if isinstance(field, models.AutoField):
            continue

        if field.default is models.NOT_PROVIDED:
            default_value = None
        elif callable(field.default):
            try:
                default_value = field.default()
            except Exception:
                default_value = None
        else:
            default_value = field.default

        field_info = {
            "type": get_field_type(field),
            "required": not field.blank,
            "default": default_value,
        }

        # Check if this field uses dynamic picklists
        if (model_name in PICKLIST_FIELDS and
            field.name in PICKLIST_FIELDS[model_name]):

            category = PICKLIST_FIELDS[model_name][field.name]

            # Fetch active picklist values for this tenant and category
            if tenant:
                # Import here to avoid circular dependency
                from .models import PicklistValue
                choices = PicklistValue.objects.filter(
                    tenant=tenant,
                    category=category,
                    is_active=True
                ).order_by('sort_order', 'name').values_list('value', 'name')

                field_info["choices"] = list(choices)
            else:
                field_info["choices"] = []

        # Handle traditional hardcoded choices (for backwards compatibility)
        elif field.choices:
            field_info["choices"] = list(field.choices)

        # Handle foreign keys
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


_TRUTHY = {'true', 'yes', '1', 'on'}
_FALSY = {'false', 'no', '0', 'off', ''}


def as_bool(value):
    """Coerce a loosely-typed boolean; None if `value` isn't recognisably one.

    Checkbox custom fields are stored as free-form JSON, so the same tick
    arrives as True, "true" or 1 depending on which client wrote it.
    """
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in _TRUTHY:
            return True
        if lowered in _FALSY:
            return False
    return None


def validate_custom_field_values(tenant, model_name, values: dict):
    from rest_framework import serializers
    from core.models import CustomField

    if not isinstance(values, dict):
        raise serializers.ValidationError({'custom_fields': 'Must be an object.'})

    fields = CustomField.objects.filter(tenant=tenant, model_name=model_name, is_active=True)
    errors = {}

    for field in fields:
        val = values.get(field.field_key)
        empty = val is None or val == ''

        if field.is_required and empty:
            errors[field.field_key] = f"{field.label} is required."
            continue

        if empty:
            continue

        if field.field_type == 'number':
            try:
                num = float(val)
                min_val = field.config.get('min')
                max_val = field.config.get('max')
                if min_val is not None and num < float(min_val):
                    errors[field.field_key] = f"Must be ≥ {min_val}."
                elif max_val is not None and num > float(max_val):
                    errors[field.field_key] = f"Must be ≤ {max_val}."
            except (TypeError, ValueError):
                errors[field.field_key] = "Must be a number."

        elif field.field_type == 'dropdown':
            options = field.config.get('options', [])
            if val not in options:
                errors[field.field_key] = "Invalid option."

        elif field.field_type == 'checkbox':
            # Stored as free-form JSON, so clients have sent True, "true" and 1
            # for the same tick. A guided-process stage can be configured to
            # skip on this value, so normalise it rather than let "false" route
            # as truthy.
            coerced = as_bool(val)
            if coerced is None:
                errors[field.field_key] = "Must be true or false."
            else:
                values[field.field_key] = coerced

    if errors:
        raise serializers.ValidationError({'custom_fields': errors})


# Feature flag for the guided work-item process.
# See design/work-item-detail-redesign/ROLLOUT_AND_ROLLBACK.md
GUIDED_PROCESS_FLAG = 'workitem.guided_process'


def guided_process_enabled(tenant) -> bool:
    """Whether the guided work-item process is enabled for this tenant.

    Backed by the per-tenant ``Setting`` (global default + tenant override), so it
    can be flipped on/off per tenant with no deploy. Defaults to ``False`` — the
    legacy status flow is unchanged until a tenant is explicitly opted in.
    """
    from core.models import Setting
    if tenant is None:
        return False
    return bool(Setting.get_value(GUIDED_PROCESS_FLAG, tenant=tenant, default=False))