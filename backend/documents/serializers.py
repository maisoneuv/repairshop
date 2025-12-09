"""
DRF serializers for form templates and documents.
"""
from rest_framework import serializers
from django.conf import settings

from .models import FormTemplate, FormDocument


class FormTemplateListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing templates"""

    form_type_display = serializers.CharField(source='get_form_type_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = FormTemplate
        fields = [
            'id',
            'name',
            'form_type',
            'form_type_display',
            'is_active',
            'created_at',
            'updated_at',
            'created_by_name',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_created_by_name(self, obj):
        """Get name of user who created the template"""
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.email
        return None


class FormTemplateSerializer(serializers.ModelSerializer):
    """Full serializer for template CRUD operations"""

    form_type_display = serializers.CharField(source='get_form_type_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)

    class Meta:
        model = FormTemplate
        fields = [
            'id',
            'tenant',
            'tenant_name',
            'form_type',
            'form_type_display',
            'name',
            'html_content',
            'is_active',
            'created_at',
            'updated_at',
            'created_by',
            'created_by_name',
        ]
        read_only_fields = ['tenant', 'created_at', 'updated_at', 'created_by']

    def get_created_by_name(self, obj):
        """Get name of user who created the template"""
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.email
        return None

    def create(self, validated_data):
        """Set tenant and created_by on creation"""
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['created_by'] = request.user
            # Tenant should be set by view/permission
            if hasattr(request.user, 'tenant'):
                validated_data['tenant'] = request.user.tenant
        return super().create(validated_data)


class FormDocumentSerializer(serializers.ModelSerializer):
    """Serializer for form documents with download URL"""

    form_type_display = serializers.CharField(source='get_form_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    generated_by_name = serializers.SerializerMethodField()
    template_name = serializers.CharField(source='template.name', read_only=True)
    work_item_reference = serializers.CharField(source='work_item.reference_id', read_only=True)
    download_url = serializers.SerializerMethodField()
    is_auto_generated = serializers.ReadOnlyField()

    class Meta:
        model = FormDocument
        fields = [
            'id',
            'tenant',
            'form_type',
            'form_type_display',
            'template',
            'template_name',
            'work_item',
            'work_item_reference',
            'file_path',
            'download_url',
            'generated_at',
            'generated_by',
            'generated_by_name',
            'is_auto_generated',
            'status',
            'status_display',
            'error_message',
        ]
        read_only_fields = [
            'tenant',
            'file_path',
            'generated_at',
            'generated_by',
            'status',
            'error_message',
        ]

    def get_generated_by_name(self, obj):
        """Get name of user who generated the document"""
        if obj.generated_by:
            return obj.generated_by.get_full_name() or obj.generated_by.email
        return 'Auto-generated'

    def get_download_url(self, obj):
        """Generate download URL for the PDF"""
        if obj.status == FormDocument.STATUS_SUCCESS and obj.file_path:
            request = self.context.get('request')
            if request:
                # Build absolute URL
                return request.build_absolute_uri(f"{settings.MEDIA_URL}{obj.file_path}")
            # Fallback to relative URL
            return f"{settings.MEDIA_URL}{obj.file_path}"
        return None


class GenerateFormDocumentSerializer(serializers.Serializer):
    """Serializer for manual form document generation request"""

    form_type = serializers.ChoiceField(
        choices=FormTemplate.FORM_TYPES,
        default=FormTemplate.FORM_TYPE_INTAKE,
        help_text="Type of form to generate"
    )
    template_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="Optional: Specific template ID. If not provided, uses active template for form type"
    )

    def validate_template_id(self, value):
        """Validate that template exists and belongs to correct tenant"""
        if value is not None:
            request = self.context.get('request')
            work_item = self.context.get('work_item')

            try:
                template = FormTemplate.objects.get(id=value)

                # Verify template belongs to same tenant as work item
                if work_item and template.tenant != work_item.tenant:
                    raise serializers.ValidationError(
                        "Template does not belong to the same tenant as the work item"
                    )

            except FormTemplate.DoesNotExist:
                raise serializers.ValidationError("Template not found")

        return value


class AvailableVariablesSerializer(serializers.Serializer):
    """Serializer for returning available template variables"""

    category = serializers.CharField()
    variables = serializers.ListField(child=serializers.CharField())
    description = serializers.CharField(required=False)

    @staticmethod
    def get_variables_list():
        """
        Get structured list of all available template variables.

        Returns:
            list: List of variable categories with their variables
        """
        return [
            {
                'category': 'Customer',
                'description': 'Customer information',
                'variables': [
                    '{{customer.full_name}}',
                    '{{fio}}',
                    '{{customer.first_name}}',
                    '{{customer.last_name}}',
                    '{{customer.phone}}',
                    '{{phone}}',
                    '{{customer.email}}',
                    '{{email}}',
                    '{{customer.address}}',
                    '{{customer.tax_code}}',
                ]
            },
            {
                'category': 'Work Item',
                'description': 'Work item details',
                'variables': [
                    '{{workitem.reference_id}}',
                    '{{id}}',
                    '{{workitem.created_date}}',
                    '{{now}}',
                    '{{order_data}}',
                    '{{workitem.status}}',
                    '{{workitem.type}}',
                    '{{workitem.priority}}',
                    '{{workitem.description}}',
                    '{{defect}}',
                    '{{workitem.device_condition}}',
                    '{{comment}}',
                    '{{workitem.accessories}}',
                    '{{complect}}',
                    '{{workitem.prepaid_amount}}',
                    '{{prepay}}',
                    '{{workitem.estimated_price}}',
                    '{{workitem.final_price}}',
                ]
            },
            {
                'category': 'Device/Asset',
                'description': 'Customer device information',
                'variables': [
                    '{{asset.device_name}}',
                    '{{product}}',
                    '{{asset.serial_number}}',
                    '{{serial}}',
                ]
            },
            {
                'category': 'Staff',
                'description': 'Staff members',
                'variables': [
                    '{{owner.full_name}}',
                    '{{accepter}}',
                    '{{technician.full_name}}',
                ]
            },
            {
                'category': 'Locations',
                'description': 'Dropoff and pickup locations',
                'variables': [
                    '{{dropoff.name}}',
                    '{{dropoff.address}}',
                    '{{pickup.name}}',
                    '{{pickup.address}}',
                ]
            },
            {
                'category': 'Dates',
                'description': 'Current date and time',
                'variables': [
                    '{{today}}',
                    '{{current_date}}',
                    '{{current_datetime}}',
                    '{{current_time}}',
                ]
            },
        ]
