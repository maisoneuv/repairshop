from rest_framework import serializers
from .models import Call
from tasks.models import WorkItem


class WorkItemSummarySerializer(serializers.ModelSerializer):
    device = serializers.SerializerMethodField()
    summary = serializers.SerializerMethodField()

    class Meta:
        model = WorkItem
        fields = ['reference_id', 'status', 'device', 'summary']

    def get_device(self, obj):
        if obj.customer_asset and obj.customer_asset.device:
            d = obj.customer_asset.device
            parts = filter(None, [d.manufacturer, d.model])
            return " ".join(parts) or None
        return None

    def get_summary(self, obj):
        return obj.summary or obj.description or ''


class CallSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    lead_name = serializers.SerializerMethodField()
    work_items = serializers.SerializerMethodField()

    class Meta:
        model = Call
        fields = ['id', 'type', 'phone_number', 'customer', 'lead',
                  'customer_name', 'lead_name', 'work_items',
                  'created_at', 'handled_at', 'notes', 'duration', 'status']

    def get_customer_name(self, obj):
        if obj.customer:
            return f"{obj.customer.first_name} {obj.customer.last_name or ''}".strip()
        return None

    def get_lead_name(self, obj):
        if obj.lead:
            return f"{obj.lead.first_name} {obj.lead.last_name or ''}".strip()
        return None

    def get_work_items(self, obj):
        if not obj.customer:
            return []
        qs = WorkItem.objects.filter(
            tenant=obj.tenant,
            customer=obj.customer,
        ).exclude(status='Resolved').select_related('customer_asset__device').order_by('-created_date')
        if not qs.exists():
            # Brak aktywnych — zwróć ostatnie zamknięte
            qs = WorkItem.objects.filter(
                tenant=obj.tenant,
                customer=obj.customer,
                status='Resolved',
            ).select_related('customer_asset__device').order_by('-closed_date')[:1]
        return WorkItemSummarySerializer(qs, many=True).data


class CallUpdateSerializer(serializers.Serializer):
    duration = serializers.IntegerField(required=False, min_value=0, allow_null=True)
    status = serializers.CharField(required=False, allow_blank=True, max_length=30)
    note = serializers.CharField(required=False, allow_blank=True)
