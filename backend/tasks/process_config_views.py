"""Process configuration API (§7D) — what Settings → Work item process talks to.

Deliberately **not** behind `GuidedProcessGateMixin`: an admin has to be able to
build the process before switching the flag on, so these routes answer whether
or not the guided flow is live for the tenant. Reads need tenant membership,
writes need `manage_process`.

Everything here inherits `TenantScopedMixin`, which is what
`tenants.test_route_coverage` requires and what stops a stage id from one shop
being edited by another.
"""
from django.db import transaction
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.mixins import TenantScopedMixin
from core.permissions import ManageProcessPermission, TenantUserMatchesRequestTenant

from .models import (
    CheckpointField, ProcessTemplate, StageDefinition, StageOutcome, WorkItem,
)
from .process_config_serializers import (
    CheckpointFieldConfigSerializer, ProcessTemplateSerializer,
    StageDefinitionConfigSerializer, StageOutcomeConfigSerializer,
)

WRITE_ACTIONS = ('create', 'update', 'partial_update', 'destroy', 'reorder')


class ProcessConfigViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    """Shared gate: anyone in the tenant may read the process, only an admin
    may rewire it."""

    def get_permissions(self):
        if self.action in WRITE_ACTIONS:
            return [IsAuthenticated(), ManageProcessPermission()]
        return [IsAuthenticated(), TenantUserMatchesRequestTenant()]


class OrderedWithinParentMixin:
    """Filtering and reordering for rows whose `order` is only meaningful
    within one parent — stages within a process, outcomes within a stage."""
    parent_field = None

    def get_queryset(self):
        qs = super().get_queryset()
        parent_id = self.request.query_params.get(self.parent_field)
        if parent_id:
            qs = qs.filter(**{f'{self.parent_field}_id': parent_id})
        return qs

    @action(detail=False, methods=['post'], url_path='reorder')
    def reorder(self, request):
        """Body: {"<parent>": 1, "ordered_ids": [3, 1, 2]}.

        Ids outside the parent are ignored rather than rejected (same rule as
        PicklistAdminViewSet.reorder): another tenant's id simply isn't there.
        """
        parent_id = request.data.get(self.parent_field)
        if not parent_id:
            raise ValidationError(
                {self.parent_field: f'Name the {self.parent_field} to reorder within.'})
        ordered_ids = request.data.get('ordered_ids')
        if not isinstance(ordered_ids, list):
            raise ValidationError({'ordered_ids': 'Must be a list of ids.'})

        queryset = self.get_queryset().filter(**{f'{self.parent_field}_id': parent_id})
        known = set(queryset.values_list('id', flat=True))
        with transaction.atomic():
            for position, pk in enumerate(ordered_ids):
                if pk in known:
                    queryset.filter(pk=pk).update(order=position)
        return Response({'ordered_ids': [i for i in ordered_ids if i in known]})


class ProcessTemplateViewSet(ProcessConfigViewSet):
    queryset = ProcessTemplate.objects.all()
    serializer_class = ProcessTemplateSerializer


class StageDefinitionConfigViewSet(OrderedWithinParentMixin, ProcessConfigViewSet):
    queryset = StageDefinition.objects.select_related('process').all()
    serializer_class = StageDefinitionConfigSerializer
    tenant_field = 'process__tenant'
    parent_field = 'process'

    def perform_destroy(self, instance):
        """§7D's delete guard: repairs sitting on this stage cannot be left
        with no stage, so deleting it means saying where they go instead."""
        parked = WorkItem.objects.filter(current_stage=instance)
        count = parked.count()
        if count:
            move_to_id = (self.request.query_params.get('move_to')
                          or self.request.data.get('move_to'))
            if not move_to_id:
                raise ValidationError({'move_to': (
                    f"{count} work item(s) are on this stage. Choose a stage to "
                    f"move them to before deleting it.")})
            move_to = self.get_queryset().filter(
                pk=move_to_id, process_id=instance.process_id).first()
            if move_to is None:
                raise ValidationError(
                    {'move_to': 'Unknown stage in this process.'})
            if move_to.pk == instance.pk:
                raise ValidationError(
                    {'move_to': 'Move them to a different stage.'})
            with transaction.atomic():
                parked.update(current_stage=move_to)
                instance.delete()
            return
        instance.delete()


class StageOutcomeConfigViewSet(OrderedWithinParentMixin, ProcessConfigViewSet):
    queryset = StageOutcome.objects.select_related('stage', 'target_stage').all()
    serializer_class = StageOutcomeConfigSerializer
    tenant_field = 'stage__process__tenant'
    parent_field = 'stage'


class CheckpointFieldConfigViewSet(OrderedWithinParentMixin, ProcessConfigViewSet):
    queryset = CheckpointField.objects.select_related('stage', 'custom_field').all()
    serializer_class = CheckpointFieldConfigSerializer
    tenant_field = 'stage__process__tenant'
    parent_field = 'stage'
