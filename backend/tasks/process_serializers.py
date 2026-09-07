"""Read serializers for the guided work-item process.

Render-only shapes for the stepper, the checkpoint panel, the queue and the
notification bell. Nothing here writes — all state moves go through
`tasks.process_service` (see `process_views.py`).

Behind the `workitem.guided_process` flag; see
design/work-item-detail-redesign/WORK_ITEM_DETAIL_MODEL.md §7A/§7E.
"""
from django.core.exceptions import FieldDoesNotExist
from django.db import models as django_models
from rest_framework import serializers

from core.models import PicklistValue
from core.utils import get_field_type

from .models import (
    RECAP_ITEM_KEY, RECAP_NOTE_KEY, CheckpointField, Notification, ProcessTemplate,
    StageDefinition, StageOutcome, StageTransition, WorkItem, WorkItemPause,
)


def _display(obj):
    """A label that is never blank.

    Employee.__str__ is "first last", which is empty for accounts that never
    filled those in — and a blank name in a queue row or a checkpoint field
    reads as missing data rather than as an unnamed person.
    """
    if obj is None:
        return None
    label = str(obj).strip()
    if label:
        return label
    user = getattr(obj, 'user', None)
    if user is not None:
        return user.get_username() or user.email or f"{type(obj).__name__} {obj.pk}"
    return f"{type(obj).__name__} {obj.pk}"


def _employee_brief(employee, role=''):
    if employee is None:
        return None
    return {
        'id': employee.id,
        'name': _display(employee),
        'role': role or employee.role,
    }


# --- process definition -----------------------------------------------------

class CheckpointFieldSerializer(serializers.ModelSerializer):
    """One row of a stage's checkpoint panel.

    `source` tells the client where the value lives: a `standard` key is a
    WorkItem column, a `custom` key is a `core.CustomField` stored in
    `WorkItem.custom_fields`. Type metadata comes from the model field /
    CustomField definition so the panel can pick a widget without a second call.
    """
    source = serializers.SerializerMethodField()
    key = serializers.SerializerMethodField()
    label = serializers.SerializerMethodField()
    type = serializers.SerializerMethodField()
    config = serializers.SerializerMethodField()
    value = serializers.SerializerMethodField()

    class Meta:
        model = CheckpointField
        fields = ['id', 'source', 'key', 'label', 'type', 'config', 'required',
                  'order', 'value']

    def _model_field(self, obj):
        if obj.custom_field_id or not obj.standard_key:
            return None
        try:
            return WorkItem._meta.get_field(obj.standard_key)
        except Exception:
            return None

    def get_source(self, obj):
        return 'custom' if obj.custom_field_id else 'standard'

    def get_key(self, obj):
        return obj.custom_field.field_key if obj.custom_field_id else obj.standard_key

    def get_label(self, obj):
        if obj.custom_field_id:
            return obj.custom_field.label
        field = self._model_field(obj)
        if field is not None:
            return str(field.verbose_name).capitalize()
        return obj.standard_key.replace('_', ' ').capitalize()

    def get_type(self, obj):
        if obj.custom_field_id:
            return obj.custom_field.field_type
        field = self._model_field(obj)
        if field is None:
            return 'string'
        if isinstance(field, (django_models.ForeignKey, django_models.OneToOneField)):
            return 'foreignkey'
        return get_field_type(field)

    def get_config(self, obj):
        """Widget hints: dropdown options, picklist choices, related model."""
        if obj.custom_field_id:
            return obj.custom_field.config or {}
        field = self._model_field(obj)
        if field is None:
            return {}
        if isinstance(field, (django_models.ForeignKey, django_models.OneToOneField)):
            return {
                'related_model': field.related_model.__name__,
                'related_app': field.related_model._meta.app_label,
            }
        # Tenant picklists win over hardcoded choices (same rule as get_model_schema).
        tenant = self.context.get('tenant')
        category = {'status': 'workitem_status', 'currency': 'currency'}.get(field.name)
        if category and tenant:
            return {'choices': list(
                PicklistValue.objects
                .filter(tenant=tenant, category=category, is_active=True)
                .order_by('sort_order', 'name')
                .values_list('value', 'name')
            )}
        if field.choices:
            return {'choices': list(field.choices)}
        return {}

    def get_value(self, obj):
        """Current value on the work item, so the panel can prefill.

        Null when the endpoint was called without a work item in context.
        """
        work_item = self.context.get('work_item')
        if work_item is None:
            return None
        if obj.custom_field_id:
            return (work_item.custom_fields or {}).get(obj.custom_field.field_key)
        field = self._model_field(obj)
        if field is None:
            return None
        if isinstance(field, (django_models.ForeignKey, django_models.OneToOneField)):
            related = getattr(work_item, obj.standard_key, None)
            if related is None:
                return None
            return {'id': related.pk, 'label': _display(related)}
        return getattr(work_item, obj.standard_key, None)


class StageOutcomeSerializer(serializers.ModelSerializer):
    target_stage_key = serializers.CharField(source='target_stage.key', default=None, read_only=True)
    target_stage_name = serializers.CharField(source='target_stage.name', default=None, read_only=True)

    class Meta:
        model = StageOutcome
        fields = ['id', 'kind', 'label', 'target_stage', 'target_stage_key',
                  'target_stage_name', 'waiting_on', 'reassign_to_owner',
                  'resume_returns_to', 'resolve_label', 'order']


def _is_terminal(stage):
    """A stage with no way out is the end of the road (the seeded 'Closed').
    Work sitting there isn't 'in progress' — it's done."""
    return stage is not None and not stage.outcomes.all().exists()


def _state_of(work_item, stage, pause):
    """The single label every surface shows for "where is this right now":
    waiting (paused) → done (terminal stage) → the Progress axis."""
    if pause:
        return 'waiting'
    if _is_terminal(stage):
        return 'done'
    return work_item.progress


class StageDefinitionSerializer(serializers.ModelSerializer):
    outcomes = StageOutcomeSerializer(many=True, read_only=True)
    checkpoint_fields = CheckpointFieldSerializer(many=True, read_only=True)
    is_terminal = serializers.SerializerMethodField()

    class Meta:
        model = StageDefinition
        fields = ['id', 'key', 'name', 'status_value', 'owner_role', 'guidance',
                  'order', 'is_terminal', 'outcomes', 'checkpoint_fields']

    def get_is_terminal(self, obj):
        return _is_terminal(obj)


class ProcessTemplateSerializer(serializers.ModelSerializer):
    stages = StageDefinitionSerializer(many=True, read_only=True)

    class Meta:
        model = ProcessTemplate
        fields = ['id', 'name', 'is_default', 'stages']


# --- recap ------------------------------------------------------------------

def _completion_note(stage, transitions):
    """The note left on the way *out* of `stage`.

    `transitions` arrives newest-first, so the first match is the most recent
    departure — which is what a repair that bounced back and forth should show.
    """
    for t in transitions:
        if (t.from_stage_id == stage.id
                and t.kind in ('advance', 'exit')
                and (t.note or '').strip()):
            return t.note.strip()
    return None


# WorkItem columns whose model verbose_name reads as nothing in particular once
# it is lifted out of the form it was written for. Kept in step with the Fields
# tab's registry (frontend/src/features/WorkItems/detail/fieldRegistry.js).
RECAP_ITEM_LABELS = {
    'description': 'Reported issue',
    'accessories': 'Accessories received',
}


def _is_empty(value):
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, dict):  # an FK, serialized as {id, label}
        return value.get('id') is None
    return False


def build_recap(work_item, stage, transitions, context):
    """The "what to base this on" rows for a stage's checkpoint (§7).

    Resolves `stage.recap_sources` — see the field's help text for the syntax —
    against what this work item actually captured. Blank values are dropped
    rather than rendered as empty rows, so the card hides itself on a repair
    that hasn't reached those stages yet.
    """
    if stage is None or not stage.recap_sources:
        return []

    by_key = {
        s.key: s for s in
        StageDefinition.objects.filter(process_id=stage.process_id)
        .prefetch_related('checkpoint_fields__custom_field')
    }
    ctx = dict(context, work_item=work_item)
    rows = []
    seen = set()

    def add_field(source, field):
        data = CheckpointFieldSerializer(field, context=ctx).data
        key = f"{source.key}.{data['key']}"
        if key in seen or _is_empty(data['value']):
            return
        seen.add(key)
        rows.append({'key': key, 'label': data['label'],
                     'type': data['type'], 'value': data['value']})

    def add_item_field(field_key):
        """A column on the work item itself — intake data no stage captures."""
        key = f"{RECAP_ITEM_KEY}.{field_key}"
        if key in seen:
            return
        try:
            WorkItem._meta.get_field(field_key)
        except FieldDoesNotExist:
            return
        # An unsaved CheckpointField so label/type/value resolve exactly the way
        # they do for a captured field — the recap row shouldn't look different
        # just because the value arrived at intake.
        data = CheckpointFieldSerializer(
            CheckpointField(standard_key=field_key), context=ctx).data
        if _is_empty(data['value']):
            return
        seen.add(key)
        rows.append({'key': key,
                     'label': RECAP_ITEM_LABELS.get(field_key, data['label']),
                     'type': data['type'], 'value': data['value']})

    def add_note(source):
        key = f"{source.key}.{RECAP_NOTE_KEY}"
        note = _completion_note(source, transitions)
        if key in seen or not note:
            return
        seen.add(key)
        rows.append({'key': key, 'label': f"{source.name} notes",
                     'type': 'text', 'value': note})

    for entry in stage.recap_sources:
        if not isinstance(entry, str):
            continue
        stage_key, _, field_key = entry.partition('.')
        if stage_key == RECAP_ITEM_KEY:
            if field_key:
                add_item_field(field_key)
            continue
        source = by_key.get(stage_key)
        if source is None:
            continue
        if not field_key:
            # A whole stage: what it captured, then how it was summed up.
            for field in source.checkpoint_fields.all():
                add_field(source, field)
            add_note(source)
        elif field_key == RECAP_NOTE_KEY:
            add_note(source)
        else:
            for field in source.checkpoint_fields.all():
                name = (field.custom_field.field_key if field.custom_field_id
                        else field.standard_key)
                if name == field_key:
                    add_field(source, field)
                    break
    return rows


# --- work item state --------------------------------------------------------

class WorkItemPauseSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkItemPause
        fields = ['waiting_on', 'reason', 'since', 'held_by', 'reassigned',
                  'resolve_label']


class StageTransitionSerializer(serializers.ModelSerializer):
    from_stage_name = serializers.CharField(source='from_stage.name', default=None, read_only=True)
    to_stage_name = serializers.CharField(source='to_stage.name', default=None, read_only=True)
    by_user_name = serializers.SerializerMethodField()

    class Meta:
        model = StageTransition
        fields = ['id', 'kind', 'from_stage', 'from_stage_name', 'to_stage',
                  'to_stage_name', 'by_user_name', 'at', 'note',
                  'captured_values', 'assigned_at', 'started_at']

    def get_by_user_name(self, obj):
        if obj.by_user_id is None:
            return None
        full = f"{obj.by_user.first_name} {obj.by_user.last_name}".strip()
        return full or obj.by_user.username


class WorkItemProcessSerializer(serializers.Serializer):
    """Everything the detail page needs to draw the stage path + checkpoint.

    One call: the whole process (for the stepper), which stage the item is on,
    its Progress/Pause sub-state, who holds it, and the transition history.
    """
    def to_representation(self, work_item):
        from .process_service import responsible_employee

        stage = work_item.current_stage
        # Not started yet: fall back to the tenant's default process — the one
        # `begin_process` would put it on — so the UI can still draw the path
        # ahead instead of an empty band.
        process = stage.process if stage else ProcessTemplate.objects.filter(
            tenant=work_item.tenant, is_default=True,
        ).first()
        pause = getattr(work_item, 'pause', None)
        ctx = dict(self.context, work_item=work_item)

        stages = []
        if process is not None:
            stages = StageDefinitionSerializer(
                process.stages.prefetch_related(
                    'outcomes__target_stage', 'checkpoint_fields__custom_field',
                ).order_by('order'),
                many=True, context=ctx,
            ).data

        # Materialised once: the recap reads stage notes out of the same rows
        # the timeline renders, so this must not be two queries.
        transitions = list(
            work_item.stage_transitions
            .select_related('from_stage', 'to_stage', 'by_user')
            .order_by('-at')[:50]
        )

        return {
            'process': {'id': process.id, 'name': process.name} if process else None,
            'stages': stages,
            'current_stage': stage.id if stage else None,
            'current_stage_key': stage.key if stage else None,
            'progress': work_item.progress,
            'state': _state_of(work_item, stage, pause),
            'pause': WorkItemPauseSerializer(pause).data if pause else None,
            'responsible': _employee_brief(
                work_item.owner if (pause and pause.reassigned)
                else responsible_employee(work_item, stage),
                role='owner' if (pause and pause.reassigned) else (stage.owner_role if stage else ''),
            ),
            'recap': build_recap(work_item, stage, transitions, ctx),
            'transitions': StageTransitionSerializer(
                transitions, many=True, context=ctx,
            ).data,
        }


class QueueWorkItemSerializer(serializers.ModelSerializer):
    """A row in "My work" / "All work items" (§7E) — enough to triage without
    opening the item: which stage (the color-coded pill), what state it's in,
    and who it's currently with."""
    customer_name = serializers.SerializerMethodField()
    device_name = serializers.SerializerMethodField()
    stage = serializers.SerializerMethodField()
    state = serializers.SerializerMethodField()
    pause = WorkItemPauseSerializer(read_only=True)
    responsible = serializers.SerializerMethodField()

    class Meta:
        model = WorkItem
        fields = ['id', 'reference_id', 'description', 'customer_name',
                  'device_name', 'stage', 'progress', 'state', 'pause',
                  'responsible', 'priority', 'due_date', 'created_date', 'status']

    def get_customer_name(self, obj):
        # Customer has no `name` column — full_name()/__str__ is the display.
        return str(obj.customer) if obj.customer_id else None

    def get_device_name(self, obj):
        device = getattr(getattr(obj, 'customer_asset', None), 'device', None)
        if device is None:
            return None
        return f"{device.manufacturer or ''} {device.model or ''}".strip() or None

    def get_stage(self, obj):
        stage = obj.current_stage
        if stage is None:
            return None
        return {'id': stage.id, 'key': stage.key, 'name': stage.name,
                'owner_role': stage.owner_role}

    def get_state(self, obj):
        return _state_of(obj, obj.current_stage, getattr(obj, 'pause', None))

    def get_responsible(self, obj):
        from .process_service import responsible_employee

        pause = getattr(obj, 'pause', None)
        if pause is not None and pause.reassigned:
            return _employee_brief(obj.owner, role='owner')
        stage = obj.current_stage
        return _employee_brief(
            responsible_employee(obj, stage),
            role=stage.owner_role if stage else '',
        )


class NotificationSerializer(serializers.ModelSerializer):
    work_item_reference = serializers.CharField(
        source='work_item.reference_id', default=None, read_only=True)

    class Meta:
        model = Notification
        fields = ['id', 'type', 'text', 'read', 'created_at', 'work_item',
                  'work_item_reference']
        read_only_fields = fields
