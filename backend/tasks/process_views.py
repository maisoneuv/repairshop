"""API for the guided work-item process — thin HTTP over `process_service`.

Every endpoint here is **flag-gated** on `workitem.guided_process` for the
requesting tenant: with the flag off they 404, so the legacy status flow is
untouched for tenants that haven't opted in (see ROLLOUT_AND_ROLLBACK.md).

Layering: views validate input and resolve objects; **all stage state moves
live in `process_service`** — never mutate `current_stage` / `progress` /
`WorkItemPause` here.

Surfaces (design/work-item-detail-redesign/WORK_ITEM_DETAIL_MODEL.md §7E):
  POST /api/tasks/work-items/{id}/start|advance|pause|resolve/
  GET  /api/tasks/work-items/{id}/process/     — stepper + checkpoint + history
  GET  /api/tasks/my-work/                     — the queue, sectioned
  GET  /api/tasks/all-work-items/              — oversight list
  GET  /api/tasks/notifications/               — bell (unread first)
  POST /api/tasks/notifications/{id}/read/
"""
from django.db.models import Q
from rest_framework import generics, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from core.mixins import TenantScopedMixin
from core.utils import guided_process_enabled, validate_custom_field_values
from service.models import Employee

from . import process_service
from .models import Notification, StageDefinition, StageOutcome, WorkItem
from .process_serializers import (
    NotificationSerializer, QueueWorkItemSerializer, WorkItemProcessSerializer,
)
from .serializers import WorkItemSerializer

QUEUE_SELECT_RELATED = (
    'customer', 'owner__user', 'technician__user', 'current_stage', 'pause',
    'customer_asset__device',
)
# The row's state depends on whether its stage has any outcomes (a terminal
# stage reads as Done, not In progress) — prefetch or that's a query per row.
QUEUE_PREFETCH_RELATED = ('current_stage__outcomes',)


class GuidedProcessGateMixin:
    """404s the whole endpoint unless the tenant has the flag on.

    404 (not 403) on purpose: with the flag off these routes should look like
    they don't exist, so a stale frontend degrades to "feature absent".
    """

    def _require_flag(self):
        tenant = getattr(self.request, 'tenant', None)
        if not guided_process_enabled(tenant):
            raise NotFound("Guided process is not enabled for this tenant.")
        return tenant

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self._require_flag()


def current_employee(request):
    """The requesting user's Employee in the active tenant, or None.

    None for superusers browsing another tenant (they have no Employee row);
    the queue is empty for them, which is correct — it's a per-person view.
    """
    tenant = getattr(request, 'tenant', None)
    if tenant is None or not request.user.is_authenticated:
        return None
    return Employee.objects.filter(user=request.user, tenant=tenant).select_related('user').first()


def responsible_q(employee):
    """Q matching work items whose currently-responsible person is `employee`.

    Mirrors `process_service.responsible_employee` at the DB level, plus the
    pause rule: a **bounced** pause moves responsibility to the Owner (§7E).
    """
    bounced = Q(pause__reassigned=True)
    not_bounced = Q(pause__isnull=True) | Q(pause__reassigned=False)
    by_role = (
        Q(current_stage__owner_role='technician', technician=employee)
        | Q(current_stage__owner_role='owner', owner=employee)
    )
    return (bounced & Q(owner=employee)) | (not_bounced & by_role)


# --- checkpoint capture -----------------------------------------------------

def apply_captured_values(work_item, stage, values, request, enforce_required=True):
    """Persist a checkpoint's captured values before the stage moves.

    Only keys configured as `CheckpointField`s on `stage` are accepted — an
    unknown key is a client bug, not a silent no-op. Standard keys go through
    `WorkItemSerializer` (so tenant-scoped FK resolution, picklist and status
    -transition validation all still apply); custom keys are validated with
    `validate_custom_field_values` and merged into `custom_fields`.

    Returns the (possibly re-saved) work item.
    """
    values = values or {}
    if not isinstance(values, dict):
        raise ValidationError({'captured_values': 'Must be an object.'})

    fields = list(stage.checkpoint_fields.select_related('custom_field').all()) if stage else []
    standard_keys = {f.standard_key for f in fields if not f.custom_field_id and f.standard_key}
    custom_keys = {f.custom_field.field_key for f in fields if f.custom_field_id}

    unknown = set(values) - standard_keys - custom_keys
    if unknown:
        raise ValidationError({
            'captured_values': f"Not checkpoint fields of this stage: {', '.join(sorted(unknown))}."
        })

    missing = [
        f for f in fields
        if enforce_required and f.required
        and _checkpoint_value(work_item, f, values) in (None, '')
    ]
    if missing:
        raise ValidationError({'captured_values': {
            (f.custom_field.field_key if f.custom_field_id else f.standard_key): 'This field is required.'
            for f in missing
        }})

    if not values:
        return work_item

    tenant = getattr(request, 'tenant', None)
    custom_updates = {k: v for k, v in values.items() if k in custom_keys}
    standard_updates = {k: v for k, v in values.items() if k in standard_keys}

    if custom_updates:
        merged = dict(work_item.custom_fields or {})
        merged.update(custom_updates)
        # Validates the whole map (required custom fields included), as elsewhere.
        validate_custom_field_values(tenant, 'workitem', merged)
        standard_updates['custom_fields'] = merged

    if standard_updates:
        payload = {}
        for key, value in standard_updates.items():
            # FKs are writable on the serializer under their `_id` alias.
            field = WorkItem._meta.get_field(key) if key != 'custom_fields' else None
            if field is not None and field.is_relation:
                payload[f"{key}_id"] = value
            else:
                payload[key] = value
        serializer = WorkItemSerializer(
            work_item, data=payload, partial=True,
            context={'request': request, 'tenant': tenant},
        )
        serializer.is_valid(raise_exception=True)
        work_item = serializer.save()

    return work_item


def _checkpoint_value(work_item, field, values):
    """The value a required checkpoint field would end up with: the submitted
    one if present, otherwise what's already on the work item."""
    key = field.custom_field.field_key if field.custom_field_id else field.standard_key
    if key in values:
        return values[key]
    if field.custom_field_id:
        return (work_item.custom_fields or {}).get(key)
    return getattr(work_item, f"{key}_id", None) if _is_relation(key) else getattr(work_item, key, None)


def _is_relation(key):
    try:
        return WorkItem._meta.get_field(key).is_relation
    except Exception:
        return False


# --- work item actions ------------------------------------------------------

class GuidedProcessActionsMixin:
    """Guided-process actions, mixed into `WorkItemViewSet`.

    Reuses that viewset's tenant scoping, per-user visibility filtering and
    object lookup; only the guided endpoints are flag-gated (the mixin is not
    a `GuidedProcessGateMixin`, so the legacy CRUD routes stay open).
    """

    def _guided_work_item(self, request, require_change_permission=True):
        tenant = getattr(request, 'tenant', None)
        if not guided_process_enabled(tenant):
            raise NotFound("Guided process is not enabled for this tenant.")
        work_item = self.get_object()
        if require_change_permission:
            user = request.user
            if not user.is_superuser and not user.has_permission('tasks.change_workitem', tenant):
                raise PermissionDenied("You don't have permission to change work items.")
        return work_item

    def _process_response(self, work_item, request):
        # Re-read: the service moved the stage and may have cleared the pause,
        # so the in-memory instance (and its cached relations) is stale.
        fresh = WorkItem.objects.select_related(
            'current_stage__process', 'owner__user', 'technician__user', 'pause',
        ).get(pk=work_item.pk)
        return Response(WorkItemProcessSerializer(
            fresh,
            context={'request': request, 'tenant': getattr(request, 'tenant', None)},
        ).data)

    def _resolve_outcome(self, work_item, request, kinds):
        """Pull the StageOutcome named in the body, checking it belongs to the
        work item's current stage (so an outcome id can't jump stages)."""
        outcome_id = request.data.get('outcome_id')
        if outcome_id is None:
            return None
        if work_item.current_stage_id is None:
            raise ValidationError({'outcome_id': 'Work item is not on a stage.'})
        outcome = StageOutcome.objects.filter(
            pk=outcome_id, stage_id=work_item.current_stage_id,
        ).select_related('target_stage').first()
        if outcome is None:
            raise ValidationError({'outcome_id': 'Not an outcome of the current stage.'})
        if outcome.kind not in kinds:
            raise ValidationError({'outcome_id': f"Outcome is a '{outcome.kind}', expected {' or '.join(kinds)}."})
        return outcome

    @action(detail=True, methods=['get'], url_path='process')
    def process(self, request, pk=None):
        """The stage path, current state and history for this work item."""
        work_item = self._guided_work_item(request, require_change_permission=False)
        return self._process_response(work_item, request)

    @action(detail=True, methods=['post'], url_path='start')
    def start(self, request, pk=None):
        """Explicit claim from the queue's To-start inbox (§7E)."""
        work_item = self._guided_work_item(request)
        if work_item.current_stage_id is None:
            process_service.begin_process(work_item, by_user=request.user)
        else:
            process_service.start_stage(work_item, by_user=request.user)
        return self._process_response(work_item, request)

    @action(detail=True, methods=['post'], url_path='advance')
    def advance(self, request, pk=None):
        """Complete the checkpoint and move on — or send the repair back.

        Body: `{outcome_id | target_stage_id, captured_values: {}, note}`.
        Captured values are applied **first** — the stage only moves once the
        data it was there to collect is valid and stored.

        A `target_stage_id` earlier in the same process is a **correction**: it
        is recorded as `back`, and the current stage's required fields are not
        enforced, because you're abandoning that checkpoint rather than
        completing it.
        """
        work_item = self._guided_work_item(request)
        outcome = self._resolve_outcome(work_item, request, kinds=('advance', 'exit'))
        current_stage = work_item.current_stage

        target_stage = None
        target_id = request.data.get('target_stage_id')
        if outcome is None:
            if target_id is None:
                raise ValidationError({'outcome_id': 'Provide an outcome_id or a target_stage_id.'})
            target_stage = StageDefinition.objects.filter(
                pk=target_id, process__tenant=request.tenant,
            ).first()
            if target_stage is None:
                raise ValidationError({'target_stage_id': 'Unknown stage for this tenant.'})
            # Stages only mean anything within their own process.
            if current_stage and target_stage.process_id != current_stage.process_id:
                raise ValidationError(
                    {'target_stage_id': "Stage belongs to a different process."})
        elif outcome.target_stage_id is None:
            raise ValidationError({'outcome_id': 'This outcome has no target stage.'})

        moving_back = bool(
            target_stage and current_stage and target_stage.order < current_stage.order
        )

        captured = request.data.get('captured_values') or {}
        work_item = apply_captured_values(
            work_item, current_stage, captured, request,
            enforce_required=not moving_back)

        process_service.advance_stage(
            work_item, outcome=outcome, target_stage=target_stage,
            by_user=request.user, captured_values=captured,
            note=request.data.get('note', ''),
            kind='back' if moving_back else None,
        )
        return self._process_response(work_item, request)

    @action(detail=True, methods=['post'], url_path='save')
    def save_checkpoint(self, request, pk=None):
        """Persist checkpoint field values **without** moving the stage — save
        work in progress (a half-written diagnosis) and finish later.

        Body: `{captured_values: {}}`. Partial by design: required fields are
        not enforced (§12.3), so any subset of the stage's fields can be saved.
        """
        work_item = self._guided_work_item(request)
        captured = request.data.get('captured_values') or {}
        work_item = apply_captured_values(
            work_item, work_item.current_stage, captured, request,
            enforce_required=False)
        return self._process_response(work_item, request)

    @action(detail=True, methods=['post'], url_path='pause')
    def pause(self, request, pk=None):
        """Put the current stage on hold. Body: `{outcome_id | waiting_on, reason}`."""
        work_item = self._guided_work_item(request)
        outcome = self._resolve_outcome(work_item, request, kinds=('pause',))
        waiting_on = request.data.get('waiting_on')
        if outcome is None and not waiting_on:
            raise ValidationError({'waiting_on': 'Provide an outcome_id or a waiting_on.'})

        captured = request.data.get('captured_values') or {}
        # A pause keeps the stage, so partial capture is allowed — required
        # fields are only enforced on advance (§12.3).
        if captured:
            work_item = apply_captured_values(
                work_item, work_item.current_stage, captured, request,
                enforce_required=False)

        process_service.pause(
            work_item, outcome=outcome, waiting_on=waiting_on,
            reason=request.data.get('reason', ''),
            reassign_to_owner=bool(request.data.get('reassign_to_owner', False)),
            resolve_label=request.data.get('resolve_label', ''),
            by_user=request.user,
        )
        return self._process_response(work_item, request)

    @action(detail=True, methods=['post'], url_path='resolve')
    def resolve(self, request, pk=None):
        """Clear the active pause and return to In progress."""
        work_item = self._guided_work_item(request)
        process_service.resolve_pause(
            work_item, by_user=request.user, note=request.data.get('note', ''))
        return self._process_response(work_item, request)


# --- queues -----------------------------------------------------------------

class MyWorkView(GuidedProcessGateMixin, TenantScopedMixin, generics.ListAPIView):
    """"My work" (§7E) — work items where *I* am the responsible person,
    sectioned by the Progress axis. Items handed to someone else drop out of
    the list automatically, which is half the point of the queue."""
    queryset = WorkItem.objects.select_related(*QUEUE_SELECT_RELATED).prefetch_related(
        *QUEUE_PREFETCH_RELATED
    )
    serializer_class = QueueWorkItemSerializer
    filter_backends = []

    def get_queryset(self):
        qs = super().get_queryset().filter(current_stage__isnull=False)
        employee = current_employee(self.request)
        if employee is None:
            return qs.none()
        return qs.filter(responsible_q(employee)).distinct()

    def list(self, request, *args, **kwargs):
        items = list(self.get_queryset())
        employee = current_employee(request)
        ctx = self.get_serializer_context()

        def section(predicate):
            return QueueWorkItemSerializer(
                [i for i in items if predicate(i)], many=True, context=ctx).data

        paused = lambda i: getattr(i, 'pause', None) is not None  # noqa: E731
        return Response({
            'employee': (
                {'id': employee.id, 'name': str(employee)} if employee else None
            ),
            # Solo shops never see a To-start section — no handoff, no Pending.
            'to_start': section(lambda i: not paused(i) and i.progress == 'pending'),
            'in_progress': section(lambda i: not paused(i) and i.progress == 'in_progress'),
            'waiting': section(paused),
        })


class AllWorkItemsView(GuidedProcessGateMixin, TenantScopedMixin, generics.ListAPIView):
    """Oversight list (§7E): every guided work item with its stage, state and
    who it's currently with. Requires the tenant's view-all permission."""
    queryset = WorkItem.objects.select_related(*QUEUE_SELECT_RELATED).prefetch_related(
        *QUEUE_PREFETCH_RELATED
    )
    serializer_class = QueueWorkItemSerializer
    filter_backends = []

    def get_queryset(self):
        qs = super().get_queryset().filter(current_stage__isnull=False)
        user = self.request.user
        tenant = getattr(self.request, 'tenant', None)
        if user.is_superuser or not tenant:
            return qs.order_by('-created_date')
        if user.has_permission('view_all_workitems', tenant):
            return qs.order_by('-created_date')
        if user.has_permission('view_own_workitems', tenant):
            return qs.filter(
                Q(technician__user=user) | Q(owner__user=user)
            ).order_by('-created_date')
        return qs.none()


# --- notifications ----------------------------------------------------------

class NotificationViewSet(GuidedProcessGateMixin, TenantScopedMixin,
                          viewsets.ReadOnlyModelViewSet):
    """The bell (§7E). Only the recipient ever reads their own notifications —
    tenant scoping alone would leak a colleague's queue nudges."""
    queryset = Notification.objects.select_related('work_item')
    serializer_class = NotificationSerializer
    filter_backends = []

    def get_queryset(self):
        qs = super().get_queryset()
        employee = current_employee(self.request)
        if employee is None:
            return qs.none()
        qs = qs.filter(recipient=employee)
        if self.request.query_params.get('unread') == 'true':
            qs = qs.filter(read=False)
        # Unread first, newest first within each group.
        return qs.order_by('read', '-created_at')

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        return Response({
            'results': response.data,
            'unread_count': self.get_queryset().filter(read=False).count(),
        })

    @action(detail=True, methods=['post'], url_path='read')
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        if not notification.read:
            notification.read = True
            notification.save(update_fields=['read'])
        return Response(self.get_serializer(notification).data)

    @action(detail=False, methods=['post'], url_path='read-all')
    def mark_all_read(self, request):
        updated = self.get_queryset().filter(read=False).update(read=True)
        return Response({'marked_read': updated})
