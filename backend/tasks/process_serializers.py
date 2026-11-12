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
from core.utils import PICKLIST_FIELDS, get_field_type

from .models import (
    RECAP_ITEM_KEY, RECAP_NOTE_KEY, CheckpointField, split_recap_source, Notification, ProcessTemplate,
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
        category = PICKLIST_FIELDS['WorkItem'].get(field.name)
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


def landing_map(stage_defs, work_item):
    """Where an advance to each stage really lands for this repair, once stages
    that don't apply to it are passed over.

    Mirrors `process_service.landing_stage` against an already-fetched stage
    list, so the outcome buttons can name their true destination without a
    query each. Must stay in step with it, including "never skip off the end".
    """
    landing = {}
    for i, stage in enumerate(stage_defs):
        tail = stage_defs[i:]
        landing[stage.id] = next(
            (s for s in tail if s.applies_to(work_item)), tail[-1])
    return landing


class StageOutcomeSerializer(serializers.ModelSerializer):
    target_stage_key = serializers.CharField(source='target_stage.key', default=None, read_only=True)
    target_stage_name = serializers.CharField(source='target_stage.name', default=None, read_only=True)
    # Where it goes for THIS repair. Labels say what the action is ("Finish
    # diagnosis"); the destination is the app's to render, because a label
    # naming a stage goes stale the moment that stage is skipped, renamed or
    # reordered — and the process is editable live.
    effective_target_stage_key = serializers.SerializerMethodField()
    effective_target_stage_name = serializers.SerializerMethodField()

    class Meta:
        model = StageOutcome
        fields = ['id', 'kind', 'label', 'target_stage', 'target_stage_key',
                  'target_stage_name', 'effective_target_stage_key',
                  'effective_target_stage_name', 'waiting_on',
                  'reassign_to_owner', 'resume_returns_to', 'resolve_label',
                  'order']

    def _effective(self, obj):
        if obj.target_stage_id is None:
            return None
        mapping = self.context.get('landing_by_stage_id') or {}
        return mapping.get(obj.target_stage_id) or obj.target_stage

    def get_effective_target_stage_key(self, obj):
        stage = self._effective(obj)
        return stage.key if stage else None

    def get_effective_target_stage_name(self, obj):
        stage = self._effective(obj)
        return stage.name if stage else None


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
        stage_key, field_key = split_recap_source(entry)
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


# --- route ------------------------------------------------------------------

def _user_name(user):
    if user is None:
        return None
    return f"{user.first_name} {user.last_name}".strip() or user.username


def skipped_stage_defs(stage, transitions):
    """The stages this repair jumped clean over, as StageDefinitions.

    Two things produce a jump, and they look identical afterwards: a stage that
    doesn't apply to this repair (a warranty job has nothing to quote) and an
    Exit that bails forward past the work. Both leave stages nobody did.

    Only stages inside a real forward jump count. A repair backfilled onto the
    process at a late stage never visited the earlier ones either, but it
    didn't skip them — it predates the guided flow, and striking those through
    would be its own kind of lie.

    A jump that was later rewound stops counting, for the same reason
    `build_route` drops a rewound exit: the repair is doing that stretch over
    again, so those stages are ahead of it now, not behind it unmade.
    """
    if stage is None:
        return []

    # `transitions` is newest-first, so everything before index i happened after
    # transition i.
    spans = []
    for i, t in enumerate(transitions):
        if not (t.from_stage_id and t.to_stage_id):
            continue
        if t.to_stage.order <= t.from_stage.order + 1:
            continue
        later = transitions[:i]
        if any(x.kind == 'back' and x.to_stage is not None
               and x.to_stage.order <= t.from_stage.order
               for x in later):
            continue
        # A visit only cancels this jump if it came AFTER it. A repair that was
        # sent back and re-run passes over the stage again, and its entry on
        # the earlier pass doesn't make that second pass any less of a skip.
        spans.append((
            t.from_stage.order, t.to_stage.order,
            {x.to_stage_id for x in later if x.to_stage_id is not None},
        ))
    if not spans:
        return []

    candidates = StageDefinition.objects.filter(
        process_id=stage.process_id,
        order__gt=min(a for a, _, _ in spans),
        # Nothing ahead of where the repair is now was skipped — it simply
        # hasn't been reached yet.
        order__lt=min(stage.order, max(b for _, b, _ in spans)),
    ).order_by('order')
    return [
        s for s in candidates
        if any(a < s.order < b and s.id not in seen for a, b, seen in spans)
    ]


def _brief_stages(defs, work_item=None):
    """`reason` separates the two kinds of skip: a stage that never applied to
    this repair reads differently from one an Exit bailed past, and the peek
    should say which. `reason_label` says *why* it didn't apply, in the words
    the admin wrote on the rule ("Repaired during diagnosis")."""
    rows = []
    for s in defs:
        row = {'key': s.key, 'name': s.name}
        reason_label = s.skip_reason(work_item) if work_item is not None else None
        if reason_label is not None:
            row['reason'] = 'not_applicable'
            row['reason_label'] = reason_label
        rows.append(row)
    return rows


def build_route(stage, transitions, skipped_defs=()):
    """How this repair got where it is, when it got there by an Exit (§5).

    An Exit means the repair jumped forward over stages that never happened —
    declined at Quote, or unfixable at Repair. Every other surface treats that
    as ordinary progress (the stepper marks the jumped stages done, the recap
    carries a price with no work behind it), so the exit has to travel with the
    item or the next person reads a repair that went fine.

    Nothing to configure: `kind == 'exit'` already carries the meaning.
    Returns None when the repair took the normal road.

    `transitions` is newest-first and capped by the caller (50), so a repair
    with more moves than that loses the oldest of them — which only matters
    for an exit that far back, by which point the skip list is guesswork anyway.
    """
    if stage is None:
        return None

    exit_at = next((i for i, t in enumerate(transitions) if t.kind == 'exit'), None)
    if exit_at is None:
        return None
    exit_t = transitions[exit_at]
    if exit_t.from_stage is None or exit_t.to_stage is None:
        return None

    # A correction back to the stage the exit left from (or earlier) rewinds the
    # route: the decline is being redone, so it no longer describes where we are.
    for t in transitions[:exit_at]:
        if (t.kind == 'back' and t.to_stage is not None
                and t.to_stage.order <= exit_t.from_stage.order):
            return None

    # Only what THIS exit jumped — a warranty skip earlier in the repair is on
    # the stepper, but it isn't something the decline caused.
    skipped = _brief_stages([
        s for s in skipped_defs
        if exit_t.from_stage.order < s.order < exit_t.to_stage.order
    ])

    label = exit_t.outcome_label or exit_t.note or 'Exited'
    note = (exit_t.note or '').strip()
    return {
        'kind': exit_t.kind,
        'label': label,
        # Only when it says something the label doesn't: with no note typed,
        # `note` is a copy of the label and repeating it reads as a stutter.
        'note': note if note and note != label else None,
        'from_stage_key': exit_t.from_stage.key,
        'from_stage_name': exit_t.from_stage.name,
        'to_stage_name': exit_t.to_stage.name,
        'at': exit_t.at,
        'by': _user_name(exit_t.by_user),
        'skipped': skipped,
    }


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
                  'to_stage_name', 'by_user_name', 'at', 'note', 'outcome_label',
                  'captured_values', 'assigned_at', 'started_at']

    def get_by_user_name(self, obj):
        return _user_name(obj.by_user) if obj.by_user_id else None


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
            # Materialised before serializing: the outcome buttons resolve their
            # real destination against this same list, so no stage is re-fetched.
            stage_defs = list(process.stages.prefetch_related(
                'outcomes__target_stage', 'checkpoint_fields__custom_field',
            ).order_by('order'))
            ctx['landing_by_stage_id'] = landing_map(stage_defs, work_item)
            stages = StageDefinitionSerializer(
                stage_defs, many=True, context=ctx,
            ).data

        # Materialised once: the recap reads stage notes out of the same rows
        # the timeline renders, so this must not be two queries.
        transitions = list(
            work_item.stage_transitions
            .select_related('from_stage', 'to_stage', 'by_user')
            .order_by('-at')[:50]
        )
        skipped_defs = skipped_stage_defs(stage, transitions)

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
            'skipped': _brief_stages(skipped_defs, work_item),
            'route': build_route(stage, transitions, skipped_defs),
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
