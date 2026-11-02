"""Write serializers for the process configuration UI (§7D).

Separate from `process_serializers`, which renders the process *for a repair*
and writes nothing. These are the other direction: a shop admin editing the
template itself. The render shapes there are derived (a checkpoint field's
`key`/`label`/`type` come from the model field it points at), so they cannot be
written back through — these serializers work on the real columns instead.

`Model.clean()` carries the guards that stop an admin pointing a skip rule or a
recap source at something that does not exist, and DRF does not call it. Every
serializer here runs `full_clean()` so the API is held to the same rules as the
Django admin form.
"""
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from core.models import CustomField
from core.serializer_fields import TenantScopedPrimaryKeyRelatedField

from .models import (
    CheckpointField, ProcessTemplate, StageDefinition, StageOutcome, WorkItem,
)


class FullCleanMixin:
    """Run the model's own validation, mapping it onto serializer fields.

    `full_clean_extra` supplies fields the view injects rather than the payload
    (the tenant), so uniqueness constraints spanning them are still checked
    instead of being excluded and surfacing later as a 500.
    """

    def full_clean_extra(self):
        return {}

    def validate(self, attrs):
        attrs = super().validate(attrs)
        extra = self.full_clean_extra()
        if self.instance is None:
            instance = self.Meta.model(**{**attrs, **extra})
        else:
            # A fresh copy, so a failed validation leaves the serializer's own
            # instance untouched.
            instance = self.Meta.model.objects.get(pk=self.instance.pk)
            for key, value in {**attrs, **extra}.items():
                setattr(instance, key, value)
        try:
            instance.full_clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict if hasattr(exc, 'message_dict') else exc.messages)
        return attrs


class ProcessTemplateSerializer(FullCleanMixin, serializers.ModelSerializer):
    class Meta:
        model = ProcessTemplate
        fields = ['id', 'name', 'is_default', 'created_at']
        read_only_fields = ['id', 'created_at']

    def full_clean_extra(self):
        return {'tenant': self.context.get('tenant')}


class StageDefinitionConfigSerializer(FullCleanMixin, serializers.ModelSerializer):
    process = TenantScopedPrimaryKeyRelatedField(
        queryset=ProcessTemplate.objects.all(), tenant_field='tenant')
    work_item_count = serializers.SerializerMethodField()

    class Meta:
        model = StageDefinition
        fields = ['id', 'process', 'key', 'name', 'status_value', 'owner_role',
                  'guidance', 'recap_sources', 'skip_when', 'order',
                  'work_item_count']
        read_only_fields = ['id']

    def get_work_item_count(self, obj):
        """How many repairs are sitting here right now — what the delete guard
        turns on, and worth showing before an admin edits a busy stage."""
        return WorkItem.objects.filter(current_stage=obj).count()


class StageOutcomeConfigSerializer(FullCleanMixin, serializers.ModelSerializer):
    stage = TenantScopedPrimaryKeyRelatedField(
        queryset=StageDefinition.objects.all(), tenant_field='process__tenant')
    target_stage = TenantScopedPrimaryKeyRelatedField(
        queryset=StageDefinition.objects.all(), tenant_field='process__tenant',
        required=False, allow_null=True)

    class Meta:
        model = StageOutcome
        fields = ['id', 'stage', 'kind', 'label', 'target_stage', 'waiting_on',
                  'reassign_to_owner', 'resume_returns_to', 'resolve_label',
                  'order']
        read_only_fields = ['id']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        merged = {**self._current(), **attrs}
        kind, target = merged.get('kind'), merged.get('target_stage')
        # An advance with nowhere to go dead-ends the repair: the button
        # renders, and pressing it 400s from process_views.
        if kind in ('advance', 'exit') and target is None:
            raise serializers.ValidationError(
                {'target_stage': f"An outcome of kind '{kind}' needs a target stage."})
        if kind == 'advance' and merged.get('stage') and target:
            if target.process_id != merged['stage'].process_id:
                raise serializers.ValidationError(
                    {'target_stage': "Target stage belongs to a different process."})
        if kind == 'pause' and not merged.get('waiting_on'):
            raise serializers.ValidationError(
                {'waiting_on': "A pause has to say who it is waiting on."})
        return attrs

    def _current(self):
        if self.instance is None:
            return {}
        return {
            'kind': self.instance.kind,
            'stage': self.instance.stage,
            'target_stage': self.instance.target_stage,
            'waiting_on': self.instance.waiting_on,
        }


class CheckpointFieldConfigSerializer(FullCleanMixin, serializers.ModelSerializer):
    stage = TenantScopedPrimaryKeyRelatedField(
        queryset=StageDefinition.objects.all(), tenant_field='process__tenant')
    custom_field = TenantScopedPrimaryKeyRelatedField(
        queryset=CustomField.objects.all(), tenant_field='tenant',
        required=False, allow_null=True)

    class Meta:
        model = CheckpointField
        fields = ['id', 'stage', 'custom_field', 'standard_key', 'required', 'order']
        read_only_fields = ['id']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        merged = {**self._current(), **attrs}
        custom_field, standard_key = merged.get('custom_field'), merged.get('standard_key')
        if bool(custom_field) == bool(standard_key):
            raise serializers.ValidationError(
                "Point a checkpoint field at either a custom field or a "
                "standard work item column, not both and not neither.")
        if standard_key:
            try:
                WorkItem._meta.get_field(standard_key)
            except Exception:
                raise serializers.ValidationError(
                    {'standard_key': f'WorkItem has no field "{standard_key}".'})
        return attrs

    def _current(self):
        if self.instance is None:
            return {}
        return {
            'custom_field': self.instance.custom_field,
            'standard_key': self.instance.standard_key,
        }
